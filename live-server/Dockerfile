# Stage 1: build node deps
FROM node:20-slim AS nodedeps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# Stage 2: nginx-rtmp + node runtime
FROM tiangolo/nginx-rtmp:latest

# Copy Node.js binary from official node image
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:20-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm 2>/dev/null || true

WORKDIR /app
COPY --from=nodedeps /app/node_modules ./node_modules
COPY package.json server.js start.sh ./
COPY nginx.conf /etc/nginx/nginx.conf

RUN chmod +x start.sh && mkdir -p /tmp/rl-hls

EXPOSE 1935 8080 4000

CMD ["/app/start.sh"]
