"""Test the published web client against OMP without sending a model request."""
import json
import os
import signal
import subprocess
import tempfile
import time
import urllib.request

BASE_URL = "http://127.0.0.1:30177"


def request(path, payload=None, method=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE_URL + path, data=data, method=method, headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)


def start(env):
    proc = subprocess.Popen(["ompweb"], env=env, start_new_session=True)
    deadline = time.monotonic() + 60
    while True:
        try:
            assert isinstance(request("/api/sessions")["sessions"], list)
            return proc
        except OSError:
            if proc.poll() is not None or time.monotonic() >= deadline:
                stop(proc)
                raise
            time.sleep(0.2)


def stop(proc):
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()


with tempfile.TemporaryDirectory() as home:
    agent_dir = os.path.join(home, ".omp", "agent")
    os.makedirs(agent_dir)
    with open(os.path.join(agent_dir, "config.yml"), "w") as config:
        config.write("modelRoles:\n  default: openrouter/anthropic/claude-haiku-4.5\n")
    env = dict(
        os.environ, HOME=home, PI_CODING_AGENT_DIR=agent_dir,
        OPENROUTER_API_KEY="smoke-test-not-a-real-key",
        OMP_WEB_HOSTNAME="127.0.0.1", OMP_WEB_NO_OPEN="1",
        OMP_WEB_DISABLE_AUTOUPDATE="1", PORT="30177",
    )
    web = start(env)
    try:
        session = request("/api/agent/new", {
            "cwd": home, "type": "ensure_session", "toolNames": [],
        })
        assert session["success"], session
        session_id = session["sessionId"]
        path = "/api/agent/" + session_id
        result = request(path, {
            "type": "set_model", "provider": "openrouter",
            "modelId": "anthropic/claude-sonnet-4.6",
        })
        assert result["success"], result
        state = request(path)["state"]
        assert state["model"]["id"] == "anthropic/claude-sonnet-4.6", state
        assert request(path, {"type": "bash", "command": "printf smoke"})["success"]
        assert request("/api/model-roles", {"roles": {"default": "openrouter/anthropic/claude-sonnet-4.6"}}, "PUT")["success"]
    finally:
        stop(web)

    web = start(env)
    try:
        roles = request("/api/model-roles")
        assert roles["roles"]["default"] == "openrouter/anthropic/claude-sonnet-4.6", roles
    finally:
        stop(web)
print("OMP Web: new session, model switch and persisted-settings restart passed")
