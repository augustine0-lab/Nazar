# Nazar in one container: Next.js server plus a SQLite file on a mounted volume.
#   docker build -t nazar .
#   docker run -p 3000:3000 -v nazar-data:/app/data -e DEMO_SEED=on -e DEMO_MODE=on nazar
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 is compiled when no ready binary fits the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/nazar.db \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx tsx src/db/init.ts && npx next start -p ${PORT} -H 0.0.0.0"]
