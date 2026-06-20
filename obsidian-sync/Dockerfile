FROM node:22-alpine

RUN npm install -g obsidian-headless

RUN mkdir -p /vault /home/node/.config

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# /home/node/.config persists ob login session state across pod restarts
VOLUME ["/vault", "/home/node/.config"]


USER node

ENTRYPOINT ["/entrypoint.sh"]
