FROM node:24-alpine

WORKDIR /app

# Built from the repository root: media-server-helper links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package.json ./senaev-utils/
COPY media-server-helper/package*.json ./media-server-helper/

WORKDIR /app/media-server-helper
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY media-server-helper /app/media-server-helper

CMD ["npm", "start"]
