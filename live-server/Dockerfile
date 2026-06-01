# Rainbow Land Live Server
# Nginx-RTMP for ingest → HLS output → Node.js for API + chat
FROM tiangolo/nginx-rtmp:latest

RUN apt-get update && apt-get install -y curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY nginx.conf /etc/nginx/nginx.conf
COPY server.js  ./
COPY start.sh   ./
RUN chmod +x start.sh

EXPOSE 1935 8080 4000

CMD ["/app/start.sh"]
