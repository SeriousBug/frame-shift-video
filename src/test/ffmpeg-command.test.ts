/**
 * Tests for FFmpeg command generation utility
 */

import { describe, it, expect } from 'bun:test';
import {
  createFFmpegJobs,
  generateFFmpegCommand,
  generateAllFFmpegCommands,
  validateFFmpegCommand,
  type FFmpegJobConfig,
} from '@/lib/ffmpeg-command';
import {
  ConversionOptions,
  DEFAULT_CONVERSION_OPTIONS,
} from '@/types/conversion';

describe('FFmpeg Command Generation', () => {
  const basicOptions: ConversionOptions = {
    ...DEFAULT_CONVERSION_OPTIONS,
    selectedFiles: ['test-video.mkv', 'another-video.mp4'],
    basic: {
      videoCodec: 'libx265',
      quality: 22,
      outputFormat: 'mp4',
    },
  };

  describe('createFFmpegJobs', () => {
    it('should create individual jobs for each selected file', () => {
      const jobs = createFFmpegJobs(basicOptions);

      expect(jobs).toHaveLength(2);
      expect(jobs[0].inputFile).toBe('test-video.mkv');
      expect(jobs[1].inputFile).toBe('another-video.mp4');

      // Output files should have _converted suffix and correct extension
      expect(jobs[0].outputFile).toBe('test-video_converted.mp4');
      expect(jobs[1].outputFile).toBe('another-video_converted.mp4');

      // Job names should be descriptive
      expect(jobs[0].jobName).toBe('Convert test-video.mkv to MP4');
      expect(jobs[1].jobName).toBe('Convert another-video.mp4 to MP4');
    });

    it('should handle single file selection', () => {
      const singleFileOptions = {
        ...basicOptions,
        selectedFiles: ['single-video.avi'],
      };

      const jobs = createFFmpegJobs(singleFileOptions);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].inputFile).toBe('single-video.avi');
    });

    it('should handle empty file selection', () => {
      const emptyOptions = {
        ...basicOptions,
        selectedFiles: [],
      };

      const jobs = createFFmpegJobs(emptyOptions);
      expect(jobs).toHaveLength(0);
    });
  });

  describe('generateFFmpegCommand', () => {
    const jobConfig: FFmpegJobConfig = {
      inputFile: 'input.mkv',
      outputFile: 'output.mp4',
      options: basicOptions,
      jobName: 'Test Job',
    };

    it('should generate basic H.265 encoding command', () => {
      const command = generateFFmpegCommand(jobConfig);

      expect(command.args).toEqual([
        'ffmpeg',
        '-i',
        'input.mkv',
        '-map',
        '0:v:0', // First video stream only (excludes attached pics)
        '-map',
        '0:a?', // All audio streams (optional)
        '-map',
        '0:s?', // All subtitle streams (optional)
        '-c:v',
        'libx265',
        '-crf',
        '22',
        '-preset',
        'slow',
        '-pix_fmt',
        'yuv420p10le', // 10-bit default
        '-c:a',
        'libopus',
        '-compression_level',
        '0', // high quality
        '-sn', // No subtitles when subtitleCodecs is not provided
        '-progress',
        'pipe:1',
        '-y',
        'output.mp4',
      ]);

      expect(command.displayCommand).toBe(
        'ffmpeg -i input.mkv -map 0:v:0 -map 0:a? -map 0:s? -c:v libx265 -crf 22 -preset slow -pix_fmt yuv420p10le -c:a libopus -compression_level 0 -sn -progress pipe:1 -y output.mp4',
      );
      expect(command.inputPath).toBe('input.mkv');
      expect(command.outputPath).toBe('output.mp4');
    });

    it('should generate copy command when video codec is copy', () => {
      const copyConfig = {
        ...jobConfig,
        options: {
          ...basicOptions,
          basic: {
            ...basicOptions.basic,
            videoCodec: 'copy' as const,
          },
        },
      };

      const command = generateFFmpegCommand(copyConfig);

      expect(command.args).toContain('-c:v');
      expect(command.args).toContain('copy');
      expect(command.args).not.toContain('-crf');
      expect(command.args).not.toContain('-preset');
    });

    it('should handle custom resolution scaling', () => {
      const resolutionConfig = {
        ...jobConfig,
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            resolution: {
              width: 1920,
              height: 1080,
              maintainAspectRatio: true,
            },
          },
        },
      };

      const command = generateFFmpegCommand(resolutionConfig);

      expect(command.args).toContain('-vf');
      expect(command.args).toContain('scale=1920:1080');
    });

    it('should handle custom frame rate', () => {
      const frameRateConfig = {
        ...jobConfig,
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            frameRate: {
              copyOriginal: false,
              fps: 30,
            },
          },
        },
      };

      const command = generateFFmpegCommand(frameRateConfig);

      expect(command.args).toContain('-r');
      expect(command.args).toContain('30');
    });

    it('should handle CBR bitrate mode', () => {
      const cbrConfig = {
        ...jobConfig,
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            bitrate: {
              mode: 'cbr' as const,
              videoBitrate: 2000,
            },
          },
        },
      };

      const command = generateFFmpegCommand(cbrConfig);

      expect(command.args).toContain('-b:v');
      expect(command.args).toContain('2000k');
      expect(command.args).not.toContain('-crf');
    });

    it('should handle custom FFmpeg command', () => {
      const customConfig = {
        ...jobConfig,
        options: {
          ...basicOptions,
          customCommand: '-tune film -profile:v high',
        },
      };

      const command = generateFFmpegCommand(customConfig);

      expect(command.args).toEqual([
        'ffmpeg',
        '-i',
        'input.mkv',
        '-tune',
        'film',
        '-profile:v',
        'high',
        '-progress',
        'pipe:1',
        '-y',
        'output.mp4',
      ]);
    });
  });

  describe('Security and Validation', () => {
    it('should reject path traversal attempts', () => {
      const traversalOptions = {
        ...basicOptions,
        selectedFiles: ['../../../etc/passwd'],
      };

      expect(() => createFFmpegJobs(traversalOptions)).toThrow(
        'Failed to create job config for file',
      );
    });

    it('should allow legitimate filenames containing consecutive dots', () => {
      const dotsOptions = {
        ...basicOptions,
        selectedFiles: [
          'abc..xy.mkv',
          'file..name..test.mp4',
          'video...multiple.avi',
        ],
      };

      expect(() => createFFmpegJobs(dotsOptions)).not.toThrow();
      const jobs = createFFmpegJobs(dotsOptions);
      expect(jobs).toHaveLength(3);
      expect(jobs[0].inputFile).toBe('abc..xy.mkv');
      expect(jobs[1].inputFile).toBe('file..name..test.mp4');
      expect(jobs[2].inputFile).toBe('video...multiple.avi');
    });

    it('should reject path traversal in the middle of paths', () => {
      const traversalOptions = {
        ...basicOptions,
        selectedFiles: ['/home/user/../etc/passwd', 'folder/../secrets.txt'],
      };

      expect(() => createFFmpegJobs(traversalOptions)).toThrow(
        'Failed to create job config for file',
      );
    });

    it('should allow absolute paths for server-local files', () => {
      const absoluteOptions = {
        ...basicOptions,
        selectedFiles: ['/etc/passwd'],
      };

      // Absolute paths are allowed because they're needed for server-local files
      expect(() => createFFmpegJobs(absoluteOptions)).not.toThrow();
      const jobs = createFFmpegJobs(absoluteOptions);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].inputFile).toBe('/etc/passwd');
    });

    it('should handle shell metacharacters in custom commands safely', () => {
      // Since we use spawn() with arrays, shell metacharacters are passed literally
      // and don't execute. This test verifies the command is generated without throwing.
      const jobConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          customCommand: '-tune film; rm -rf /',
        },
        jobName: 'Test Job',
      };

      // Should not throw - spawn() with array args is safe
      const command = generateFFmpegCommand(jobConfig);

      // The custom command is split on whitespace, so "film;" and "rm" become separate args
      // This demonstrates that shell metacharacters are treated as literal text
      expect(command.args).toContain('film;');
      expect(command.args).toContain('rm');
      expect(command.args).toContain('-rf');
    });

    it('should allow legitimate file names with spaces and special characters', () => {
      const legitimateOptions = {
        ...basicOptions,
        selectedFiles: [
          'My Video (1080p) [h264].mkv',
          'Another-Video_2023.mp4',
        ],
      };

      expect(() => createFFmpegJobs(legitimateOptions)).not.toThrow();
    });

    it('should allow file names with shell metacharacters', () => {
      // Since we use spawn() with array args, these characters are safe
      const shellCharOptions = {
        ...basicOptions,
        selectedFiles: [
          'My Video & More.mp4',
          'Episode 1|2.mkv',
          'File;Name.avi',
          'Test$File.mov',
          'Back`tick.mp4',
        ],
      };

      expect(() => createFFmpegJobs(shellCharOptions)).not.toThrow();
      const jobs = createFFmpegJobs(shellCharOptions);
      expect(jobs).toHaveLength(5);
      expect(jobs[0].inputFile).toBe('My Video & More.mp4');
      expect(jobs[1].inputFile).toBe('Episode 1|2.mkv');
      expect(jobs[2].inputFile).toBe('File;Name.avi');
      expect(jobs[3].inputFile).toBe('Test$File.mov');
      expect(jobs[4].inputFile).toBe('Back`tick.mp4');
    });

    it('should validate generated commands', () => {
      const jobConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'Test Job',
      };

      const command = generateFFmpegCommand(jobConfig);

      expect(() => validateFFmpegCommand(command)).not.toThrow();
    });

    it('should reject non-ffmpeg commands', () => {
      const maliciousCommand = {
        args: ['rm', '-rf', '/'],
        displayCommand: 'rm -rf /',
        inputPath: 'input.mkv',
        outputPath: 'output.mp4',
        config: {} as FFmpegJobConfig,
      };

      expect(() => validateFFmpegCommand(maliciousCommand)).toThrow(
        'Only ffmpeg commands are allowed',
      );
    });
  });

  describe('generateAllFFmpegCommands', () => {
    it('should generate commands for all selected files', () => {
      const commands = generateAllFFmpegCommands(basicOptions);

      expect(commands).toHaveLength(2);
      expect(commands[0].inputPath).toBe('test-video.mkv');
      expect(commands[1].inputPath).toBe('another-video.mp4');

      // All commands should be valid
      commands.forEach((command) => {
        expect(() => validateFFmpegCommand(command)).not.toThrow();
      });
    });

    it('should return empty array for no selected files', () => {
      const emptyOptions = {
        ...basicOptions,
        selectedFiles: [],
      };

      const commands = generateAllFFmpegCommands(emptyOptions);
      expect(commands).toHaveLength(0);
    });
  });

  describe('Different Codec Combinations', () => {
    it('should generate H.264 commands', () => {
      const h264Config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          basic: {
            ...basicOptions.basic,
            videoCodec: 'libx264',
          },
        },
        jobName: 'H.264 Test',
      };

      const command = generateFFmpegCommand(h264Config);
      expect(command.args).toContain('-c:v');
      expect(command.args).toContain('libx264');
    });

    it('should generate AV1 commands', () => {
      const av1Config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          basic: {
            ...basicOptions.basic,
            videoCodec: 'libsvtav1',
          },
        },
        jobName: 'AV1 Test',
      };

      const command = generateFFmpegCommand(av1Config);
      expect(command.args).toContain('-c:v');
      expect(command.args).toContain('libsvtav1');
    });

    it('should handle AAC codec with VBR quality', () => {
      const aacConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            audio: {
              codec: 'aac',
              quality: 'high',
            },
          },
        },
        jobName: 'AAC Test',
      };

      const command = generateFFmpegCommand(aacConfig);
      expect(command.args).toContain('-c:a');
      expect(command.args).toContain('aac');
      // AAC uses -q:a for VBR quality
      expect(command.args).toContain('-q:a');
      expect(command.args).toContain('1'); // high quality = 1
    });

    it('should handle Opus codec with compression level', () => {
      const opusConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.webm',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            audio: {
              codec: 'libopus',
              quality: 'high',
            },
          },
        },
        jobName: 'Opus Test',
      };

      const command = generateFFmpegCommand(opusConfig);
      expect(command.args).toContain('-c:a');
      expect(command.args).toContain('libopus');
      // Opus uses -compression_level
      expect(command.args).toContain('-compression_level');
      expect(command.args).toContain('0'); // high quality = 0
    });

    it('should handle AC3 codec with CBR bitrate', () => {
      const ac3Config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mkv',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            audio: {
              codec: 'ac3',
              quality: 'high',
            },
          },
        },
        jobName: 'AC3 Test',
      };

      const command = generateFFmpegCommand(ac3Config);
      expect(command.args).toContain('-c:a');
      expect(command.args).toContain('ac3');
      // AC3 uses CBR bitrate
      expect(command.args).toContain('-b:a');
      expect(command.args).toContain('640k'); // high quality = 640k
    });

    it('should handle FLAC codec without quality settings', () => {
      const flacConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mkv',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            audio: {
              codec: 'flac',
              quality: 'high', // Ignored for FLAC
            },
          },
        },
        jobName: 'FLAC Test',
      };

      const command = generateFFmpegCommand(flacConfig);
      expect(command.args).toContain('-c:a');
      expect(command.args).toContain('flac');
      // FLAC is lossless, no quality/bitrate settings
      expect(command.args).not.toContain('-q:a');
      expect(command.args).not.toContain('-b:a');
      expect(command.args).not.toContain('-compression_level');
    });

    it('should map video, audio, and subtitle streams selectively', () => {
      // Map streams selectively to:
      // - Include only the first video stream (excludes attached pictures like cover art)
      // - Include all audio streams
      // - Include all subtitle streams
      const config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'Map Test',
      };

      const command = generateFFmpegCommand(config);

      // Find all -map arguments
      const mapArgs: string[] = [];
      for (let i = 0; i < command.args.length; i++) {
        if (command.args[i] === '-map') {
          mapArgs.push(command.args[i + 1]);
        }
      }

      // Should have three -map arguments: video, audio, subtitle
      expect(mapArgs).toEqual(['0:v:0', '0:a?', '0:s?']);

      // Verify -map comes after -i input and before codec options
      const inputIndex = command.args.indexOf('-i');
      const firstMapIndex = command.args.indexOf('-map');
      const videoCodecIndex = command.args.indexOf('-c:v');
      expect(firstMapIndex).toBeGreaterThan(inputIndex);
      expect(firstMapIndex).toBeLessThan(videoCodecIndex);
    });

    it('should map all streams when removeExtraVideoStreams is disabled', () => {
      // When the option is disabled, use -map 0 to include all streams
      // including attached pictures (cover art)
      const config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            removeExtraVideoStreams: false,
          },
        },
        jobName: 'Map All Streams Test',
      };

      const command = generateFFmpegCommand(config);

      // Find all -map arguments
      const mapArgs: string[] = [];
      for (let i = 0; i < command.args.length; i++) {
        if (command.args[i] === '-map') {
          mapArgs.push(command.args[i + 1]);
        }
      }

      // Should have single -map 0 argument
      expect(mapArgs).toEqual(['0']);

      // Verify -map comes after -i input and before codec options
      const inputIndex = command.args.indexOf('-i');
      const firstMapIndex = command.args.indexOf('-map');
      const videoCodecIndex = command.args.indexOf('-c:v');
      expect(firstMapIndex).toBeGreaterThan(inputIndex);
      expect(firstMapIndex).toBeLessThan(videoCodecIndex);
    });

    it('should use stream-specific codecs when keeping all streams with attached pictures', () => {
      // When removeExtraVideoStreams is disabled and there are attached pictures,
      // encode the main video but copy attached pictures
      const config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            removeExtraVideoStreams: false,
          },
        },
        jobName: 'Stream-Specific Codec Test',
        videoStreams: [
          { videoIndex: 0, isAttachedPic: false }, // Main video
          { videoIndex: 1, isAttachedPic: true }, // Cover art
        ],
      };

      const command = generateFFmpegCommand(config);

      // Should use stream-specific codecs
      expect(command.args).toContain('-c:v:0');
      expect(command.args).toContain('libx265');
      expect(command.args).toContain('-c:v:1');
      expect(command.args).toContain('copy');

      // Should NOT have generic -c:v (without stream specifier)
      const genericCodecIndex = command.args.findIndex(
        (arg, i) => arg === '-c:v' && command.args[i + 1] !== undefined,
      );
      expect(genericCodecIndex).toBe(-1);
    });

    it('should handle attached picture as first video stream', () => {
      // Edge case: attached picture appears before main video
      const config: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: {
          ...basicOptions,
          advanced: {
            ...basicOptions.advanced,
            removeExtraVideoStreams: false,
          },
        },
        jobName: 'Attached Pic First Test',
        videoStreams: [
          { videoIndex: 0, isAttachedPic: true }, // Cover art first
          { videoIndex: 1, isAttachedPic: false }, // Main video second
        ],
      };

      const command = generateFFmpegCommand(config);

      // First video stream (attached pic) should be copied
      const cv0Index = command.args.indexOf('-c:v:0');
      expect(cv0Index).toBeGreaterThan(-1);
      expect(command.args[cv0Index + 1]).toBe('copy');

      // Second video stream (main video) should be encoded
      const cv1Index = command.args.indexOf('-c:v:1');
      expect(cv1Index).toBeGreaterThan(-1);
      expect(command.args[cv1Index + 1]).toBe('libx265');
    });
  });

  describe('Subtitle Handling', () => {
    it('should convert ASS subtitles to ASS (text format)', () => {
      const assConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'ASS Subtitle Test',
        subtitleCodecs: ['ass'],
      };

      const command = generateFFmpegCommand(assConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should convert SSA subtitles to ASS (text format)', () => {
      const ssaConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'SSA Subtitle Test',
        subtitleCodecs: ['ssa'],
      };

      const command = generateFFmpegCommand(ssaConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should convert SRT subtitles to ASS (text format)', () => {
      const srtConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'SRT Subtitle Test',
        subtitleCodecs: ['srt'],
      };

      const command = generateFFmpegCommand(srtConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should convert SubRip subtitles to ASS (text format)', () => {
      const subripConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'SubRip Subtitle Test',
        subtitleCodecs: ['subrip'],
      };

      const command = generateFFmpegCommand(subripConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should copy subtitles when format is PGS (bitmap format)', () => {
      const pgsConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'PGS Subtitle Test',
        subtitleCodecs: ['hdmv_pgs_subtitle'],
      };

      const command = generateFFmpegCommand(pgsConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('copy');
      expect(command.args).not.toContain('-sn');
    });

    it('should copy subtitles when format is VOBSUB (bitmap format)', () => {
      const vobsubConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'VOBSUB Subtitle Test',
        subtitleCodecs: ['dvd_subtitle'],
      };

      const command = generateFFmpegCommand(vobsubConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('copy');
      expect(command.args).not.toContain('-sn');
    });

    it('should skip subtitles when no subtitle streams are present', () => {
      const noSubsConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'No Subtitles Test',
        subtitleCodecs: [],
      };

      const command = generateFFmpegCommand(noSubsConfig);
      expect(command.args).toContain('-sn');
      expect(command.args).not.toContain('-c:s');
    });

    it('should convert to ASS when all subtitle streams are text-based (mixed ASS and SRT)', () => {
      const mixedConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'Mixed Text Subtitles Test',
        subtitleCodecs: ['ass', 'srt', 'subrip'],
      };

      const command = generateFFmpegCommand(mixedConfig);
      const csIndex = command.args.indexOf('-c:s');
      expect(csIndex).toBeGreaterThan(-1);
      expect(command.args[csIndex + 1]).toBe('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should copy when mixing bitmap and text subtitles', () => {
      const mixedIncompatibleConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'Mixed Bitmap and Text Subtitles Test',
        subtitleCodecs: ['ass', 'hdmv_pgs_subtitle'],
      };

      const command = generateFFmpegCommand(mixedIncompatibleConfig);
      expect(command.args).toContain('-c:s');
      expect(command.args).toContain('copy');
      expect(command.args).not.toContain('-sn');
    });

    it('should convert mov_text to ASS (text-based format)', () => {
      const movTextConfig: FFmpegJobConfig = {
        inputFile: 'input.mp4',
        outputFile: 'output.mkv',
        options: basicOptions,
        jobName: 'mov_text Subtitle Test',
        subtitleCodecs: ['mov_text'],
      };

      const command = generateFFmpegCommand(movTextConfig);
      const csIndex = command.args.indexOf('-c:s');
      expect(csIndex).toBeGreaterThan(-1);
      expect(command.args[csIndex + 1]).toBe('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should convert webvtt to ASS (text-based format)', () => {
      const webvttConfig: FFmpegJobConfig = {
        inputFile: 'input.webm',
        outputFile: 'output.mkv',
        options: basicOptions,
        jobName: 'WebVTT Subtitle Test',
        subtitleCodecs: ['webvtt'],
      };

      const command = generateFFmpegCommand(webvttConfig);
      const csIndex = command.args.indexOf('-c:s');
      expect(csIndex).toBeGreaterThan(-1);
      expect(command.args[csIndex + 1]).toBe('ass');
      expect(command.args).not.toContain('-sn');
    });

    it('should handle case-insensitive subtitle codec names', () => {
      const uppercaseConfig: FFmpegJobConfig = {
        inputFile: 'input.mkv',
        outputFile: 'output.mp4',
        options: basicOptions,
        jobName: 'Uppercase Subtitle Test',
        subtitleCodecs: ['ASS', 'SRT'],
      };

      const command = generateFFmpegCommand(uppercaseConfig);
      const csIndex = command.args.indexOf('-c:s');
      expect(csIndex).toBeGreaterThan(-1);
      expect(command.args[csIndex + 1]).toBe('ass');
      expect(command.args).not.toContain('-sn');
    });
  });
});
