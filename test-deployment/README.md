# Leader-Follower Test Deployment

This directory contains a Docker Compose setup for manually testing the leader-follower architecture.

## Quick Start

1. **Build and start all instances:**

   ```bash
   docker compose up --build
   ```

2. **Access the web UI:**

   Open http://localhost:3001 in your browser

3. **Add test videos:**

   Place video files in `./test-media/` directory. They will be accessible at `/media/` inside the containers.

## Architecture

```
┌─────────────────────┐
│  Leader (port 3001) │ ← Web UI access
│  - Serves UI        │
│  - Creates jobs     │
│  - Manages queue    │
└──────────┬──────────┘
           │
           │ Distributes jobs
           │
      ┌────┴────┐
      │         │
┌─────▼──────┐ ┌──────▼─────┐
│ Follower 1 │ │ Follower 2 │
│ (port 3002)│ │ (port 3003)│
│ - Runs     │ │ - Runs     │
│   FFmpeg   │ │   FFmpeg   │
└────────────┘ └────────────┘
```

## Testing Workflow

1. **Add test videos to `test-media/`:**

   ```bash
   # Create a sample test video using FFmpeg
   ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
          -pix_fmt yuv420p test-media/sample.mp4
   ```

2. **Create a conversion job:**
   - Open http://localhost:3001
   - Browse to `/media/`
   - Select one or more video files
   - Configure conversion settings
   - Submit the job

3. **Monitor job distribution:**
   - The leader will assign the job to the first available follower
   - You can see which follower is processing each job in the job details
   - Progress updates will be visible in the UI

4. **Check logs:**

   ```bash
   # Leader logs
   docker compose logs -f frame-shift-leader

   # Follower 1 logs
   docker compose logs -f frame-shift-follower1

   # Follower 2 logs
   docker compose logs -f frame-shift-follower2

   # All logs
   docker compose logs -f
   ```

## What to Test

### ✅ Basic Functionality

- [ ] Job creation through leader UI
- [ ] Job appears in the queue
- [ ] Job is assigned to a follower (`assigned_worker` field)
- [ ] Progress updates are received from follower
- [ ] Job completes successfully
- [ ] Output file is created in the correct location

### ✅ Multi-Follower Distribution

- [ ] Create multiple jobs simultaneously
- [ ] Verify jobs are distributed across both followers
- [ ] Check that followers process jobs in parallel

### ✅ Authentication

- [ ] Leader and followers communicate successfully
- [ ] Check logs for no authentication errors

### ✅ Failure Handling

- [ ] Stop a follower mid-job: `docker stop frame-shift-follower1-test`
- [ ] Verify the job is marked as failed
- [ ] Restart the follower: `docker start frame-shift-follower1-test`
- [ ] Submit a new job and verify it works

### ✅ Filesystem Access

- [ ] Leader can browse `/media/` directory
- [ ] Jobs reference files with `/media/` paths
- [ ] Followers can read input files
- [ ] Followers can write output files
- [ ] Output files are accessible from leader

## Directory Structure

```
test-deployment/
├── docker-compose.yml       # Docker Compose configuration
├── README.md               # This file
├── test-media/             # Shared media files
│   └── (your test videos here)
├── leader-data/            # Leader database (auto-created)
│   └── database.sqlite
├── follower1-data/         # Follower 1 database (auto-created)
│   └── database.sqlite
└── follower2-data/         # Follower 2 database (auto-created)
    └── database.sqlite
```

## Useful Commands

```bash
# Start in background
docker compose up -d

# Stop all instances
docker compose down

# Restart a specific instance
docker compose restart frame-shift-follower1

# View logs for specific instance
docker compose logs -f frame-shift-leader

# Rebuild after code changes
docker compose up --build

# Clean up everything (including volumes)
docker compose down -v
rm -rf leader-data follower1-data follower2-data test-media/*
```

## Configuration

### Changing the Shared Token

Edit the `SHARED_TOKEN` environment variable in `docker-compose.yml` for all instances (leader and followers). **The token must be identical on all instances.**

```yaml
environment:
  - SHARED_TOKEN=your-new-secure-token
```

### Adding More Followers

1. Add a new service in `docker-compose.yml`:

   ```yaml
   frame-shift-follower3:
     # ... copy from follower1 and update port
     ports:
       - '3004:3001'
   ```

2. Update the leader's `FOLLOWER_URLS`:
   ```yaml
   environment:
     - FOLLOWER_URLS=http://frame-shift-follower1:3001,http://frame-shift-follower2:3001,http://frame-shift-follower3:3001
   ```

### Adjusting FFmpeg Threads

Control how many threads each follower uses for encoding:

```yaml
environment:
  - FFMPEG_THREADS=8 # Adjust based on available CPU cores
```

## Troubleshooting

### Jobs Not Being Distributed

**Check:**

- Leader logs for connection errors to followers
- Follower logs for startup errors
- Network connectivity: `docker compose exec frame-shift-leader ping frame-shift-follower1`

### Authentication Errors

**Symptoms:** "Authentication failed" in logs

**Fix:** Ensure `SHARED_TOKEN` is identical across all instances

### Files Not Found

**Symptoms:** "No such file or directory" errors

**Fix:**

- Verify files exist in `test-media/`
- Check volume mounts in `docker-compose.yml`
- Ensure paths use `/media/` prefix

### Follower Not Processing Jobs

**Check:**

- Follower logs for errors
- Follower is running: `docker compose ps`
- Leader can reach follower: `docker compose exec frame-shift-leader wget -O- http://frame-shift-follower1:3001/api/settings`

## Performance Testing

To stress-test the distributed setup:

1. **Generate many test videos:**

   ```bash
   for i in {1..10}; do
     ffmpeg -f lavfi -i testsrc=duration=30:size=1920x1080:rate=30 \
            -pix_fmt yuv420p test-media/test-$i.mp4
   done
   ```

2. **Submit multiple jobs**

3. **Monitor system resources:**
   ```bash
   docker stats
   ```

## Clean Up

```bash
# Stop and remove all containers
docker compose down

# Remove all data (databases, output files)
rm -rf leader-data follower1-data follower2-data

# Remove test media
rm -rf test-media/*
```

## Production Deployment Notes

⚠️ **This setup is for testing only.** For production:

1. Use a strong, random shared token: `openssl rand -hex 32`
2. Mount production media directories instead of `test-media/`
3. Use persistent volumes for databases
4. Set up proper networking (VPN recommended)
5. Configure monitoring and alerting
6. Enable Sentry error tracking
7. Review security settings
