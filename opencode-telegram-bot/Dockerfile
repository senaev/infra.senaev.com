FROM node:20-alpine

# better-sqlite3 is a native module and requires build tools to compile
RUN apk add --no-cache python3 make g++

RUN npm install -g @grinev/opencode-telegram-bot

CMD ["opencode-telegram", "start"]
