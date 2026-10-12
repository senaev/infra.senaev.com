FROM node:22-alpine

# better-sqlite3 is a native module and requires build tools to compile
RUN apk add --no-cache python3 make g++

# This version filters missing project folders, including previously mounted worktrees.
RUN npm install -g @grinev/opencode-telegram-bot@0.26.4

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
