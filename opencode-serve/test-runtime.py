"""Process integration checks for container startup and credential handling."""
import base64
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RuntimeTests(unittest.TestCase):
    def test_startup_requires_password(self):
        with tempfile.TemporaryDirectory() as home:
            result = subprocess.run(
                ["bash", str(ROOT / "opencode-serve/start.sh")],
                env={"PATH": os.environ["PATH"], "OPENCODE_WORKDIR": home},
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b"OPENCODE_PASSWORD is required", result.stderr)

    def test_bot_credentials_and_private_config(self):
        with tempfile.TemporaryDirectory() as home:
            binary = Path(home, "opencode-telegram")
            binary.write_text("#!/bin/sh\nexit 0\n")
            binary.chmod(0o700)
            env = {
                "PATH": home + ":" + os.environ["PATH"], "HOME": home,
                "TELEGRAM_BOT_TOKEN": "test-token", "TELEGRAM_ALLOWED_USER_ID": "123",
                "OPENCODE_SERVER_PASSWORD": "test-password", "OPENCODE_MODEL_PROVIDER": "openrouter",
                "OPENCODE_MODEL_ID": "anthropic/claude-haiku-4.5",
            }
            config = Path(home, ".config/opencode-telegram-bot/.env")
            config.parent.mkdir(parents=True)
            config.write_text("old-config")
            config.chmod(0o644)
            result = subprocess.run(
                ["sh", str(ROOT / "opencode-telegram-bot/entrypoint.sh")],
                env=env, capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            config = Path(home, ".config/opencode-telegram-bot/.env")
            text = config.read_text()
            for expected in (
                "OPENCODE_SERVER_VERSION=v2", "OPENCODE_SERVER_USERNAME=opencode",
                "OPENCODE_SERVER_PASSWORD=test-password", "OPENCODE_AUTO_RESTART_ENABLED=false",
            ):
                self.assertIn(expected + "\n", text)
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(b"test-password", result.stdout + result.stderr)

    def test_probe_authentication_and_response_validation(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            status = 200
            payload = {"pid": 123, "version": "2.2.3"}
            def do_GET(self):
                expected = "Basic " + base64.b64encode(b"opencode:test-password").decode()
                authenticated = self.headers.get("Authorization") == expected
                self.send_response(self.status if authenticated else 401)
                self.end_headers()
                self.wfile.write(json.dumps(self.payload).encode())
            def log_message(self, *args):
                pass

        with http.server.HTTPServer(("127.0.0.1", 0), Handler) as server:
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                source = (ROOT / "opencode-serve/healthcheck.cjs").read_text().replace(
                    "127.0.0.1:4096", "127.0.0.1:" + str(server.server_port)
                )
                for password, status, payload, healthy in (
                    ("test-password", 200, {"pid": 123, "version": "2.2.3"}, True),
                    ("wrong", 200, {"pid": 123, "version": "2.2.3"}, False),
                    ("", 200, {"pid": 123, "version": "2.2.3"}, False),
                    ("test-password", 503, {"pid": 123, "version": "2.2.3"}, False),
                    ("test-password", 200, {"healthy": True}, False),
                ):
                    with self.subTest(password=bool(password), status=status, healthy=healthy):
                        Handler.status, Handler.payload = status, payload
                        result = subprocess.run(
                            ["node", "-e", source],
                            env={"PATH": os.environ["PATH"], "OPENCODE_PASSWORD": password},
                            capture_output=True, timeout=8,
                        )
                        self.assertEqual(result.returncode == 0, healthy)
                        self.assertEqual(result.stdout + result.stderr, b"")
            finally:
                server.shutdown()
                worker.join()


if __name__ == "__main__":
    unittest.main()
