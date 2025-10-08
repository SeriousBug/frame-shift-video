/**
 * Unit tests for the ConversionConfig component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversionConfig } from '../components/conversion-config';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('ConversionConfig', () => {
  const mockOnOptionsChange = vi.fn();
  const mockOnStartConversion = vi.fn();
  const defaultProps = {
    selectedFiles: ['/test/video1.mp4', '/test/video2.avi'],
    onOptionsChange: mockOnOptionsChange,
    onStartConversion: mockOnStartConversion,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render selected files', () => {
    render(<ConversionConfig {...defaultProps} />);
    
    expect(screen.getByText('Selected Files (2)')).toBeInTheDocument();
    expect(screen.getByText('/test/video1.mp4')).toBeInTheDocument();
    expect(screen.getByText('/test/video2.avi')).toBeInTheDocument();
  });

  it('should render basic options with default values', () => {
    render(<ConversionConfig {...defaultProps} />);
    
    expect(screen.getByText('Basic Options')).toBeInTheDocument();
    
    // Check video codec dropdown
    const videoCodecSelect = screen.getByDisplayValue('H.265 (HEVC) - Best compression');
    expect(videoCodecSelect).toBeInTheDocument();
    
    // Check quality slider
    const qualitySlider = screen.getByDisplayValue('22');
    expect(qualitySlider).toBeInTheDocument();
    
    // Check output format
    const outputFormatSelect = screen.getByDisplayValue('MP4 - Most compatible');
    expect(outputFormatSelect).toBeInTheDocument();
  });

  it('should show/hide advanced options when toggled', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Advanced options should be hidden initially
    expect(screen.queryByText('Encoding Preset')).not.toBeInTheDocument();
    
    // Click to show advanced options
    const advancedToggle = screen.getByText('Advanced Options');
    fireEvent.click(advancedToggle);
    
    // Advanced options should now be visible
    await waitFor(() => {
      expect(screen.getByText('Encoding Preset (Speed vs Compression)')).toBeInTheDocument();
    });
  });

  it('should update basic options and call onOptionsChange', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Change video codec
    const videoCodecSelect = screen.getByLabelText('Video Codec');
    fireEvent.change(videoCodecSelect, { target: { value: 'libx264' } });
    
    await waitFor(() => {
      expect(mockOnOptionsChange).toHaveBeenCalled();
    });
    
    const lastCall = mockOnOptionsChange.mock.calls[mockOnOptionsChange.mock.calls.length - 1][0];
    expect(lastCall.basic.videoCodec).toBe('libx264');
  });

  it('should update quality slider and call onOptionsChange', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    const qualitySlider = screen.getByLabelText(/Quality \(CRF:/);
    fireEvent.change(qualitySlider, { target: { value: '18' } });
    
    await waitFor(() => {
      expect(mockOnOptionsChange).toHaveBeenCalled();
    });
    
    const lastCall = mockOnOptionsChange.mock.calls[mockOnOptionsChange.mock.calls.length - 1][0];
    expect(lastCall.basic.quality).toBe(18);
  });

  it('should disable quality slider when codec is copy', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    const videoCodecSelect = screen.getByLabelText('Video Codec');
    fireEvent.change(videoCodecSelect, { target: { value: 'copy' } });
    
    await waitFor(() => {
      const qualitySlider = screen.getByLabelText(/Quality \(CRF:/);
      expect(qualitySlider).toBeDisabled();
    });
  });

  it('should render advanced options when expanded', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Expand advanced options
    const advancedToggle = screen.getByText('Advanced Options');
    fireEvent.click(advancedToggle);
    
    await waitFor(() => {
      expect(screen.getByText('Encoding Preset (Speed vs Compression)')).toBeInTheDocument();
      expect(screen.getByText('Bitrate Mode')).toBeInTheDocument();
      expect(screen.getByText('Resolution')).toBeInTheDocument();
      expect(screen.getByText('Audio Settings')).toBeInTheDocument();
    });
  });

  it('should show bitrate input when not using CRF mode', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Expand advanced options
    const advancedToggle = screen.getByText('Advanced Options');
    fireEvent.click(advancedToggle);
    
    await waitFor(() => {
      const bitrateSelect = screen.getByLabelText('Bitrate Mode');
      fireEvent.change(bitrateSelect, { target: { value: 'cbr' } });
    });
    
    await waitFor(() => {
      expect(screen.getByLabelText('Video Bitrate (kbps)')).toBeInTheDocument();
    });
  });

  it('should hide audio bitrate when codec is copy', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Expand advanced options
    const advancedToggle = screen.getByText('Advanced Options');
    fireEvent.click(advancedToggle);
    
    await waitFor(() => {
      const audioCodecSelect = screen.getByDisplayValue('Opus - Best quality/size (recommended)');
      fireEvent.change(audioCodecSelect, { target: { value: 'copy' } });
    });
    
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Audio bitrate (kbps)')).not.toBeInTheDocument();
    });
  });

  it('should handle custom FFmpeg command', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    const customCommandTextarea = screen.getByPlaceholderText(/ffmpeg -i input.mp4/);
    const customCommand = 'ffmpeg -i input.mp4 -c:v libx264 -crf 20 output.mp4';
    
    fireEvent.change(customCommandTextarea, { target: { value: customCommand } });
    
    await waitFor(() => {
      expect(mockOnOptionsChange).toHaveBeenCalled();
    });
    
    const lastCall = mockOnOptionsChange.mock.calls[mockOnOptionsChange.mock.calls.length - 1][0];
    expect(lastCall.customCommand).toBe(customCommand);
  });

  it('should call onStartConversion when start button is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    render(<ConversionConfig {...defaultProps} />);
    
    const startButton = screen.getByText('Start Conversion');
    fireEvent.click(startButton);
    
    expect(mockOnStartConversion).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Starting conversion with options:',
      expect.any(String)
    );
    
    consoleSpy.mockRestore();
  });

  it('should disable start button when no files selected', () => {
    render(<ConversionConfig {...{ ...defaultProps, selectedFiles: [] }} />);
    
    const startButton = screen.getByText('Start Conversion');
    expect(startButton).toBeDisabled();
  });

  it('should load saved options from localStorage', () => {
    const savedOptions = {
      basic: {
        videoCodec: 'libx264',
        quality: 20,
        outputFormat: 'mkv',
      },
      advanced: {
        preset: 'fast',
        audio: {
          codec: 'aac',
          bitrate: 192,
        },
      },
    };
    
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedOptions));
    
    render(<ConversionConfig {...defaultProps} />);
    
    expect(localStorageMock.getItem).toHaveBeenCalledWith('frame-shift-conversion-options');
    
    // Check that saved options are applied
    expect(screen.getByDisplayValue('H.264 (AVC) - More compatible')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('MKV - Open standard')).toBeInTheDocument();
  });

  it('should save options to localStorage when they change', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    const videoCodecSelect = screen.getByLabelText('Video Codec');
    fireEvent.change(videoCodecSelect, { target: { value: 'libx264' } });
    
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'frame-shift-conversion-options',
        expect.stringContaining('libx264')
      );
    });
  });

  it('should handle localStorage errors gracefully', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('localStorage error');
    });
    
    render(<ConversionConfig {...defaultProps} />);
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load saved options:',
      expect.any(Error)
    );
    
    consoleErrorSpy.mockRestore();
  });

  it('should show quality range recommendations based on codec', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Should show libx265 recommendation by default
    expect(screen.getByText('18-22 for archival')).toBeInTheDocument();
    
    // Change to libx264
    const videoCodecSelect = screen.getByLabelText('Video Codec');
    fireEvent.change(videoCodecSelect, { target: { value: 'libx264' } });
    
    await waitFor(() => {
      expect(screen.getByText('18-22 for archival')).toBeInTheDocument();
    });
    
    // Change to AV1
    fireEvent.change(videoCodecSelect, { target: { value: 'libsvtav1' } });
    
    await waitFor(() => {
      expect(screen.getByText('20-30 (different scale)')).toBeInTheDocument();
    });
    
    // Change to copy
    fireEvent.change(videoCodecSelect, { target: { value: 'copy' } });
    
    await waitFor(() => {
      expect(screen.getByText('N/A for copy mode')).toBeInTheDocument();
    });
  });

  it('should handle resolution inputs correctly', async () => {
    render(<ConversionConfig {...defaultProps} />);
    
    // Expand advanced options
    const advancedToggle = screen.getByText('Advanced Options');
    fireEvent.click(advancedToggle);
    
    await waitFor(() => {
      const widthInput = screen.getByPlaceholderText('Width');
      const heightInput = screen.getByPlaceholderText('Height');
      const aspectRatioCheckbox = screen.getByLabelText('Keep aspect ratio');
      
      expect(widthInput).toBeInTheDocument();
      expect(heightInput).toBeInTheDocument();
      expect(aspectRatioCheckbox).toBeChecked(); // Should be checked by default
      
      // Test resolution inputs
      fireEvent.change(widthInput, { target: { value: '1920' } });
      fireEvent.change(heightInput, { target: { value: '1080' } });
      fireEvent.click(aspectRatioCheckbox); // Uncheck
    });
    
    await waitFor(() => {
      expect(mockOnOptionsChange).toHaveBeenCalled();
    });
  });
});