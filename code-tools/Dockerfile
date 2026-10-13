FROM debian:bookworm-slim

# Built from the repository root because code-tools links senaev-utils by path.
#
# CLI tools used by code-run in /projects/git. python3 and helm are there for the checks of infra.senaev.com.
# Keep yq pinned, matching the CLI toolchain available to OpenCode.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        git openssh-client python3 \
        jq vim ripgrep fzf tree make unzip wget gh \
    && curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.54.1/yq_linux_amd64" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    && curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version && helm version --short

WORKDIR /app
COPY senaev-utils/package*.json ./senaev-utils/
COPY code-tools/package*.json ./code-tools/
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev
WORKDIR /app/code-tools
RUN npm ci --omit=dev
COPY senaev-utils/src /app/senaev-utils/src
COPY code-tools /app/code-tools
EXPOSE 8080
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
