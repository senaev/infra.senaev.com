FROM node:24-alpine

# Provides the `ob` CLI used for Obsidian Sync login and continuous sync.
RUN npm install -g obsidian-headless

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# `ob` writes its credentials/config here, and the vault hostPath is chowned to
# uid 1000 by the deployment's init container.
RUN mkdir -p /home/node/.config && chown -R node:node /home/node/.config /app

USER node

EXPOSE 8080
CMD ["npm", "start"]
