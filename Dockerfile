FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    LEADERBOARD_FILE=/data/leaderboard.json

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server.js index.html ./
COPY --chown=node:node assets ./assets
RUN mkdir /data && chown node:node /data

USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "server.js"]
