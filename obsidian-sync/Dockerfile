FROM node:22-alpine

RUN npm install -g obsidian-headless

RUN mkdir -p /home/node/.config \
    && chown -R node:node /home/node/.config

COPY entrypoint.sh /entrypoint.sh
COPY server.js /server.js
RUN chmod +x /entrypoint.sh

USER node

ENTRYPOINT ["/entrypoint.sh"]
