FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 wget && \
    wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

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
