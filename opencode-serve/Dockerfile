FROM debian:bookworm-slim

# Built from the repository root; Code Tools now has its own image.
#
# The tools are for the OpenCode agent, which runs commands in /projects/git. python3 and helm are there for the checks of infra.senaev.com.
# Pin OpenCode and verify its release archive before extraction. The baseline x64
# binary supports hosts without AVX2. Keep yq pinned as well.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        git openssh-client python3 \
        jq vim ripgrep fzf tree make unzip wget gh \
    && curl -fsSL --retry 3 --retry-all-errors "https://github.com/anomalyco/opencode/releases/download/v1.19.0/opencode-linux-x64-baseline.tar.gz" -o /tmp/opencode.tar.gz \
    && echo "6334d70db3990721ea454357e9cf2573c8685524ad7769af9d52cbffb7008438  /tmp/opencode.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode \
    && test "$(opencode --version)" = "1.19.0" \
    && rm /tmp/opencode.tar.gz \
    && curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.54.1/yq_linux_amd64" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    && curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version && helm version --short

COPY opencode-serve/start.sh /app/start.sh

WORKDIR /
EXPOSE 4096
CMD ["bash", "/app/start.sh"]
