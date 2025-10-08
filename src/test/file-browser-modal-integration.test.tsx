/**
 * Integration tests for FileBrowserModal with ConversionConfig
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileBrowserModal } from '../components/file-browser-modal';

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('FileBrowserModal Integration', () => {
  const mockOnClose = vi.fn();
  const mockOnContinue = vi.fn();
  const mockOnGoBack = vi.fn();
  const mockOnStartConversion = vi.fn();

  const defaultProps = {
    isOpen: true,
    selectedFiles: ['/test/video1.mp4', '/test/video2.avi'],
    currentStep: 'select' as const,
    onClose: mockOnClose,
    onContinue: mockOnContinue,
    onGoBack: mockOnGoBack,
    onStartConversion: mockOnStartConversion,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    
    // Mock successful API response
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { name: 'video1.mp4', path: '/test/video1.mp4', isDirectory: false, size: 1024000 },
          { name: 'video2.avi', path: '/test/video2.avi', isDirectory: false, size: 2048000 },
          { name: 'folder1', path: '/test/folder1', isDirectory: true },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(<FileBrowserModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Select Files for Conversion')).not.toBeInTheDocument();
  });

  describe('Select Step', () => {
    it('should render file selection interface', async () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      expect(screen.getByText('Select Files for Conversion')).toBeInTheDocument();
      expect(screen.getByText('2 files selected')).toBeInTheDocument();
      expect(screen.getByText('Continue')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should show step indicator correctly for select step', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      // First step should be active (blue)
      const step1 = screen.getByText('1').closest('div');
      expect(step1).toHaveClass('bg-blue-600');
      
      // Second step should be inactive (gray)
      const step2 = screen.getByText('2').closest('div');
      expect(step2).toHaveClass('bg-gray-300');
    });

    it('should call onContinue when continue button is clicked', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      const continueButton = screen.getByText('Continue');
      fireEvent.click(continueButton);
      
      expect(mockOnContinue).toHaveBeenCalledWith(['/test/video1.mp4', '/test/video2.avi']);
    });

    it('should disable continue button when no files selected', () => {
      render(<FileBrowserModal {...defaultProps} selectedFiles={[]} />);
      
      const continueButton = screen.getByText('Continue');
      expect(continueButton).toBeDisabled();
      expect(screen.getByText('0 files selected')).toBeInTheDocument();
    });
  });

  describe('Configure Step', () => {
    const configureProps = {
      ...defaultProps,
      currentStep: 'configure' as const,
    };

    it('should render conversion configuration interface', () => {
      render(<FileBrowserModal {...configureProps} />);
      
      expect(screen.getByText('Configure Conversion')).toBeInTheDocument();
      expect(screen.getByText('2 files selected for conversion')).toBeInTheDocument();
      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should show step indicator correctly for configure step', () => {
      render(<FileBrowserModal {...configureProps} />);
      
      // First step should be completed (green)
      const step1 = screen.getByText('1').closest('div');
      expect(step1).toHaveClass('bg-green-600');
      
      // Second step should be active (blue)
      const step2 = screen.getByText('2').closest('div');
      expect(step2).toHaveClass('bg-blue-600');
    });

    it('should render ConversionConfig component with selected files', () => {
      render(<FileBrowserModal {...configureProps} />);
      
      expect(screen.getByText('Selected Files (2)')).toBeInTheDocument();
      expect(screen.getByText('/test/video1.mp4')).toBeInTheDocument();
      expect(screen.getByText('/test/video2.avi')).toBeInTheDocument();
      expect(screen.getByText('Basic Options')).toBeInTheDocument();
      expect(screen.getByText('Start Conversion')).toBeInTheDocument();
    });

    it('should call onGoBack when back button is clicked', () => {
      render(<FileBrowserModal {...configureProps} />);
      
      const backButton = screen.getByText('Back');
      fireEvent.click(backButton);
      
      expect(mockOnGoBack).toHaveBeenCalled();
    });

    it('should call onStartConversion when start conversion is triggered', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      render(<FileBrowserModal {...configureProps} />);
      
      const startButton = screen.getByText('Start Conversion');
      fireEvent.click(startButton);
      
      await waitFor(() => {
        expect(mockOnStartConversion).toHaveBeenCalled();
      });
      
      // Check that the conversion options were passed correctly
      const conversionOptions = mockOnStartConversion.mock.calls[0][0];
      expect(conversionOptions).toHaveProperty('selectedFiles');
      expect(conversionOptions.selectedFiles).toEqual(['/test/video1.mp4', '/test/video2.avi']);
      expect(conversionOptions).toHaveProperty('basic');
      expect(conversionOptions).toHaveProperty('advanced');
      
      consoleSpy.mockRestore();
    });

    it('should persist conversion options across modal reopens', async () => {
      const savedOptions = {
        basic: {
          videoCodec: 'libx264',
          quality: 20,
          outputFormat: 'mkv',
        },
      };
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedOptions));
      
      render(<FileBrowserModal {...configureProps} />);
      
      // Options should be loaded from localStorage
      expect(screen.getByDisplayValue('H.264 (AVC) - More compatible')).toBeInTheDocument();
      expect(screen.getByDisplayValue('MKV - Open standard')).toBeInTheDocument();
    });

    it('should update conversion options when basic settings change', async () => {
      render(<FileBrowserModal {...configureProps} />);
      
      const videoCodecSelect = screen.getByLabelText('Video Codec');
      fireEvent.change(videoCodecSelect, { target: { value: 'libx264' } });
      
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'frame-shift-conversion-options',
          expect.stringContaining('libx264')
        );
      });
    });
  });

  describe('Modal Controls', () => {
    it('should call onClose when cancel button is clicked in select step', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when cancel button is clicked in configure step', () => {
      render(<FileBrowserModal {...{ ...defaultProps, currentStep: 'configure' }} />);
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when X button is clicked', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      const closeButton = screen.getByText('×');
      fireEvent.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Step Transitions', () => {
    it('should transition from select to configure step', async () => {
      const { rerender } = render(<FileBrowserModal {...defaultProps} />);
      
      // Should be in select mode initially
      expect(screen.getByText('Select Files for Conversion')).toBeInTheDocument();
      
      // Simulate step change
      rerender(<FileBrowserModal {...defaultProps} currentStep="configure" />);
      
      // Should now be in configure mode
      expect(screen.getByText('Configure Conversion')).toBeInTheDocument();
      expect(screen.getByText('Basic Options')).toBeInTheDocument();
    });

    it('should maintain selected files across step transitions', () => {
      const { rerender } = render(<FileBrowserModal {...defaultProps} />);
      
      expect(screen.getByText('2 files selected')).toBeInTheDocument();
      
      // Transition to configure step
      rerender(<FileBrowserModal {...defaultProps} currentStep="configure" />);
      
      expect(screen.getByText('2 files selected for conversion')).toBeInTheDocument();
      expect(screen.getByText('/test/video1.mp4')).toBeInTheDocument();
      expect(screen.getByText('/test/video2.avi')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle file loading errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));
      
      render(<FileBrowserModal {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load directory contents')).toBeInTheDocument();
      });
    });

    it('should handle localStorage errors in configuration step', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });
      
      render(<FileBrowserModal {...{ ...defaultProps, currentStep: 'configure' }} />);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Component should still render with defaults
      expect(screen.getByText('Basic Options')).toBeInTheDocument();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels and roles', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      // Buttons should have proper labels
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should handle keyboard navigation', () => {
      render(<FileBrowserModal {...defaultProps} />);
      
      const continueButton = screen.getByText('Continue');
      const cancelButton = screen.getByText('Cancel');
      
      // Buttons should be focusable
      continueButton.focus();
      expect(document.activeElement).toBe(continueButton);
      
      cancelButton.focus();
      expect(document.activeElement).toBe(cancelButton);
    });
  });
});