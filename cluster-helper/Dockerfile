FROM node:24-alpine

WORKDIR /app

# Built from the repository root: cluster-helper links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package*.json ./senaev-utils/
COPY cluster-helper/package*.json ./cluster-helper/

# senaev-utils is linked as a symlink, and Node resolves a module's own imports
# from its real path -- so pino/jose/rxjs must be installed next to the library
# itself. They are unreachable in the service's node_modules from /app/senaev-utils.
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev

WORKDIR /app/cluster-helper
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY cluster-helper /app/cluster-helper

# 80 is the internal listener: unauthenticated routes for alertmanager,
# qbittorrent and vpn-subscription, reachable only inside the cluster.
# 3000 is the public listener behind the ingresses. See src/index.ts.
EXPOSE 80 3000
CMD ["npm", "start"]
