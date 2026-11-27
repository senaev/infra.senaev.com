FROM node:24-alpine

# nsenter
RUN apk add --no-cache util-linux-misc

WORKDIR /app

# Built from the repository root: node-shell links senaev-utils with a file: dependency, so the
# library's manifest has to exist before `npm ci` can resolve it.
COPY senaev-utils/package*.json ./senaev-utils/
COPY node-shell/package*.json ./node-shell/

# senaev-utils is linked as a symlink, and Node resolves a module's own imports from its real
# path -- so its dependencies must be installed next to the library itself.
WORKDIR /app/senaev-utils
RUN npm ci --omit=dev

WORKDIR /app/node-shell
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY node-shell /app/node-shell

CMD ["npm", "start"]
