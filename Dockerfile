FROM node:24-alpine AS build

# Accept version as build argument
ARG VERSION

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the frontend with version
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

# Production stage - use Alpine for smaller size
FROM oven/bun:1.3-alpine

# Accept version from build stage
ARG VERSION

WORKDIR /app

# Install ffmpeg (Alpine version is much smaller)
RUN apk add --no-cache ffmpeg

# Copy built frontend from build stage
COPY --from=build /app/dist ./dist

# Copy backend code (no node_modules needed - server uses only Bun built-ins)
COPY server ./server
COPY src/types ./src/types
COPY src/lib ./src/lib

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose port
EXPOSE 3001

# Set environment to production
ENV NODE_ENV=production

# Set app version for server
ENV APP_VERSION=${VERSION}

# Start the server
CMD ["bun", "run", "server/index.ts"]
