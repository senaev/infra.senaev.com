FROM node:22-alpine

RUN npm install -g obsidian-headless

RUN mkdir -p /vault /home/node/.config \
    && chown -R node:node /home/node/.config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

ENTRYPOINT ["/entrypoint.sh"]
