import json
import errno
import logging
import time
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer


class _JsonFormatter(logging.Formatter):
    _PINO_LEVELS = {
        logging.DEBUG: 20,
        logging.INFO: 30,
        logging.WARNING: 40,
        logging.ERROR: 50,
        logging.CRITICAL: 60,
    }

    def format(self, record):
        return json.dumps({
            "level": self._PINO_LEVELS.get(record.levelno, 30),
            "time": int(record.created * 1000),
            "name": record.name,
            "msg": record.getMessage(),
        }, ensure_ascii=False)


_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())
logging.root.setLevel(logging.INFO)
logging.root.addHandler(_handler)

logger = logging.getLogger("iperf3-scheduler")


with open("/app/config.json", "r", encoding="utf-8") as config_file:
    CONFIG = json.load(config_file)

STATE_LOCK = threading.Lock()
RESULTS = {}
FAILURES = {}
TESTS_TOTAL = {}
SCHEDULER_STATE = {
    "running": False,
    "currentTest": "",
    "lastRunTimestampSeconds": 0,
}


def labels_to_string(labels):
    return ",".join(f'{key}="{escape_label(value)}"' for key, value in labels.items())


def escape_label(value):
    return str(value).replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def test_key(source, target):
    return f"{source};{target}"


def unix_seconds():
    return int(time.time())


