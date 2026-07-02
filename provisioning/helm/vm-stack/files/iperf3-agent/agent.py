import json
import logging
import os
import errno
import subprocess
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


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

logger = logging.getLogger("iperf3-agent")


def number_from_env(name):
    value = os.environ.get(name)

    if not value:
        raise RuntimeError(f"Missing required environment variable [{name}]")

    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"Invalid integer value=[{value}]") from error

    if parsed < 1:
        raise RuntimeError(f"Invalid integer value=[{value}]")

    return parsed


ENVS = {
    "AGENT_PORT": number_from_env("AGENT_PORT"),
    "IPERF3_SERVER_PORT": number_from_env("IPERF3_SERVER_PORT"),
    "IPERF3_PERIOD_SECONDS": number_from_env("IPERF3_PERIOD_SECONDS"),
    "IPERF3_TIMEOUT_SECONDS": number_from_env("IPERF3_TIMEOUT_SECONDS"),
}

logger.info(f"✅ ENVS=[{json.dumps(ENVS, indent=2)}]")

logger.info("👉 Start iperf3 server")
iperf3_server = subprocess.Popen(
    ["iperf3", "-s", "-p", str(ENVS["IPERF3_SERVER_PORT"])],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=None,
)
logger.info(f"✅ iperf3 server started with pid=[{iperf3_server.pid}]")

TEST_LOCK = threading.Lock()


def preview_text(value, limit=2000):
    if value is None:
        return None

    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")

    if len(value) <= limit:
        return value

    return value[:limit] + f"... truncated {len(value) - limit} chars"


def resolve_target(target):
    try:
        addresses = socket.getaddrinfo(target, ENVS["IPERF3_SERVER_PORT"], type=socket.SOCK_STREAM)
    except OSError as error:
        return {
            "ok": False,
            "error": type(error).__name__,
            "message": str(error),
        }

    resolved = []
    for family, _socktype, _proto, _canonname, sockaddr in addresses:
        resolved.append(
            {
                "family": socket.AddressFamily(family).name,
                "address": sockaddr[0],
                "port": sockaddr[1],
            }
        )

    return {
        "ok": True,
        "addresses": resolved,
    }


def iperf3_server_state():
    exit_code = iperf3_server.poll()
    return {
        "pid": iperf3_server.pid,
        "running": exit_code is None,
        "exitCode": exit_code,
    }


def parse_iperf3_output(stdout):
    if not stdout:
        return {}

    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError as error:
        return {
            "parseError": str(error),
            "stdoutPreview": preview_text(stdout),
        }

    return {
        "iperf3": parsed,
        "iperf3Error": parsed.get("error"),
        "connected": parsed.get("start", {}).get("connected", []),
        "connectingTo": parsed.get("start", {}).get("connecting_to", {}),
        "tcpMssDefault": parsed.get("start", {}).get("tcp_mss_default"),
        "intervalCount": len(parsed.get("intervals", [])),
    }


