FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg python3 wget ca-certificates && \
    wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json server/
RUN cd server && npm ci --production

COPY server/ server/

COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

EXPOSE 5000

CMD ["node", "server/server.js"]
