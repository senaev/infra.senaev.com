#!/bin/bash
# exec forwards signals directly to Codex.
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

# Remote control accepts only a ChatGPT login, so it cannot come from a secret.
# Log in once with: kubectl exec -it deploy/<name>-codex -c codex -- codex login --device-auth
if ! codex login status > /dev/null 2>&1; then
    echo "Codex is not logged in. Waiting for: codex login --device-auth"
    until codex login status > /dev/null 2>&1; do
        sleep 30
    done
    echo "Codex is logged in."
fi

# --no-daemon: one foreground app-server, the main process of the container. The managed daemon
# would detach from it and update itself past the pinned version.
cd "$workdir"
exec codex remote-control --no-daemon < /dev/null
