FROM node:24 AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM oven/bun:1.3

WORKDIR /app

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Copy backend code
COPY server ./server
COPY src/types ./src/types
COPY package*.json ./

# Install production dependencies
RUN bun install --production

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose port
EXPOSE 3001

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["bun", "run", "server/index.ts"]
