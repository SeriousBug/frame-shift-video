/**
 * Video conversion configuration types with FFmpeg CLI flag documentation
 */

/**
 * Video codec options for FFmpeg -c:v flag
 */
export type VideoCodec =
  /** H.265/HEVC - Best compression, recommended for archival (maps to -c:v libx265) */
  | 'libx265'
  /** H.264/AVC - More compatible, larger files (maps to -c:v libx264) */
  | 'libx264'
  /** AV1 - Even better compression but slower, requires FFmpeg 5.1+ (maps to -c:v libsvtav1) */
  | 'libsvtav1'
  /** Stream copy - No re-encoding (maps to -c:v copy) */
  | 'copy';

/**
 * Encoding speed/efficiency presets for FFmpeg -preset flag
 */
export type EncodingPreset =
  /** Fast but poor compression */
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  /** Reasonable speed, decent compression */
  | 'faster'
  | 'fast'
  /** Default, balanced (maps to -preset medium) */
  | 'medium'
  /** Recommended for archival - better compression, worth the time (maps to -preset slow) */
  | 'slow'
  /** Best compression, very slow */
  | 'slower'
  | 'veryslow'
  /** Negligible improvement over veryslow, not recommended */
  | 'placebo';

/**
 * Audio codec options for FFmpeg -c:a flag
 */
export type AudioCodec =
  /** Best quality/size ratio, supported by Plex (maps to -c:a libopus) */
  | 'libopus'
  /** AAC using native encoder (maps to -c:a aac) */
  | 'aac'
  /** Dolby Digital for 5.1 passthrough (maps to -c:a ac3) */
  | 'ac3'
  /** Lossless for archival (maps to -c:a flac) */
  | 'flac'
  /** Stream copy - preserve original audio (maps to -c:a copy) */
  | 'copy';

/**
 * Audio quality presets for simplified bitrate selection
 * Maps to VBR settings for supported codecs (AAC, Opus) or CBR for AC3
 */
export type AudioQuality =
  /** Lower quality, smaller file size */
  | 'low'
  /** Balanced quality and file size (default) */
  | 'medium'
  /** Higher quality, larger file size */
  | 'high';

/**
 * Bitrate control mode for video encoding
 */
export type BitrateMode =
  /** Constant Rate Factor - preferred for quality-based encoding (maps to -crf) */
  | 'crf'
  /** Constant bitrate (maps to -b:v) */
  | 'cbr'
  /** Variable bitrate with target average (maps to -b:v with -maxrate/-bufsize) */
  | 'vbr';

/**
 * Common video output formats
 */
export type OutputFormat = 'mp4' | 'mkv' | 'webm' | 'avi' | 'mov';

/**
 * Basic conversion options for simple UI
 */
export interface BasicConversionOptions {
  /** Video codec preset (maps to -c:v flag) */
  videoCodec: VideoCodec;

  /**
   * Quality setting using CRF (Constant Rate Factor)
   * For libx265: 0-51, default 28, recommended 18-22 for archival
   * For libx264: 0-51, default 23, recommended 18-22 for archival
   * For libsvtav1: 20-30 (different scale)
   * Lower = better quality, higher file size (maps to -crf flag)
   */
  quality: number;

  /** Output container format */
  outputFormat: OutputFormat;
}

/**
 * Advanced conversion options for power users
 */
export interface AdvancedConversionOptions {
  /** Encoding speed/efficiency preset (maps to -preset flag) */
  preset: EncodingPreset;

  /** Bitrate control configuration */
  bitrate: {
    /** Bitrate control mode */
    mode: BitrateMode;
    /** Target video bitrate in kbps (maps to -b:v flag) */
    videoBitrate?: number;
    /** Maximum bitrate for VBR mode in kbps (maps to -maxrate flag) */
    maxBitrate?: number;
    /** Buffer size for rate control in kbps (maps to -bufsize flag) */
    bufferSize?: number;
  };

  /** Video resolution settings */
  resolution: {
    /** Custom width in pixels (maps to -vf scale=W:H) */
    width?: number;
    /** Custom height in pixels (maps to -vf scale=W:H) */
    height?: number;
    /** Keep aspect ratio when scaling */
    maintainAspectRatio: boolean;
  };

  /** Frame rate settings */
  frameRate: {
    /** Target frame rate in fps (maps to -r flag) */
    fps?: number;
    /** Copy original frame rate */
    copyOriginal: boolean;
  };

  /** Audio encoding settings */
  audio: {
    /** Audio codec (maps to -c:a flag) */
    codec: AudioCodec;
    /**
     * Audio quality preset (low, medium, high)
     * Maps to VBR quality settings for AAC/Opus, CBR for AC3
     * Ignored for FLAC (always lossless) and copy mode
     */
    quality: AudioQuality;
    /** Sample rate in Hz (maps to -ar flag) */
    sampleRate?: number;
    /** Number of audio channels (maps to -ac flag) */
    channels?: number;
  };
}

/**
 * Complete conversion configuration
 */
export interface ConversionOptions {
  /** Selected input files with their relative paths */
  selectedFiles: string[];

  /** Basic conversion settings */
  basic: BasicConversionOptions;

  /** Advanced conversion settings */
  advanced: AdvancedConversionOptions;

  /** Custom FFmpeg command (overrides all other options if provided) */
  customCommand?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
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
      codec: 'libopus',
      quality: 'high',
    },
  },
};
