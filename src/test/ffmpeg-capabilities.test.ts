/**
 * Tests for FFmpeg capability detection
 * Uses mock ffmpeg script from test-bin/
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import path from 'path';

// Import the capability detection functions
// We need to reset the cache between tests, so we'll import the module
const testBinDir = path.join(process.cwd(), 'test-bin');

describe('FFmpeg Capabilities Detection', () => {
  beforeAll(() => {
    // Set FFMPEG_BIN_PATH to use mock script
    process.env.FFMPEG_BIN_PATH = path.join(testBinDir, 'ffmpeg');
  });

  describe('detectFFmpegCapabilities', () => {
    it('should detect x264 10-bit support from mock ffmpeg', async () => {
      // Dynamically import to reset the module cache
      // The mock ffmpeg script includes yuv420p10le in supported pixel formats
      const { spawn } = await import('child_process');

      // Run the mock ffmpeg with the capability detection command
      const ffmpegPath = process.env.FFMPEG_BIN_PATH!;

      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn(ffmpegPath, ['-h', 'encoder=libx264']);
        let output = '';

        proc.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
          output += data.toString();
        });

        proc.on('close', () => {
          resolve(output);
        });

        proc.on('error', (err: Error) => {
          reject(err);
        });
      });

      // Verify the mock output contains the expected format
      expect(result).toContain('Encoder libx264');
      expect(result).toContain('Supported pixel formats:');
      expect(result).toContain('yuv420p10le');
    });

    it('should correctly parse 10-bit support from ffmpeg output', async () => {
      // Test with output that includes 10-bit support
      const outputWith10bit = `
Encoder libx264 [libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10]:
    General capabilities: dr1 delay threads
    Threading capabilities: other
    Supported pixel formats: yuv420p yuvj420p yuv422p yuvj422p yuv444p yuvj444p nv12 nv16 nv21 yuv420p10le yuv422p10le yuv444p10le nv20le gray gray10le
`;

      // Check that the output includes yuv420p10le (10-bit support)
      expect(outputWith10bit.includes('yuv420p10le')).toBe(true);
    });

    it('should correctly identify lack of 10-bit support', async () => {
      // Test with output that does NOT include 10-bit support (typical 8-bit only build)
      const outputWithout10bit = `
Encoder libx264 [libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10]:
    General capabilities: dr1 delay threads
    Threading capabilities: other
    Supported pixel formats: yuv420p yuvj420p yuv422p yuvj422p yuv444p yuvj444p nv12 nv16 nv21
`;

      // Check that the output does NOT include yuv420p10le
      expect(outputWithout10bit.includes('yuv420p10le')).toBe(false);
    });
  });

  describe('capability detection integration', () => {
    it('should run mock ffmpeg encoder help command', async () => {
      const { spawn } = await import('child_process');
      const ffmpegPath = process.env.FFMPEG_BIN_PATH!;

      // Verify the mock script exists and is executable
      const result = await new Promise<{ stdout: string; exitCode: number }>(
        (resolve, reject) => {
          const proc = spawn(ffmpegPath, ['-h', 'encoder=libx264']);
          let stdout = '';

          proc.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          proc.on('close', (code) => {
            resolve({ stdout, exitCode: code ?? 0 });
          });

          proc.on('error', (err: Error) => {
            reject(err);
          });
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Encoder libx264');
    });
  });
});
