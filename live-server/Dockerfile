FROM node:20-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .

ENV WS_PORT=4000
ENV HLS_PORT=8080
ENV HLS_DIR=/tmp/rainbowland-hls

EXPOSE 4000 8080

CMD ["node", "server.js"]
