FROM node:24.22.1-bookworm-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# The same command-line tools as in the OMP image: Claude Code works on the same /code folder.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git openssh-client python3 jq ripgrep fzf tree make unzip wget vim tini \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && curl -fsSL https://api.github.com/meta | jq -r '.ssh_keys[] | "github.com \(.)"' > /etc/ssh/ssh_known_hosts \
    && curl -fsSL https://github.com/mikefarah/yq/releases/download/v4.54.1/yq_linux_amd64 -o /usr/local/bin/yq \
    && echo "8e34fc298390875de416e6a4afcb8cabeceb25d9aa8506c1a2f9353cf702ea5f  /usr/local/bin/yq" | sha256sum -c - \
    && chmod +x /usr/local/bin/yq \
    && curl -fsSL https://get.helm.sh/helm-v3.19.0-linux-amd64.tar.gz -o /tmp/helm.tar.gz \
    && echo "a7f81ce08007091b86d8bd696eb4d86b8d0f2e1b9f6c714be62f82f96a594496  /tmp/helm.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/helm.tar.gz -C /usr/local/bin --strip-components=1 linux-amd64/helm \
    && rm /tmp/helm.tar.gz \
    && rm -rf /var/lib/apt/lists/*

# Remote Control needs a recent version. Raise the pin in a pull request to update.
RUN npm install --global --no-audit --no-fund @anthropic-ai/claude-code@2.1.325 \
    && claude --version

# The telegram-login container also logs Codex in (codex login --device-auth) with the login folder
# of the codex container. Keep the same version as in codex/Dockerfile.
RUN npm install --global --no-audit --no-fund @openai/codex@0.170.0 \
    && codex --version

ENV HOME=/home/claude \
    DISABLE_UPDATES=1

# Built from the repository root: the Telegram helper links senaev-utils with a file:
# dependency, as the other services do. Its own dependencies are installed next to it,
# because Node resolves a linked module's imports from its real path.
COPY senaev-utils/package*.json /app/senaev-utils/
COPY claude-code/package*.json /app/claude-code/
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev
WORKDIR /app/claude-code
RUN npm ci --omit=dev
COPY senaev-utils/src /app/senaev-utils/src
COPY claude-code /app/claude-code

WORKDIR /code
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["bash", "/app/claude-code/start.sh"]
