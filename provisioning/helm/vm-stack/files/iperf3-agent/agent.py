import json
import os
import errno
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


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

print(f"✅ ENVS=[{json.dumps(ENVS, indent=2)}]", flush=True)

print("👉 Start iperf3 server", flush=True)
iperf3_server = subprocess.Popen(
    ["iperf3", "-s", "-p", str(ENVS["IPERF3_SERVER_PORT"])],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=None,
)
print(f"✅ iperf3 server started with pid=[{iperf3_server.pid}]", flush=True)

TEST_LOCK = threading.Lock()


def write_json_response(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    try:
        handler.send_response(status_code)
        handler.send_header("content-type", "application/json")
        handler.send_header("content-length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        print("⚠️ Client disconnected before response was sent", flush=True)
    except OSError as error:
        if error.errno == errno.EPIPE:
            print("⚠️ Client disconnected before response was sent", flush=True)
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
        "50M",
        "--json",
    ]

    print(
        f"👉 Run iperf3 test to target=[{target}] startedAt=[{started_at}] "
        f"args=[{' '.join(args)}]",
        flush=True,
    )

    try:
        process = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=ENVS["IPERF3_TIMEOUT_SECONDS"],
        )
    except subprocess.TimeoutExpired as error:
        print(
            f"❌ Timeout=[{ENVS['IPERF3_TIMEOUT_SECONDS']}] expired, close test process",
            flush=True,
        )
        return {
            "ok": False,
            "error": "timeout",
            "target": target,
            "port": ENVS["IPERF3_SERVER_PORT"],
            "periodSeconds": ENVS["IPERF3_PERIOD_SECONDS"],
            "timeoutSeconds": ENVS["IPERF3_TIMEOUT_SECONDS"],
            "durationSeconds": time.time() - started_at,
            "stdout": error.stdout,
            "stderr": error.stderr,
        }

    common_response_fields = {
        "target": target,
        "port": ENVS["IPERF3_SERVER_PORT"],
        "periodSeconds": ENVS["IPERF3_PERIOD_SECONDS"],
        "timeoutSeconds": ENVS["IPERF3_TIMEOUT_SECONDS"],
        "durationSeconds": time.time() - started_at,
    }

    print(
        f"🏁 Test process closed with code=[{process.returncode}]",
        flush=True,
    )

    if process.returncode != 0:
        print("❌ Test process error", flush=True)
        return {
            "ok": False,
            "error": "iperf3_failed",
            **common_response_fields,
            "exitCode": process.returncode,
            "stdout": process.stdout,
            "stderr": process.stderr,
        }

    print("✅ Test process success", flush=True)
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
            print("⚠️ Client disconnected before response was sent", flush=True)

    def do_GET(self):
        url = urlparse(self.path)

        if url.path != "/healthz":
            write_json_response(self, 404, {"ok": False, "error": "not_found"})
            print("❌ Respond 404 to health request", flush=True)
            return

        if iperf3_server.poll() is None:
            write_json_response(self, 200, {"ok": True})
        else:
            write_json_response(self, 500, {"ok": False, "error": "iperf3 server is not running"})
            print("❌ Respond error to health check", flush=True)

    def do_POST(self):
        url = urlparse(self.path)
        print(f"👉 Request to server url=[{url.geturl()}] method=[POST]", flush=True)

        if url.path != "/check":
            write_json_response(self, 404, {"ok": False, "error": "not_found"})
            print("❌ Respond 404", flush=True)
            return

        try:
            input_body = read_json_request(self)
            print(f"✅ JSON request is ready=[{json.dumps(input_body, indent=2)}]", flush=True)
            target = input_body.get("target")

            if not target:
                write_json_response(self, 400, {"ok": False, "error": "target is required"})
                print("❌ Respond 400 as there is no target in the request", flush=True)
                return

            if not TEST_LOCK.acquire(blocking=False):
                write_json_response(self, 409, {"ok": False, "error": "test_already_running"})
                print("❌ Respond 409 as another iperf3 test is already running", flush=True)
                return

            try:
                result = run_iperf3(target)
            finally:
                TEST_LOCK.release()

            print(
                f"{'✅' if result['ok'] else '❌'} Respond result=[{json.dumps(result, indent=2)}]",
                flush=True,
            )
            write_json_response(self, 200 if result["ok"] else 500, result)
        except Exception as error:
            print(f"❌ Respond error=[{error}]", flush=True)
            write_json_response(self, 500, {"ok": False, "error": str(error)})

    def log_message(self, format, *args):
        return


print("👉 Create server", flush=True)
print(
    f"iperf3 agent listening on :{ENVS['AGENT_PORT']}, "
    f"iperf3 server on :{ENVS['IPERF3_SERVER_PORT']}",
    flush=True,
)
ThreadingHTTPServer(("0.0.0.0", ENVS["AGENT_PORT"]), Handler).serve_forever()
