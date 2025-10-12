import React, { useState, useEffect } from 'react';
import {
  ConversionOptions,
  DEFAULT_CONVERSION_OPTIONS,
  VideoCodec,
  OutputFormat,
  EncodingPreset,
  AudioCodec,
  BitrateMode,
} from '@/types/conversion';

interface ConversionConfigProps {
  /** Selected files with their relative paths */
  selectedFiles: string[];
  /** Callback when conversion options change */
  onOptionsChange: (options: ConversionOptions) => void;
  /** Callback when user wants to start conversion */
  onStartConversion: (options: ConversionOptions) => void;
  /** Callback when files are removed */
  onFilesChange?: (files: string[]) => void;
}

export function ConversionConfig({
  selectedFiles,
  onOptionsChange,
  onStartConversion,
  onFilesChange,
}: ConversionConfigProps) {
  const [options, setOptions] = useState<ConversionOptions>({
    ...DEFAULT_CONVERSION_OPTIONS,
    selectedFiles,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCustomOptions, setShowCustomOptions] = useState(false);
  const [removedHistory, setRemovedHistory] = useState<string[]>([]);
  const MAX_UNDO_HISTORY = 10;

  // Load saved options from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('frame-shift-conversion-options');
      if (saved) {
        const savedOptions = JSON.parse(saved);
        setOptions({
          ...savedOptions,
          selectedFiles, // Always use current selected files
        });
      }
    } catch (error) {
      console.error('Failed to load saved options:', error);
    }
  }, [selectedFiles]);

  // Save options to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        'frame-shift-conversion-options',
        JSON.stringify(options),
      );
      onOptionsChange(options);
    } catch (error) {
      console.error('Failed to save options:', error);
    }
  }, [options, onOptionsChange]);

  const updateBasicOption = <K extends keyof ConversionOptions['basic']>(
    key: K,
    value: ConversionOptions['basic'][K],
  ) => {
    setOptions((prev) => ({
      ...prev,
      basic: {
        ...prev.basic,
        [key]: value,
      },
    }));
  };

  const updateAdvancedOption = <K extends keyof ConversionOptions['advanced']>(
    key: K,
    value: ConversionOptions['advanced'][K],
  ) => {
    setOptions((prev) => ({
      ...prev,
      advanced: {
        ...prev.advanced,
        [key]: value,
      },
    }));
  };

  const handleStartConversion = () => {
    console.log(
      'Starting conversion with options:',
      JSON.stringify(options, null, 2),
    );
    onStartConversion(options);
  };

  const handleRemoveFile = (fileToRemove: string) => {
    const newFiles = selectedFiles.filter((f) => f !== fileToRemove);
    // Add to history, keeping only the last MAX_UNDO_HISTORY items
    setRemovedHistory((prev) =>
      [fileToRemove, ...prev].slice(0, MAX_UNDO_HISTORY),
    );
    onFilesChange?.(newFiles);
  };

  const handleUndo = () => {
    if (removedHistory.length > 0) {
      const fileToRestore = removedHistory[0];
      const newFiles = [...selectedFiles, fileToRestore];
      setRemovedHistory((prev) => prev.slice(1));
      onFilesChange?.(newFiles);
    }
  };

  // Get quality range based on codec
  const getQualityRange = (codec: VideoCodec) => {
    switch (codec) {
      case 'libx265':
        return {
          min: 0,
          max: 51,
          default: 28,
          recommended: '20 for archival (lower = higher quality)',
        };
      case 'libx264':
        return {
          min: 0,
          max: 51,
          default: 23,
          recommended: '20 for archival (lower = higher quality)',
        };
      case 'libsvtav1':
        return {
          min: 20,
          max: 30,
          default: 25,
          recommended: '25 for archival (higher = higher quality)',
        };
      default:
        return {
          min: 0,
          max: 51,
          default: 25,
          recommended: 'N/A for copy mode',
        };
    }
  };

  const qualityRange = getQualityRange(options.basic.videoCodec);

  return (
    <div className="p-6 space-y-6">
      {/* Selected Files Display */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white">
            Selected Files ({selectedFiles.length})
          </h3>
          {removedHistory.length > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              title={`Undo (${removedHistory.length} action${removedHistory.length !== 1 ? 's' : ''} available)`}
            >
              <span>↶</span>
              <span>Undo</span>
              {removedHistory.length > 1 && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500 rounded text-xs">
                  {removedHistory.length}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between text-sm font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 rounded px-2 py-1 group"
            >
              <span className="truncate flex-1 mr-2">{file}</span>
              <button
                onClick={() => handleRemoveFile(file)}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${file}`}
                title="Remove file"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Basic Options */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Basic Options
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Video Codec */}
          <div>
            <label
              htmlFor="video-codec"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Video Codec
            </label>
            <select
              id="video-codec"
              value={options.basic.videoCodec}
              onChange={(e) =>
                updateBasicOption('videoCodec', e.target.value as VideoCodec)
              }
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="libx265">H.265 (HEVC) - Best compression</option>
              <option value="libx264">H.264 (AVC) - More compatible</option>
              <option value="libsvtav1">
                AV1 - Better compression, slower
              </option>
              <option value="copy">Copy - No re-encoding</option>
            </select>
          </div>

          {/* Output Format */}
          <div>
            <label
              htmlFor="output-format"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Output Format
            </label>
            <select
              id="output-format"
              value={options.basic.outputFormat}
              onChange={(e) =>
                updateBasicOption(
                  'outputFormat',
                  e.target.value as OutputFormat,
                )
              }
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="mp4">MP4 - Most compatible</option>
              <option value="mkv">MKV - Open standard</option>
              <option value="webm">WebM - Web optimized</option>
              <option value="avi">AVI - Legacy format</option>
              <option value="mov">MOV - Apple format</option>
            </select>
          </div>
        </div>
      </div>

      {/* Advanced Options Toggle */}
      <div className="flex items-center">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          <span
            className={`transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          Advanced Options
        </button>
      </div>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Advanced Options
          </h3>

          <div className="space-y-6">
            {/* Encoding Preset */}
            <div>
              <label
                htmlFor="encoding-preset"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Encoding Preset (Speed vs Compression)
              </label>
              <select
                id="encoding-preset"
                value={options.advanced.preset}
                onChange={(e) =>
                  updateAdvancedOption(
                    'preset',
                    e.target.value as EncodingPreset,
                  )
                }
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="ultrafast">Ultra Fast - Poor compression</option>
                <option value="superfast">Super Fast - Poor compression</option>
                <option value="veryfast">Very Fast - Poor compression</option>
                <option value="faster">Faster - Decent compression</option>
                <option value="fast">Fast - Decent compression</option>
                <option value="medium">Medium - Balanced</option>
                <option value="slow">
                  Slow - Better compression (recommended)
                </option>
                <option value="slower">Slower - Best compression</option>
                <option value="veryslow">Very Slow - Best compression</option>
              </select>
            </div>

            {/* Bitrate Control */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="bitrate-mode"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Bitrate Mode
                </label>
                <select
                  id="bitrate-mode"
                  value={options.advanced.bitrate.mode}
                  onChange={(e) =>
                    updateAdvancedOption('bitrate', {
                      ...options.advanced.bitrate,
                      mode: e.target.value as BitrateMode,
                    })
                  }
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="crf">CRF - Quality-based (recommended)</option>
                  <option value="cbr">CBR - Constant bitrate</option>
                  <option value="vbr">VBR - Variable bitrate</option>
                </select>
              </div>

              {options.advanced.bitrate.mode === 'crf' ? (
                <div>
                  <label
                    htmlFor="quality-slider"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Quality (CRF: {options.basic.quality})
                  </label>
                  <input
                    id="quality-slider"
                    type="range"
                    min={qualityRange.min}
                    max={qualityRange.max}
                    value={options.basic.quality}
                    onChange={(e) =>
                      updateBasicOption('quality', parseInt(e.target.value))
                    }
                    disabled={options.basic.videoCodec === 'copy'}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {qualityRange.recommended}
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="video-bitrate"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Video Bitrate (kbps)
                  </label>
                  <input
                    id="video-bitrate"
                    type="number"
                    value={options.advanced.bitrate.videoBitrate || ''}
                    onChange={(e) =>
                      updateAdvancedOption('bitrate', {
                        ...options.advanced.bitrate,
                        videoBitrate: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="e.g., 2000"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            {/* Audio Settings */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Audio Settings
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="audio-codec"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Audio Codec
                  </label>
                  <select
                    id="audio-codec"
                    value={options.advanced.audio.codec}
                    onChange={(e) =>
                      updateAdvancedOption('audio', {
                        ...options.advanced.audio,
                        codec: e.target.value as AudioCodec,
                      })
                    }
                    className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="libopus">
                      Opus - Best quality/size (recommended)
                    </option>
                    <option value="aac">AAC - Good compatibility</option>
                    <option value="libfdk_aac">AAC (High quality)</option>
                    <option value="ac3">AC3 - Dolby Digital</option>
                    <option value="flac">FLAC - Lossless</option>
                    <option value="copy">Copy - No re-encoding</option>
                  </select>
                </div>

                {options.advanced.audio.codec !== 'copy' && (
                  <div>
                    <label
                      htmlFor="audio-bitrate"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                    >
                      Audio Bitrate (kbps)
                    </label>
                    <input
                      id="audio-bitrate"
                      type="number"
                      value={options.advanced.audio.bitrate || ''}
                      onChange={(e) =>
                        updateAdvancedOption('audio', {
                          ...options.advanced.audio,
                          bitrate: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="e.g., 128"
                      className="p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Options Toggle */}
      <div className="flex items-center">
        <button
          onClick={() => setShowCustomOptions(!showCustomOptions)}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          <span
            className={`transform transition-transform ${showCustomOptions ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          Custom FFmpeg Options
        </button>
      </div>

      {/* Custom Options */}
      {showCustomOptions && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Custom FFmpeg Options (Additional options to append to the generated
            command)
          </label>
          <textarea
            value={options.customCommand || ''}
            onChange={(e) =>
              setOptions((prev) => ({
                ...prev,
                customCommand: e.target.value || undefined,
              }))
            }
            placeholder="-tune film -profile:v high -level 4.1"
            rows={3}
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Enter additional FFmpeg options that will be added to the command
            built from your settings above. Do not include input/output files or
            basic codec settings.
          </div>
        </div>
      )}
    </div>
  );
}
