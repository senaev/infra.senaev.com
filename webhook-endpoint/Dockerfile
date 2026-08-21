FROM node:24-alpine

WORKDIR /app

# Built from the repository root: webhook-endpoint links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package.json ./senaev-utils/
COPY webhook-endpoint/package*.json ./webhook-endpoint/

WORKDIR /app/webhook-endpoint
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY webhook-endpoint /app/webhook-endpoint

EXPOSE 3000
CMD ["npm", "start"]
