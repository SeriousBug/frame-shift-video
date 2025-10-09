/**
 * Integration test for file deselection functionality
 *
 * Tests that files can be deselected by clicking them again after selection.
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

describe('File Deselection', () => {
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

  it('should deselect a file when clicked again', async () => {
    await act(async () => {
      render(
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

    // Step 1: Click on a file to select it
    const file1 = screen.getByText('video1.mp4').closest('div');
    await act(async () => {
      fireEvent.click(file1!);
    });

    // Verify file is selected
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Step 2: Click on the same file again to deselect it
    await act(async () => {
      fireEvent.click(file1!);
    });

    // Verify file is deselected
    expect(screen.getByText('0 files selected')).toBeInTheDocument();
  });

  it('should deselect a file when checkbox is clicked', async () => {
    await act(async () => {
      render(
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

    // Get all checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    // Find the checkbox for video1.mp4 (first file)
    const checkbox1 = checkboxes[0];

    // Step 1: Click on checkbox to select file
    await act(async () => {
      fireEvent.click(checkbox1);
    });

    // Verify file is selected
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Step 2: Click checkbox again to deselect
    await act(async () => {
      fireEvent.click(checkbox1);
    });

    // Verify file is deselected
    expect(screen.getByText('0 files selected')).toBeInTheDocument();
  });

  it('should deselect one file from multiple selected files', async () => {
    await act(async () => {
      render(
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

    // Select three files
    const file1 = screen.getByText('video1.mp4').closest('div');
    const file2 = screen.getByText('video2.avi').closest('div');
    const file3 = screen.getByText('video3.mkv').closest('div');

    await act(async () => {
      fireEvent.click(file1!);
    });
    await act(async () => {
      fireEvent.click(file2!);
    });
    await act(async () => {
      fireEvent.click(file3!);
    });

    // Verify all three files are selected
    expect(screen.getByText('3 files selected')).toBeInTheDocument();

    // Deselect the middle file
    await act(async () => {
      fireEvent.click(file2!);
    });

    // Verify only 2 files remain selected
    expect(screen.getByText('2 files selected')).toBeInTheDocument();

    // Click continue to see which files remain selected
    const continueButton = screen.getByText('Continue');
    await act(async () => {
      fireEvent.click(continueButton);
    });

    // Should only have file1 and file3, not file2
    expect(mockOnContinue).toHaveBeenCalledWith([
      '/videos/video1.mp4',
      '/videos/video3.mkv',
    ]);
  });

  it('should deselect all files one by one', async () => {
    await act(async () => {
      render(
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

    // Select two files
    const file1 = screen.getByText('video1.mp4').closest('div');
    const file2 = screen.getByText('video2.avi').closest('div');

    await act(async () => {
      fireEvent.click(file1!);
    });
    await act(async () => {
      fireEvent.click(file2!);
    });

    // Verify both files are selected
    expect(screen.getByText('2 files selected')).toBeInTheDocument();

    // Deselect first file
    await act(async () => {
      fireEvent.click(file1!);
    });
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Deselect second file
    await act(async () => {
      fireEvent.click(file2!);
    });
    expect(screen.getByText('0 files selected')).toBeInTheDocument();

    // Continue button should be disabled
    const continueButton = screen.getByText('Continue');
    expect(continueButton).toBeDisabled();
  });

  it('should toggle selection multiple times', async () => {
    await act(async () => {
      render(
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

    const file1 = screen.getByText('video1.mp4').closest('div');

    // Select
    await act(async () => {
      fireEvent.click(file1!);
    });
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Deselect
    await act(async () => {
      fireEvent.click(file1!);
    });
    expect(screen.getByText('0 files selected')).toBeInTheDocument();

    // Select again
    await act(async () => {
      fireEvent.click(file1!);
    });
    expect(screen.getByText('1 file selected')).toBeInTheDocument();

    // Deselect again
    await act(async () => {
      fireEvent.click(file1!);
    });
    expect(screen.getByText('0 files selected')).toBeInTheDocument();
  });
});
