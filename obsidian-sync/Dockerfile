FROM node:22-alpine

RUN npm install -g obsidian-headless

RUN mkdir -p /vault /home/node/.config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/vault", "/home/node/.config"]

ENV OBSIDIAN_VAULT_PATH=/vault

USER node

ENTRYPOINT ["/entrypoint.sh"]
