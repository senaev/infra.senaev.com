FROM node:24-alpine

WORKDIR /app

# Built from the repository root: cluster-helper links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package.json ./senaev-utils/
COPY cluster-helper/package*.json ./cluster-helper/

WORKDIR /app/cluster-helper
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY cluster-helper /app/cluster-helper

EXPOSE 80 3000
CMD ["npm", "start"]
