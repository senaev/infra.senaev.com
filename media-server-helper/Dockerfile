FROM node:24-alpine

WORKDIR /app

# Built from the repository root: media-server-helper links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package*.json ./senaev-utils/
COPY media-server-helper/package*.json ./media-server-helper/

# senaev-utils is linked as a symlink, and Node resolves a module's own imports
# from its real path -- so pino/jose/rxjs must be installed next to the library
# itself. They are unreachable in the service's node_modules from /app/senaev-utils.
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev

WORKDIR /app/media-server-helper
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY media-server-helper /app/media-server-helper

CMD ["npm", "start"]
