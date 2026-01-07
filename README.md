# Frame Shift Video

Self-hosted video conversion service with a web interface. Queue up FFmpeg jobs and get notifications when they're done.

## Features

- Web UI for managing video conversion jobs
- Custom FFmpeg commands or preset configurations
- Browse and select files from your server
- Job queue persists across restarts
- Real-time progress updates via WebSocket
- Pushover and Discord notifications

## Security Warning

⚠️ **This application is NOT secure for public internet access.**

This service has no authentication and allows users to browse the server filesystem and execute FFmpeg commands. While safeguards exist to prevent accidental command injection and directory traversal, these are designed to prevent mistakes—not to stop determined adversaries.

In the best-case scenario, anonymous users can browse your files and queue video conversion jobs. In the worst case, security measures could potentially be circumvented to achieve unintended access or command execution.

**You MUST run this behind a trusted VPN (like Tailscale) or on a private network only.** Do not expose this service to the public internet or untrusted users.

## Usage

### Docker Compose (Recommended)

Create a `docker-compose.yml`:

```yaml
services:
  frame-shift-video:
    image: ghcr.io/seriousbug/frame-shift-video:latest
    container_name: frame-shift-video
    ports:
      - '3001:3001'
    volumes:
      # Mount your media directories
      - /path/to/your/videos:/videos
      # Persistent database
      - ./data:/app/data
    environment:
      # Server configuration
      - PORT=3001

      # File browser home directory (optional)
      # Defaults to / if not specified
      - FRAME_SHIFT_HOME=/videos

      # FFmpeg thread limits (optional)
      # - FFMPEG_DECODER_THREADS=4
      # - FFMPEG_ENCODER_THREADS=4

      # Discord notifications (optional)
      # Get webhook URL from Discord Server Settings -> Integrations -> Webhooks
      - DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN

      # Pushover notifications (optional)
      # Get credentials from https://pushover.net/
      - PUSHOVER_API_TOKEN=your_app_token_here
      - PUSHOVER_USER_KEY=your_user_key_here

      # Sentry error tracking (optional)
      # Get DSN from https://sentry.io/ - you can use separate DSNs for client and server
      # - SENTRY_CLIENT_DSN=https://your-client-sentry-dsn@sentry.io/project-id
      # - SENTRY_SERVER_DSN=https://your-server-sentry-dsn@sentry.io/project-id
      # - SENTRY_ENVIRONMENT=production
      # - SENTRY_SEND_DEFAULT_PII=true
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

Access the web interface at `http://localhost:3001`

### Distributed Setup (Leader-Follower)

For high-performance setups, you can distribute FFmpeg processing across multiple servers:

**Requirements:**

- All instances (leader + followers) must access the same filesystem with identical paths (use NFS, CIFS, or similar)
- All instances must be on a trusted network (VPN recommended)

**Example docker-compose.yml for distributed setup:**

```yaml
services:
  # Leader instance - serves UI and manages jobs
  frame-shift-leader:
    image: ghcr.io/seriousbug/frame-shift-video:latest
    container_name: frame-shift-leader
    ports:
      - '3001:3001'
    volumes:
      # CRITICAL: Same mount path on all instances
      - /mnt/media:/videos
      - ./leader-data:/app/data
    environment:
      - PORT=3001
      - FRAME_SHIFT_HOME=/videos
      - INSTANCE_TYPE=leader
      - SHARED_TOKEN=your_secure_random_token_here # Generate with: openssl rand -hex 32
      - FOLLOWER_URLS=http://follower1:3001,http://follower2:3001
      # Optional: notifications, sentry, etc.
    restart: unless-stopped

  # Follower instance 1 - executes FFmpeg jobs
  frame-shift-follower1:
    image: ghcr.io/seriousbug/frame-shift-video:latest
    container_name: frame-shift-follower1
    ports:
      - '3002:3001'
    volumes:
      # CRITICAL: Must be the exact same path as leader
      - /mnt/media:/videos
      - ./follower1-data:/app/data
    environment:
      - PORT=3001
      - INSTANCE_TYPE=follower
      - SHARED_TOKEN=your_secure_random_token_here # Must match leader
      - LEADER_URL=http://frame-shift-leader:3001
      # Optional: FFMPEG_DECODER_THREADS and FFMPEG_ENCODER_THREADS to limit CPU usage
    restart: unless-stopped

  # Follower instance 2 - executes FFmpeg jobs
  frame-shift-follower2:
    image: ghcr.io/seriousbug/frame-shift-video:latest
    container_name: frame-shift-follower2
    ports:
      - '3003:3001'
    volumes:
      # CRITICAL: Must be the exact same path as leader
      - /mnt/media:/videos
      - ./follower2-data:/app/data
    environment:
      - PORT=3001
      - INSTANCE_TYPE=follower
      - SHARED_TOKEN=your_secure_random_token_here # Must match leader
      - LEADER_URL=http://frame-shift-leader:3001
    restart: unless-stopped
```

**How it works:**

- Access the web UI on the leader instance at `http://localhost:3001`
- Leader receives job requests and distributes them to available followers
- Followers execute FFmpeg and report progress back to the leader
- All progress updates and status changes are visible in the leader's UI

**Important notes:**

- The `SHARED_TOKEN` must be identical on leader and all followers
- Generate a secure token: `openssl rand -hex 32`
- Follower instances do not serve the web UI
- Jobs are distributed using "first available" strategy
- If a follower becomes unresponsive, the job is marked as failed

### Environment Variables

| Variable                  | Required              | Default          | Description                                          |
| ------------------------- | --------------------- | ---------------- | ---------------------------------------------------- |
| `PORT`                    | No                    | `3001`           | Port the server listens on                           |
| `FRAME_SHIFT_HOME`        | No                    | `/` (or `$HOME`) | Starting directory for file browser                  |
| `INSTANCE_TYPE`           | No                    | `standalone`     | Instance type: `standalone`, `leader`, or `follower` |
| `SHARED_TOKEN`            | Yes (leader/follower) | -                | Shared authentication token for distributed setup    |
| `FOLLOWER_URLS`           | Yes (leader)          | -                | Comma-separated list of follower URLs                |
| `LEADER_URL`              | Yes (follower)        | -                | URL of the leader instance                           |
| `FFMPEG_DECODER_THREADS`  | No                    | -                | Number of threads for FFmpeg decoding                |
| `FFMPEG_ENCODER_THREADS`  | No                    | -                | Number of threads for FFmpeg encoding                |
| `DISCORD_WEBHOOK_URL`     | No                    | -                | Discord webhook URL for notifications                |
| `PUSHOVER_API_TOKEN`      | No                    | -                | Pushover application token                           |
| `PUSHOVER_USER_KEY`       | No                    | -                | Pushover user key                                    |
| `SENTRY_CLIENT_DSN`       | No                    | -                | Sentry DSN for client-side error tracking            |
| `SENTRY_SERVER_DSN`       | No                    | -                | Sentry DSN for server-side error tracking            |
| `SENTRY_ENVIRONMENT`      | No                    | `production`     | Sentry environment name                              |
| `SENTRY_SEND_DEFAULT_PII` | No                    | -                | Send personally identifiable info to Sentry          |

## Development

Requires Bun and FFmpeg installed on your system.

```bash
# Install dependencies
npm install

# Start development servers (Vite + Bun)
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## License

MIT
