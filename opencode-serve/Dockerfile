FROM debian:bookworm-slim

# Built from the repository root, because code-tools links senaev-utils by path.
#
# The tools are for the opencode agent and for the code-* MCP tools alike: both run
# commands in /projects/git. python3 and helm are there for the checks of infra.senaev.com.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        git openssh-client python3 \
        jq vim ripgrep fzf tree make unzip wget gh \
    && curl -fsSL https://opencode.ai/install | bash \
    && YQ_VERSION=$(curl -fsSL https://api.github.com/repos/mikefarah/yq/releases/latest | grep tag_name | cut -d'"' -f4) \
    && curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    && curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version && helm version --short

ENV PATH="/root/.opencode/bin:$PATH"

WORKDIR /app

# senaev-utils is linked as a symlink, and Node resolves a module's own imports from its
# real path, so the library's dependencies are installed next to it.
COPY senaev-utils/package*.json ./senaev-utils/
COPY code-tools/package*.json ./code-tools/

WORKDIR /app/senaev-utils
RUN npm ci --omit=dev

WORKDIR /app/code-tools
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY code-tools /app/code-tools
COPY opencode-serve/start.sh /app/start.sh

WORKDIR /

EXPOSE 4096 8080
CMD ["bash", "/app/start.sh"]
