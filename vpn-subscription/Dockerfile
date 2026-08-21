FROM node:24-alpine

WORKDIR /app

# Built from the repository root: vpn-subscription links senaev-utils with a
# file: dependency, so the library's manifest has to exist before `npm ci` can
# resolve it.
COPY senaev-utils/package.json ./senaev-utils/
COPY vpn-subscription/package*.json ./vpn-subscription/

WORKDIR /app/vpn-subscription
RUN npm ci --omit=dev

COPY senaev-utils/src /app/senaev-utils/src
COPY vpn-subscription /app/vpn-subscription

EXPOSE 3000
CMD ["npm", "start"]
