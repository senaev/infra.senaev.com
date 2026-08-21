FROM node:24-alpine

# Provides the `ob` CLI used for Obsidian Sync login and continuous sync.
RUN npm install -g obsidian-headless

WORKDIR /app

# Built from the repository root: obsidian-sync links senaev-utils with a file:
# dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package*.json ./senaev-utils/
COPY obsidian-sync/package*.json ./obsidian-sync/

# senaev-utils is linked as a symlink, and Node resolves a module's own imports
# from its real path -- so pino/jose/rxjs must be installed next to the library
# itself. They are unreachable in the service's node_modules from /app/senaev-utils.
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev

WORKDIR /app/obsidian-sync
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY obsidian-sync /app/obsidian-sync

# `ob` writes its credentials/config here, and the vault hostPath is chowned to
# uid 1000 by the deployment's init container.
RUN mkdir -p /home/node/.config && chown -R node:node /home/node/.config /app

USER node

EXPOSE 8080
CMD ["npm", "start"]
