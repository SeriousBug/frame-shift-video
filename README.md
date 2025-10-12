# Frame Shift Video

Self-hosted video conversion service with a web interface. Queue up FFmpeg jobs, drag-and-drop to reorder them, and get notifications when they're done.

## Features

- Web UI for managing video conversion jobs
- Drag-and-drop queue reordering
- Custom FFmpeg commands or preset configurations
- Browse and select files from your server
- Job queue persists across restarts
- Real-time progress updates via WebSocket
- Pushover and Discord notifications

## Security Warning

⚠️ **This application is NOT secure for public internet access.** It allows arbitrary FFmpeg command execution and file system access.

**You MUST run this behind a VPN like Tailscale** or on a trusted private network only.

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
