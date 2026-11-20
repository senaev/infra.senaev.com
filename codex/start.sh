#!/bin/bash
set -euo pipefail
umask 077

workdir=/code
codex_home="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$codex_home"

# Written on each start, so a setting changed by hand is replaced. The container is the sandbox:
# Codex runs every command without approval and without its own sandbox (bubblewrap does not run
# in an unprivileged pod). The update check is off because the version is pinned in the image.
cat > "$codex_home/config.toml" <<TOML
approval_policy = "never"
sandbox_mode = "danger-full-access"
check_for_update_on_startup = false

[projects."$workdir"]
trust_level = "trusted"
TOML

# Codex reads AGENTS.md only from the git root down to the working folder, and /code is not a
# repository, so the workspace instructions go in as the global ones.
ln -sfn /AGENTS.md "$codex_home/AGENTS.md"

# The login is a ChatGPT login, so it cannot come from a secret. The Telegram helper of the
# claude-code pod logs in (/codex_auth), or by hand:
# kubectl exec -it deploy/<name>-codex -c codex -- codex login --device-auth
if ! codex login status > /dev/null 2>&1; then
    echo "Codex is not logged in. Waiting for a login: /codex_auth in Telegram, or codex login --device-auth"
    until codex login status > /dev/null 2>&1; do
        sleep 30
    done
    echo "Codex is logged in."
fi

# When off, the container only keeps the login. tini stops the sleep on SIGTERM.
if [ "${CODEX_REMOTE_CONTROL:-false}" != "true" ]; then
    echo "Remote control is off (codex.remoteControl). Nothing else runs."
    exec sleep infinity
fi

# The managed daemon: `codex remote-control pair` (the /codex_pair command of the Telegram helper,
# in the claude-code pod) talks only to it, through the control socket in CODEX_HOME, which both
# pods mount. The foreground server (--no-daemon) has no such socket.
daemon_dir="$codex_home/app-server-daemon"
mkdir -p "$daemon_dir"
# No automatic updates: the version is pinned in the image.
echo '{"remoteControlEnabled":true,"shutdownGraceSeconds":10,"updater":{"autoUpdateEnabled":false}}' > "$daemon_dir/settings.json"
# The daemon runs a copy of the CLI that it makes on its first start and keeps. It makes a new
# copy only when there is no package and none of these files (app-server-daemon/src/
# prepare_install.rs), so all of them go on each container start, and a new pinned version of
# the image takes effect. No daemon runs at this point: the container has just started.
rm -rf "$codex_home/packages/app-server-daemon"
rm -f "$daemon_dir/daemon.pid" "$daemon_dir/daemon.stderr.log" "$daemon_dir/daemon-updater.pid" "$daemon_dir/daemon-updater.stderr.log"

# The daemon logs to a file in CODEX_HOME; copy it to the output of the container for Datadog.
# -F waits for the file, which the daemon makes.
tail -n 0 -F "$daemon_dir/daemon.stderr.log" 2> /dev/null &

cd "$workdir"
child=
trap 'codex remote-control stop > /dev/null 2>&1 || true; [ -n "$child" ] && kill "$child" 2> /dev/null; exit 0' TERM INT
# The daemon keeps running when its connection fails and retries by itself; `start` then exits
# with an error, which is fine. This loop only starts it again when it is gone.
while true; do
    if ! codex app-server daemon version > /dev/null 2>&1; then
        echo "Starting the Codex app-server daemon with remote control."
        codex remote-control start < /dev/null 2>&1 || true
    fi
    sleep 60 &
    child=$!
    wait "$child" || true
    child=
done
