FROM node:24.22.0-slim AS builder

WORKDIR /app/nextjs-app
COPY nextjs-app/package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json /app/
COPY nextjs-app ./
ENV NODE_ENV=production
RUN npm run build

FROM node:24.22.0-slim

WORKDIR /app/nextjs-app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/nextjs-app/.next/standalone /app/
COPY --from=builder --chown=node:node /app/nextjs-app/public ./public
COPY --from=builder --chown=node:node /app/nextjs-app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
