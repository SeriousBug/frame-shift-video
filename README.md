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
      - /path/to/your/outputs:/outputs
      # Persistent database
      - ./data:/app/data
    environment:
      # Server configuration
      - PORT=3001
      - UPLOAD_DIR=/app/uploads
      - OUTPUT_DIR=/outputs

      # File browser home directory (optional)
      # Defaults to / if not specified
      - FRAME_SHIFT_HOME=/videos

      # FFmpeg configuration (optional)
      # - FFMPEG_THREADS=12

      # Discord notifications (optional)
      # Get webhook URL from Discord Server Settings -> Integrations -> Webhooks
      - DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN

      # Pushover notifications (optional)
      # Get credentials from https://pushover.net/
      - PUSHOVER_API_TOKEN=your_app_token_here
      - PUSHOVER_USER_KEY=your_user_key_here
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

Access the web interface at `http://localhost:3001`

### Environment Variables

| Variable              | Required | Default          | Description                               |
| --------------------- | -------- | ---------------- | ----------------------------------------- |
| `PORT`                | No       | `3001`           | Port the server listens on                |
| `DIST_DIR`            | No       | `./dist`         | Directory containing built frontend files |
| `UPLOAD_DIR`          | No       | `./uploads`      | Directory for uploaded files              |
| `OUTPUT_DIR`          | No       | `./outputs`      | Directory for converted video outputs     |
| `FRAME_SHIFT_HOME`    | No       | `/` (or `$HOME`) | Starting directory for file browser       |
| `FFMPEG_THREADS`      | No       | -                | Number of threads FFmpeg should use       |
| `DISCORD_WEBHOOK_URL` | No       | -                | Discord webhook URL for notifications     |
| `PUSHOVER_API_TOKEN`  | No       | -                | Pushover application token                |
| `PUSHOVER_USER_KEY`   | No       | -                | Pushover user key                         |

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
