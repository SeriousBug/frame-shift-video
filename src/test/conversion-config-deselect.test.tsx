/**
 * Integration tests for file deselection and undo functionality on configure step
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
import { ConversionConfig } from '@/components/conversion-config';

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

describe('ConversionConfig - File Deselection', () => {
  const mockOnOptionsChange = vi.fn();
  const mockOnStartConversion = vi.fn();
  const mockOnFilesChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('should show remove button on hover for each file', () => {
    const files = ['/videos/video1.mp4', '/videos/video2.avi'];

    render(
      <ConversionConfig
        selectedFiles={files}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Files should be displayed
    expect(screen.getByText('/videos/video1.mp4')).toBeInTheDocument();
    expect(screen.getByText('/videos/video2.avi')).toBeInTheDocument();

    // Remove buttons should exist (even if not visible)
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });
    expect(removeButtons).toHaveLength(2);
  });

  it('should call onFilesChange when a file is removed', async () => {
    const files = [
      '/videos/video1.mp4',
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ];

    render(
      <ConversionConfig
        selectedFiles={files}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Click remove button for video2
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[1]); // Remove video2.avi
    });

    // Should call onFilesChange with remaining files
    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video1.mp4',
      '/videos/video3.mkv',
    ]);
  });

  it('should show undo button after removing a file', async () => {
    const files = ['/videos/video1.mp4', '/videos/video2.avi'];

    render(
      <ConversionConfig
        selectedFiles={files}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Undo button should not be visible initially
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();

    // Remove first file
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    // Undo button should now be visible
    await waitFor(() => {
      expect(screen.getByText('Undo')).toBeInTheDocument();
    });
  });

  it('should restore removed file when undo is clicked', async () => {
    let currentFiles = [
      '/videos/video1.mp4',
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove second file
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[1]); // Remove video2.avi
    });

    // onFilesChange should be called with updated list
    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video1.mp4',
      '/videos/video3.mkv',
    ]);

    // Simulate parent updating the files prop
    currentFiles = ['/videos/video1.mp4', '/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Click undo button
    const undoButton = screen.getByText('Undo');
    await act(async () => {
      fireEvent.click(undoButton);
    });

    // onFilesChange should be called with the restored file
    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video1.mp4',
      '/videos/video3.mkv',
      '/videos/video2.avi',
    ]);
  });

  it('should hide undo button after undo is clicked', async () => {
    let currentFiles = ['/videos/video1.mp4', '/videos/video2.avi'];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove a file
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    // Simulate parent updating the files
    currentFiles = ['/videos/video2.avi'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Undo button should be visible
    expect(screen.getByText('Undo')).toBeInTheDocument();

    // Click undo
    const undoButton = screen.getByText('Undo');
    await act(async () => {
      fireEvent.click(undoButton);
    });

    // Simulate parent updating the files after undo
    currentFiles = ['/videos/video2.avi', '/videos/video1.mp4'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Undo button should be hidden
    await waitFor(() => {
      expect(screen.queryByText('Undo')).not.toBeInTheDocument();
    });
  });

  it('should allow removing multiple files sequentially', async () => {
    let currentFiles = [
      '/videos/video1.mp4',
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove first file
    let removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ]);

    // Update component with new files
    currentFiles = ['/videos/video2.avi', '/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove second file
    removeButtons = screen.getAllByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    expect(mockOnFilesChange).toHaveBeenCalledWith(['/videos/video3.mkv']);
  });

  it('should handle removing all files', async () => {
    let currentFiles = ['/videos/video1.mp4'];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove the only file
    const removeButton = screen.getByRole('button', {
      name: /Remove/i,
    });

    await act(async () => {
      fireEvent.click(removeButton);
    });

    expect(mockOnFilesChange).toHaveBeenCalledWith([]);

    // Update with empty files
    currentFiles = [];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Should show 0 files
    expect(screen.getByText('Selected Files (0)')).toBeInTheDocument();
  });

  it('should support multiple undo operations', async () => {
    let currentFiles = [
      '/videos/video1.mp4',
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove first file
    let removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    // Update component
    currentFiles = ['/videos/video2.avi', '/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove second file
    removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    // Update component
    currentFiles = ['/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Undo button should show "2" badge
    expect(screen.getByText('2')).toBeInTheDocument();

    // First undo - should restore video2.avi
    const undoButton = screen.getByText('Undo');
    await act(async () => {
      fireEvent.click(undoButton);
    });

    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video3.mkv',
      '/videos/video2.avi',
    ]);

    // Update component
    currentFiles = ['/videos/video3.mkv', '/videos/video2.avi'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Undo button should still be visible but no badge (only 1 action left)
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();

    // Second undo - should restore video1.mp4
    await act(async () => {
      fireEvent.click(screen.getByText('Undo'));
    });

    expect(mockOnFilesChange).toHaveBeenCalledWith([
      '/videos/video3.mkv',
      '/videos/video2.avi',
      '/videos/video1.mp4',
    ]);
  });

  it('should limit undo history to 10 items', async () => {
    // Create 12 files
    let currentFiles = Array.from(
      { length: 12 },
      (_, i) => `/videos/video${i + 1}.mp4`,
    );

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove all 12 files
    for (let i = 0; i < 12; i++) {
      const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
      await act(async () => {
        fireEvent.click(removeButtons[0]);
      });

      currentFiles = currentFiles.slice(1);
      rerender(
        <ConversionConfig
          selectedFiles={currentFiles}
          onOptionsChange={mockOnOptionsChange}
          onStartConversion={mockOnStartConversion}
          onFilesChange={mockOnFilesChange}
        />,
      );
    }

    // Undo button should show "10" (not 12)
    expect(screen.getByText('10')).toBeInTheDocument();

    // Undo 10 times
    for (let i = 0; i < 10; i++) {
      const undoButton = screen.getByText('Undo');
      await act(async () => {
        fireEvent.click(undoButton);
      });

      // Get the last call to see what files were restored
      const lastCall =
        mockOnFilesChange.mock.calls[mockOnFilesChange.mock.calls.length - 1];
      currentFiles = lastCall[0];

      rerender(
        <ConversionConfig
          selectedFiles={currentFiles}
          onOptionsChange={mockOnOptionsChange}
          onStartConversion={mockOnStartConversion}
          onFilesChange={mockOnFilesChange}
        />,
      );
    }

    // After 10 undos, there should be no more undo button
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();

    // Should have restored 10 files (video12 down to video3)
    expect(currentFiles).toHaveLength(10);
  });

  it('should show badge with count when multiple actions available', async () => {
    let currentFiles = [
      '/videos/video1.mp4',
      '/videos/video2.avi',
      '/videos/video3.mkv',
    ];

    const { rerender } = render(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Remove first file - no badge yet (only 1 action)
    let removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    currentFiles = ['/videos/video2.avi', '/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Should have undo button but no badge
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    // Remove second file - now should show badge with "2"
    removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    currentFiles = ['/videos/video3.mkv'];
    rerender(
      <ConversionConfig
        selectedFiles={currentFiles}
        onOptionsChange={mockOnOptionsChange}
        onStartConversion={mockOnStartConversion}
        onFilesChange={mockOnFilesChange}
      />,
    );

    // Should show badge with "2"
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
