FROM debian:bookworm-slim

# Install curl and CA certs (needed to download opencode), then clean up the apt
# index in the same layer so it doesn't bloat the image, then run the opencode
# install script which places the binary in PATH
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://opencode.ai/install | bash

ENV PATH="/root/.opencode/bin:$PATH"

CMD sh -c ': "${OPENCODE_WORKDIR:?OPENCODE_WORKDIR is required}" && cd "$OPENCODE_WORKDIR" && exec opencode serve --hostname 0.0.0.0'