def write_json_response(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    try:
        handler.send_response(status_code)
        handler.send_header("content-type", "application/json")
        handler.send_header("content-length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        logger.warning("⚠️ Client disconnected before response was sent")
    except OSError as error:
        if error.errno == errno.EPIPE:
            logger.warning("⚠️ Client disconnected before response was sent")
            return
        raise


def read_json_request(handler):
    length = int(handler.headers.get("content-length", "0"))
    if length == 0:
        return {}

    return json.loads(handler.rfile.read(length).decode("utf-8"))


def run_iperf3(target):
    started_at = time.time()
    args = [
        "iperf3",
        "-c",
        target,
        "-p",
        str(ENVS["IPERF3_SERVER_PORT"]),
        "-t",
        str(ENVS["IPERF3_PERIOD_SECONDS"]),
        "-b",
        "20M",
        "--json",
    ]

    logger.info(
        f"👉 Run iperf3 test to target=[{target}] startedAt=[{started_at}] "
        f"args=[{' '.join(args)}]",
    )
    target_resolution = resolve_target(target)
    logger.info(
        f"🔎 Target resolution target=[{target}] result=[{json.dumps(target_resolution)}]",
    )

    try:
        process = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=ENVS["IPERF3_TIMEOUT_SECONDS"],
        )
    except subprocess.TimeoutExpired as error:
        logger.error(
            f"❌ Timeout=[{ENVS['IPERF3_TIMEOUT_SECONDS']}] expired, close test process",
        )
        return {
            "ok": False,
            "error": "timeout",
            "target": target,
            "port": ENVS["IPERF3_SERVER_PORT"],
            "periodSeconds": ENVS["IPERF3_PERIOD_SECONDS"],
            "timeoutSeconds": ENVS["IPERF3_TIMEOUT_SECONDS"],
            "durationSeconds": time.time() - started_at,
            "command": args,
            "targetResolution": target_resolution,
            "serverState": iperf3_server_state(),
            "stdout": preview_text(error.stdout),
            "stderr": preview_text(error.stderr),
        }

    common_response_fields = {
        "target": target,
        "port": ENVS["IPERF3_SERVER_PORT"],
        "periodSeconds": ENVS["IPERF3_PERIOD_SECONDS"],
        "timeoutSeconds": ENVS["IPERF3_TIMEOUT_SECONDS"],
        "durationSeconds": time.time() - started_at,
    }

    logger.info(
        f"🏁 Test process closed with code=[{process.returncode}]",
    )

    if process.returncode != 0:
        parsed_output = parse_iperf3_output(process.stdout)
        logger.error(
            "❌ Test process error "
            f"target=[{target}] exitCode=[{process.returncode}] "
            f"iperf3Error=[{parsed_output.get('iperf3Error')}] "
            f"connected=[{json.dumps(parsed_output.get('connected', []))}] "
            f"serverState=[{json.dumps(iperf3_server_state())}] "
            f"stderr=[{preview_text(process.stderr, 500)}]",
        )
        return {
            "ok": False,
            "error": "iperf3_failed",
            **common_response_fields,
            "exitCode": process.returncode,
            "command": args,
            "targetResolution": target_resolution,
            "serverState": iperf3_server_state(),
            **parsed_output,
            "stdout": preview_text(process.stdout),
            "stderr": preview_text(process.stderr),
        }

    logger.info("✅ Test process success")
    return {
        "ok": True,
        **common_response_fields,
        "iperf3": json.loads(process.stdout),
    }


class Handler(BaseHTTPRequestHandler):
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            logger.warning("⚠️ Client disconnected before response was sent")

    def do_GET(self):
        url = urlparse(self.path)

        if url.path != "/healthz":
            write_json_response(self, 404, {"ok": False, "error": "not_found"})
            logger.error("❌ Respond 404 to health request")
            return

        if iperf3_server.poll() is None:
            write_json_response(self, 200, {"ok": True})
        else:
            write_json_response(self, 500, {"ok": False, "error": "iperf3 server is not running"})
            logger.error("❌ Respond error to health check")

    def do_POST(self):
        url = urlparse(self.path)
        logger.info(f"👉 Request to server url=[{url.geturl()}] method=[POST]")

        if url.path != "/check":
            write_json_response(self, 404, {"ok": False, "error": "not_found"})
            logger.error("❌ Respond 404")
            return

        try:
            input_body = read_json_request(self)
            logger.info(f"✅ JSON request is ready=[{json.dumps(input_body, indent=2)}]")
            target = input_body.get("target")

            if not target:
                write_json_response(self, 400, {"ok": False, "error": "target is required"})
                logger.error("❌ Respond 400 as there is no target in the request")
                return

            if not TEST_LOCK.acquire(blocking=False):
                write_json_response(self, 409, {"ok": False, "error": "test_already_running"})
                logger.error("❌ Respond 409 as another iperf3 test is already running")
                return

            try:
                result = run_iperf3(target)
            finally:
                TEST_LOCK.release()

            if result["ok"]:
                logger.info(f"✅ Respond result=[{json.dumps(result, indent=2)}]")
            else:
                logger.error(f"❌ Respond result=[{json.dumps(result, indent=2)}]")
            write_json_response(self, 200 if result["ok"] else 500, result)
        except Exception as error:
            logger.error(f"❌ Respond error=[{error}]")
            write_json_response(self, 500, {"ok": False, "error": str(error)})

    def log_message(self, format, *args):
        return


logger.info("👉 Create server")
logger.info(
    f"iperf3 agent listening on :{ENVS['AGENT_PORT']}, "
    f"iperf3 server on :{ENVS['IPERF3_SERVER_PORT']}",
)
ThreadingHTTPServer(("0.0.0.0", ENVS["AGENT_PORT"]), Handler).serve_forever()