def write_json_response(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    write_response(handler, status_code, "application/json", body)


def write_response(handler, status_code, content_type, body):
    try:
        handler.send_response(status_code)
        handler.send_header("content-type", content_type)
        handler.send_header("content-length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        logger.error("❌ Client disconnected before response was sent")
    except OSError as error:
        if error.errno == errno.EPIPE:
            logger.error("❌ Client disconnected before response was sent")
            return
        raise


def summarize_failure(source, target, result):
    agent_response = result.get("agentResponse", {})
    reason = result.get("error") or agent_response.get("error") or "unknown"
    iperf3_error = agent_response.get("iperf3Error")
    status_code = result.get("statusCode")
    exit_code = agent_response.get("exitCode")
    duration = result.get("schedulerDurationSeconds", 0)
    agent_duration = agent_response.get("durationSeconds", 0)
    target_resolution = agent_response.get("targetResolution", {})
    resolved_addresses = target_resolution.get("addresses", [])
    resolved = ",".join(address["address"] for address in resolved_addresses) or "unknown"
    server_state = agent_response.get("serverState", {})

    fields = [
        f"test=[{source}->{target}]",
        f"reason=[{reason}]",
        f"httpStatus=[{status_code}]" if status_code is not None else None,
        f"exitCode=[{exit_code}]" if exit_code is not None else None,
        f"iperf3Error=[{iperf3_error}]" if iperf3_error else None,
        f"targetAddresses=[{resolved}]",
        f"agentServerRunning=[{server_state.get('running', 'unknown')}]",
        f"schedulerDurationSeconds=[{duration:.3f}]",
        f"agentDurationSeconds=[{agent_duration:.3f}]",
    ]

    return " ".join(field for field in fields if field is not None)


def run_scheduler():
    tests = CONFIG["tests"]
    pause_between_tests = CONFIG["pauseBetweenTestsSeconds"]

    logger.info(f"✅ Scheduler config=[{json.dumps(CONFIG, indent=2)}]")

    while True:
        for test in tests:
            source = test["source"]
            target = test["target"]
            current_test = f"{source}->{target}"

            with STATE_LOCK:
                SCHEDULER_STATE["running"] = True
                SCHEDULER_STATE["currentTest"] = current_test

            logger.info(f"👉 Run scheduled test=[{current_test}]")
            result = call_agent(source, target)
            store_result(source, target, result)

            if result["ok"]:
                logger.info("✅ Test successfully finished")
            else:
                logger.error(f"❌ Test failed summary: {summarize_failure(source, target, result)}")
                logger.error(f"❌ Test error: {json.dumps(result, indent=2)}")

            with STATE_LOCK:
                SCHEDULER_STATE["running"] = False
                SCHEDULER_STATE["currentTest"] = ""
                SCHEDULER_STATE["lastRunTimestampSeconds"] = unix_seconds()

            time.sleep(pause_between_tests)


def call_agent(source, target):
    started_at = time.time()
    url = f"http://iperf3-agent-{source}:{CONFIG['agentPort']}/check"
    body = json.dumps({"target": target}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=CONFIG["requestTimeoutSeconds"]) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return {
                "ok": payload.get("ok") is True,
                "agentResponse": payload,
                "schedulerDurationSeconds": time.time() - started_at,
            }
    except urllib.error.HTTPError as error:
        payload_text = error.read().decode("utf-8")
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            payload = {"raw": payload_text}

        return {
            "ok": False,
            "error": "agent_http_error",
            "statusCode": error.code,
            "agentResponse": payload,
            "schedulerDurationSeconds": time.time() - started_at,
        }
    except Exception as error:
        return {
            "ok": False,
            "error": type(error).__name__,
            "message": str(error),
            "schedulerDurationSeconds": time.time() - started_at,
        }


def store_result(source, target, result):
    key = test_key(source, target)
    timestamp = unix_seconds()
    agent_response = result.get("agentResponse", {})
    iperf3_result = agent_response.get("iperf3", {})
    end = iperf3_result.get("end", {})
    sum_sent = end.get("sum_sent", {})
    sum_received = end.get("sum_received", {})

    stored_result = {
        "source": source,
        "target": target,
        "ok": result["ok"],
        "timestampSeconds": timestamp,
        "schedulerDurationSeconds": result["schedulerDurationSeconds"],
        "agentDurationSeconds": agent_response.get("durationSeconds", 0),
        "sentBytes": sum_sent.get("bytes", 0),
        "sentSeconds": sum_sent.get("seconds", 0),
        "sentBitsPerSecond": sum_sent.get("bits_per_second", 0),
        "receivedBytes": sum_received.get("bytes", 0),
        "receivedSeconds": sum_received.get("seconds", 0),
        "receivedBitsPerSecond": sum_received.get("bits_per_second", 0),
        "retransmits": sum_sent.get("retransmits", 0),
    }

    with STATE_LOCK:
        RESULTS[key] = stored_result
        result_label = "success" if result["ok"] else "failure"
        total_key = f"{key};{result_label}"
        TESTS_TOTAL[total_key] = TESTS_TOTAL.get(total_key, 0) + 1

        if not result["ok"]:
            reason = result.get("error") or agent_response.get("error") or "unknown"
            failure_key = f"{key};{reason}"
            FAILURES[failure_key] = FAILURES.get(failure_key, 0) + 1


def render_metrics():
    with STATE_LOCK:
        results = list(RESULTS.values())
        failures = dict(FAILURES)
        tests_total = dict(TESTS_TOTAL)
        scheduler_state = dict(SCHEDULER_STATE)

    lines = [
        "# HELP iperf3_up Whether the latest scheduled iperf3 test succeeded.",
        "# TYPE iperf3_up gauge",
        "# HELP iperf3_sent_bits_per_second Sent throughput reported by iperf3.",
        "# TYPE iperf3_sent_bits_per_second gauge",
        "# HELP iperf3_received_bits_per_second Received throughput reported by iperf3.",
        "# TYPE iperf3_received_bits_per_second gauge",
        "# HELP iperf3_retransmits TCP retransmits reported by iperf3.",
        "# TYPE iperf3_retransmits gauge",
        "# HELP iperf3_test_last_run_timestamp_seconds Unix timestamp of the latest scheduled test.",
        "# TYPE iperf3_test_last_run_timestamp_seconds gauge",
        "# HELP iperf3_test_duration_seconds Latest scheduler-side test duration.",
        "# TYPE iperf3_test_duration_seconds gauge",
        "# HELP iperf3_agent_test_duration_seconds Latest agent-side test duration.",
        "# TYPE iperf3_agent_test_duration_seconds gauge",
        "# HELP iperf3_test_failures_total Failed scheduled iperf3 tests.",
        "# TYPE iperf3_test_failures_total counter",
        "# HELP iperf3_tests_total Scheduled iperf3 tests.",
        "# TYPE iperf3_tests_total counter",
        "# HELP iperf3_scheduler_running Whether scheduler is currently running a test.",
        "# TYPE iperf3_scheduler_running gauge",
        "# HELP iperf3_scheduler_last_run_timestamp_seconds Unix timestamp of the last scheduler operation.",
        "# TYPE iperf3_scheduler_last_run_timestamp_seconds gauge",
    ]

    for result in results:
        labels = labels_to_string({"source": result["source"], "target": result["target"]})
        lines.append(f"iperf3_up{{{labels}}} {1 if result['ok'] else 0}")
        lines.append(f"iperf3_sent_bits_per_second{{{labels}}} {result['sentBitsPerSecond']}")
        lines.append(f"iperf3_received_bits_per_second{{{labels}}} {result['receivedBitsPerSecond']}")
        lines.append(f"iperf3_retransmits{{{labels}}} {result['retransmits']}")
        lines.append(f"iperf3_test_last_run_timestamp_seconds{{{labels}}} {result['timestampSeconds']}")
        lines.append(f"iperf3_test_duration_seconds{{{labels}}} {result['schedulerDurationSeconds']}")
        lines.append(f"iperf3_agent_test_duration_seconds{{{labels}}} {result['agentDurationSeconds']}")

    for key, value in failures.items():
        source, target, reason = key.split(";", 2)
        labels = labels_to_string({"source": source, "target": target, "reason": reason})
        lines.append(f"iperf3_test_failures_total{{{labels}}} {value}")

    for key, value in tests_total.items():
        source, target, result = key.split(";", 2)
        labels = labels_to_string({"source": source, "target": target, "result": result})
        lines.append(f"iperf3_tests_total{{{labels}}} {value}")

    scheduler_labels = labels_to_string({"current_test": scheduler_state["currentTest"]})
    lines.append(f"iperf3_scheduler_running{{{scheduler_labels}}} {1 if scheduler_state['running'] else 0}")
    lines.append(f"iperf3_scheduler_last_run_timestamp_seconds {scheduler_state['lastRunTimestampSeconds']}")

    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            write_json_response(self, 200, {"ok": True})
            return

        if self.path == "/metrics":
            body = render_metrics().encode("utf-8")
            write_response(self, 200, "text/plain; version=0.0.4; charset=utf-8", body)
            return

        write_json_response(self, 404, {"ok": False, "error": "not_found"})

    def log_message(self, format, *args):
        return


threading.Thread(target=run_scheduler, daemon=True).start()
logger.info(f"✅ iperf3 scheduler metrics listening on :{CONFIG['metricsPort']}")
HTTPServer(("0.0.0.0", CONFIG["metricsPort"]), Handler).serve_forever()
