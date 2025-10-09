/**
 * Integration test to ensure selected files persist when clicking Continue
 *
 * This test reproduces the bug where files would disappear when transitioning
 * from the select step to the configure step.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { FileBrowserModal } from '@/components/file-browser-modal';

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('File Selection Persistence Bug Fix', () => {
  const mockOnClose = vi.fn();
  const mockOnContinue = vi.fn();
  const mockOnGoBack = vi.fn();
  const mockOnStartConversion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();

    // Mock API response with sample files
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            name: 'video1.mp4',
            path: '/videos/video1.mp4',
            isDirectory: false,
            size: 1024000,
          },
          {
            name: 'video2.avi',
            path: '/videos/video2.avi',
            isDirectory: false,
            size: 2048000,
          },
          {
            name: 'video3.mkv',
            path: '/videos/video3.mkv',
            isDirectory: false,
            size: 3072000,
          },
        ],
      }),
    } as Response);
  });

  it('should show selected file on configure step after clicking Continue', async () => {
    // Step 1: Render modal in select mode
    const { rerender } = await act(async () => {
      return render(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={[]}
          currentStep="select"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    // Step 2: Click on a file to select it
    const file1 = screen.getByText('video1.mp4').closest('div');
    await act(async () => {
      fireEvent.click(file1!);
    });

    // Verify file is selected (counter should show 1 file)
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Step 3: Click Continue button
    const continueButton = screen.getByText('Continue');
    await act(async () => {
      fireEvent.click(continueButton);
    });

    // onContinue should be called with the selected file
    expect(mockOnContinue).toHaveBeenCalledWith(['/videos/video1.mp4']);

    // Step 4: Simulate parent component updating to configure step
    // (this is what page.tsx does when onContinue is called)
    await act(async () => {
      rerender(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={['/videos/video1.mp4']}
          currentStep="configure"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // Step 5: CRITICAL - Verify the file appears on the configure step
    await waitFor(() => {
      expect(screen.getByText('Configure Conversion')).toBeInTheDocument();
      expect(screen.getByText('Selected Files (1)')).toBeInTheDocument();
      expect(screen.getByText('/videos/video1.mp4')).toBeInTheDocument();
      expect(
        screen.getByText('1 file selected for conversion'),
      ).toBeInTheDocument();
    });

    // Ensure no other files are shown
    expect(screen.queryByText('/videos/video2.avi')).not.toBeInTheDocument();
    expect(screen.queryByText('/videos/video3.mkv')).not.toBeInTheDocument();
  });

  it('should show multiple selected files on configure step', async () => {
    const { rerender } = await act(async () => {
      return render(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={[]}
          currentStep="select"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    // Select multiple files
    const file1 = screen.getByText('video1.mp4').closest('div');
    const file2 = screen.getByText('video2.avi').closest('div');

    await act(async () => {
      fireEvent.click(file1!);
    });

    await act(async () => {
      fireEvent.click(file2!);
    });

    // Verify 2 files are selected
    expect(screen.getByText('2 files selected')).toBeInTheDocument();

    // Click Continue
    const continueButton = screen.getByText('Continue');
    await act(async () => {
      fireEvent.click(continueButton);
    });

    expect(mockOnContinue).toHaveBeenCalledWith([
      '/videos/video1.mp4',
      '/videos/video2.avi',
    ]);

    // Transition to configure step
    await act(async () => {
      rerender(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={['/videos/video1.mp4', '/videos/video2.avi']}
          currentStep="configure"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // Verify both files appear on configure step
    await waitFor(() => {
      expect(screen.getByText('Selected Files (2)')).toBeInTheDocument();
      expect(screen.getByText('/videos/video1.mp4')).toBeInTheDocument();
      expect(screen.getByText('/videos/video2.avi')).toBeInTheDocument();
      expect(
        screen.getByText('2 files selected for conversion'),
      ).toBeInTheDocument();
    });

    // Ensure the third file is NOT shown
    expect(screen.queryByText('/videos/video3.mkv')).not.toBeInTheDocument();
  });

  it('should maintain file selection when going back and forward', async () => {
    const { rerender } = await act(async () => {
      return render(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={[]}
          currentStep="select"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('video1.mp4')).toBeInTheDocument();
    });

    // Select a file
    const file1 = screen.getByText('video1.mp4').closest('div');
    await act(async () => {
      fireEvent.click(file1!);
    });

    // Click Continue
    const continueButton = screen.getByText('Continue');
    await act(async () => {
      fireEvent.click(continueButton);
    });

    // Go to configure step
    await act(async () => {
      rerender(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={['/videos/video1.mp4']}
          currentStep="configure"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('/videos/video1.mp4')).toBeInTheDocument();
    });

    // Click Back button
    const backButton = screen.getByText('Back');
    await act(async () => {
      fireEvent.click(backButton);
    });

    expect(mockOnGoBack).toHaveBeenCalled();

    // Go back to select step (simulating browser back)
    await act(async () => {
      rerender(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={['/videos/video1.mp4']}
          currentStep="select"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // File should still be selected
    await waitFor(() => {
      expect(screen.getByText('1 file selected')).toBeInTheDocument();
    });
  });

  it('should not show any files when none are selected', async () => {
    // Render directly in configure step with no files
    await act(async () => {
      render(
        <FileBrowserModal
          isOpen={true}
          selectedFiles={[]}
          currentStep="configure"
          onClose={mockOnClose}
          onContinue={mockOnContinue}
          onGoBack={mockOnGoBack}
          onStartConversion={mockOnStartConversion}
        />,
      );
    });

    // Should show 0 files selected
    expect(screen.getByText('Selected Files (0)')).toBeInTheDocument();
    expect(
      screen.getByText('0 files selected for conversion'),
    ).toBeInTheDocument();

    // No file paths should be visible
    expect(screen.queryByText('/videos/video1.mp4')).not.toBeInTheDocument();
    expect(screen.queryByText('/videos/video2.avi')).not.toBeInTheDocument();
    expect(screen.queryByText('/videos/video3.mkv')).not.toBeInTheDocument();
  });
});
