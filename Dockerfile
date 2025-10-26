FROM oven/bun:1.3-alpine AS build

# Accept version as build argument
ARG VERSION

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build the frontend with version
ENV VITE_APP_VERSION=${VERSION}
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token) \
    bun run build

# Production stage - use Alpine for smaller size
FROM oven/bun:1.3-alpine

# Accept version from build stage
ARG VERSION

WORKDIR /app

# Install ffmpeg (Alpine version is much smaller)
RUN apk add --no-cache ffmpeg

# Copy built frontend and bundled server from build stage
COPY --from=build /app/dist ./dist

# Create directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose port
EXPOSE 3001

# Set environment to production
ENV NODE_ENV=production

# Set app version for server
ENV APP_VERSION=${VERSION}

# Start the bundled server
CMD ["bun", "run", "dist/server.js"]
