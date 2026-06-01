# Rainbow Land Live Server
# Ubuntu 24.04 + Nginx-RTMP module + Node.js 20
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    nginx \
    libnginx-mod-rtmp \
    nodejs \
    npm \
    curl \
    ffmpeg \
    && apt-get clean

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY nginx.conf /etc/nginx/nginx.conf
COPY server.js  ./
COPY start.sh   ./
RUN chmod +x start.sh

EXPOSE 1935 8080 4000

CMD ["/app/start.sh"]
