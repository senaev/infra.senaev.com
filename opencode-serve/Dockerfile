FROM debian:bookworm-slim

# Install curl and CA certs (needed to download opencode), then clean up the apt
# index in the same layer so it doesn't bloat the image, then run the opencode
# install script which places the binary in PATH
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates git openssh-client \
        jq vim ripgrep fzf tree make unzip wget gh \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://opencode.ai/install | bash \
    && YQ_VERSION=$(curl -fsSL https://api.github.com/repos/mikefarah/yq/releases/latest | grep tag_name | cut -d'"' -f4) \
    && curl -fsSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -o /usr/local/bin/yq \
    && chmod +x /usr/local/bin/yq \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.opencode/bin:$PATH"

CMD sh -c ': "${OPENCODE_WORKDIR:?OPENCODE_WORKDIR is required}" && cd "$OPENCODE_WORKDIR" && exec opencode serve --hostname 0.0.0.0'
