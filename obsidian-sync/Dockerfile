FROM node:22-alpine

RUN npm install -g obsidian-headless

RUN addgroup -g 1000 obsidian \
    && adduser -u 1000 -G obsidian -h /home/obsidian -s /bin/sh -D obsidian \
    && mkdir -p /vault /home/obsidian/.config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/vault", "/home/obsidian/.config"]

ENV OBSIDIAN_VAULT_PATH=/vault

USER obsidian

ENTRYPOINT ["/entrypoint.sh"]
