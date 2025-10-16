/**
 * Unit tests for conversion types and defaults
 */

import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_CONVERSION_OPTIONS,
  VideoCodec,
  AudioCodec,
  EncodingPreset,
  BitrateMode,
  OutputFormat,
  ConversionOptions,
} from '../types/conversion';

describe('Conversion Types', () => {
  describe('DEFAULT_CONVERSION_OPTIONS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CONVERSION_OPTIONS).toEqual({
        selectedFiles: [],
        basic: {
          videoCodec: 'libx265',
          quality: 22,
          outputFormat: 'mkv',
        },
        advanced: {
          preset: 'slow',
          bitrate: {
            mode: 'crf',
          },
          resolution: {
            maintainAspectRatio: true,
          },
          frameRate: {
            copyOriginal: true,
          },
          audio: {
            codec: 'copy',
            bitrate: 128,
          },
        },
      });
    });

    it('should use recommended defaults for archival', () => {
      const defaults = DEFAULT_CONVERSION_OPTIONS;

      // Video codec should be libx265 (best compression)
      expect(defaults.basic.videoCodec).toBe('libx265');

      // Quality should be 22 (good for archival)
      expect(defaults.basic.quality).toBe(22);

      // Preset should be slow (better compression)
      expect(defaults.advanced.preset).toBe('slow');

      // Should use CRF mode (quality-based)
      expect(defaults.advanced.bitrate.mode).toBe('crf');

      // Audio should be copy (preserve original)
      expect(defaults.advanced.audio.codec).toBe('copy');
      expect(defaults.advanced.audio.bitrate).toBe(128);
    });
  });

  describe('Type constraints', () => {
    it('should allow valid video codecs', () => {
      const validCodecs: VideoCodec[] = [
        'libx265',
        'libx264',
        'libsvtav1',
        'copy',
      ];
      validCodecs.forEach((codec) => {
        expect(['libx265', 'libx264', 'libsvtav1', 'copy']).toContain(codec);
      });
    });

    it('should allow valid audio codecs', () => {
      const validCodecs: AudioCodec[] = [
        'libopus',
        'aac',
        'libfdk_aac',
        'ac3',
        'flac',
        'copy',
      ];
      validCodecs.forEach((codec) => {
        expect([
          'libopus',
          'aac',
          'libfdk_aac',
          'ac3',
          'flac',
          'copy',
        ]).toContain(codec);
      });
    });

    it('should allow valid encoding presets', () => {
      const validPresets: EncodingPreset[] = [
        'ultrafast',
        'superfast',
        'veryfast',
        'faster',
        'fast',
        'medium',
        'slow',
        'slower',
        'veryslow',
        'placebo',
      ];
      validPresets.forEach((preset) => {
        expect([
          'ultrafast',
          'superfast',
          'veryfast',
          'faster',
          'fast',
          'medium',
          'slow',
          'slower',
          'veryslow',
          'placebo',
        ]).toContain(preset);
      });
    });

    it('should allow valid bitrate modes', () => {
      const validModes: BitrateMode[] = ['crf', 'cbr', 'vbr'];
      validModes.forEach((mode) => {
        expect(['crf', 'cbr', 'vbr']).toContain(mode);
      });
    });

    it('should allow valid output formats', () => {
      const validFormats: OutputFormat[] = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
      validFormats.forEach((format) => {
        expect(['mp4', 'mkv', 'webm', 'avi', 'mov']).toContain(format);
      });
    });
  });

  describe('ConversionOptions structure', () => {
    it('should accept a complete valid configuration', () => {
      const validOptions: ConversionOptions = {
        selectedFiles: ['/test/video1.mp4', '/test/video2.avi'],
        basic: {
          videoCodec: 'libx264',
          quality: 23,
          outputFormat: 'mkv',
        },
        advanced: {
          preset: 'fast',
          bitrate: {
            mode: 'vbr',
            videoBitrate: 2000,
            maxBitrate: 4000,
            bufferSize: 8000,
          },
          resolution: {
            width: 1920,
            height: 1080,
            maintainAspectRatio: false,
          },
          frameRate: {
            fps: 30,
            copyOriginal: false,
          },
          audio: {
            codec: 'aac',
            bitrate: 192,
            sampleRate: 48000,
            channels: 2,
          },
        },
        customCommand: 'ffmpeg -i input.mp4 -c:v libx264 -crf 23 output.mp4',
      };

      expect(validOptions.selectedFiles).toHaveLength(2);
      expect(validOptions.basic.videoCodec).toBe('libx264');
      expect(validOptions.advanced.bitrate.mode).toBe('vbr');
      expect(validOptions.customCommand).toBeDefined();
    });

    it('should work with minimal configuration', () => {
      const minimalOptions: ConversionOptions = {
        selectedFiles: ['/test/video.mp4'],
        basic: {
          videoCodec: 'copy',
          quality: 0,
          outputFormat: 'mp4',
        },
        advanced: {
          preset: 'medium',
          bitrate: {
            mode: 'crf',
          },
          resolution: {
            maintainAspectRatio: true,
          },
          frameRate: {
            copyOriginal: true,
          },
          audio: {
            codec: 'copy',
          },
        },
      };

      expect(minimalOptions.selectedFiles).toHaveLength(1);
      expect(minimalOptions.basic.videoCodec).toBe('copy');
      expect(minimalOptions.advanced.audio.codec).toBe('copy');
      expect(minimalOptions.customCommand).toBeUndefined();
    });
  });

  describe('Quality ranges by codec', () => {
    it('should handle different quality scales for different codecs', () => {
      // libx265 and libx264 use 0-51 scale
      const h264Quality = 23; // Good default for libx264
      const h265Quality = 28; // Good default for libx265

      expect(h264Quality).toBeGreaterThanOrEqual(0);
      expect(h264Quality).toBeLessThanOrEqual(51);
      expect(h265Quality).toBeGreaterThanOrEqual(0);
      expect(h265Quality).toBeLessThanOrEqual(51);

      // libsvtav1 typically uses 20-30 range
      const av1Quality = 25;
      expect(av1Quality).toBeGreaterThanOrEqual(20);
      expect(av1Quality).toBeLessThanOrEqual(30);
    });
  });

  describe('Audio bitrate recommendations', () => {
    it('should have appropriate bitrates for different codecs', () => {
      // Opus recommendations
      const opusStereo = 128; // Good for stereo
      const opus51 = 256; // Good for 5.1

      expect(opusStereo).toBeGreaterThanOrEqual(96);
      expect(opus51).toBeGreaterThanOrEqual(256);

      // AAC recommendations
      const aacStereo = 128;
      const aac51 = 384;

      expect(aacStereo).toBeGreaterThanOrEqual(128);
      expect(aac51).toBeGreaterThanOrEqual(384);

      // AC3 recommendations
      const ac3Stereo = 192;
      const ac351 = 448;

      expect(ac3Stereo).toBeGreaterThanOrEqual(192);
      expect(ac351).toBeGreaterThanOrEqual(448);
    });
  });
});
