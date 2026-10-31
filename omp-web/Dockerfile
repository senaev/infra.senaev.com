FROM oven/bun:1.4.4-slim AS bun
FROM node:24.22.1-bookworm-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
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

RUN curl -fsSL --retry 3 https://github.com/can1357/oh-my-pi/releases/download/v18.14.0/omp-linux-x64 -o /usr/local/bin/omp \
    && echo "e7dd2b606c4ebe9d1a7bcfad1b8820db968cd6b05409fed1c6bc8db0b6a95a8f  /usr/local/bin/omp" | sha256sum -c - \
    && chmod +x /usr/local/bin/omp \
    && npm install --global --no-audit --no-fund @kahme247/ompweb@0.6.0 \
    && omp --version && ompweb --version

ENV OMP_WEB_HOSTNAME=127.0.0.1 \
    OMP_WEB_NO_OPEN=1 \
    OMP_WEB_DISABLE_AUTOUPDATE=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY omp-web/start.sh /app/

WORKDIR /projects/git
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["bash", "/app/start.sh"]
