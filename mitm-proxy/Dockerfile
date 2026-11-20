FROM node:24.22.1-alpine

# openssl makes the certificates at start. ca-certificates is the system trust list that the
# clients get, plus the proxy CA.
RUN apk add --no-cache openssl ca-certificates

# No dependencies: Node runs the TypeScript files directly.
COPY mitm-proxy/src /app/src

# The shared folder is an emptyDir, writable by any user.
USER node
WORKDIR /app
CMD ["node", "src/main.ts"]
