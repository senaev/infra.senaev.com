FROM node:24.22.1-bookworm-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# The same command-line tools as in the Claude Code image: Codex works on the same /code folder.
# procps: the Codex app-server daemon calls ps to record its process.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git openssh-client python3 jq ripgrep fzf tree make unzip wget vim tini procps \
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

# Remote control is experimental and changes from release to release. Raise the pin in a pull request.
RUN npm install --global --no-audit --no-fund @openai/codex@0.170.0 \
    && codex --version

ENV HOME=/home/codex

COPY codex/start.sh /app/codex/start.sh

WORKDIR /code
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["bash", "/app/codex/start.sh"]
