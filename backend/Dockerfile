FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile and manifest first for better layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy source
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/

EXPOSE 8080

CMD ["node", "src/server.js"]
