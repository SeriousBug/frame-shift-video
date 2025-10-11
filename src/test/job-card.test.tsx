/**
 * Unit tests for the JobCard component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobCard } from '../components/job-card';
import { Job } from '../types/database';

// Mock date-fns to have predictable date formatting
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 minutes ago'),
}));

describe('JobCard', () => {
  const baseJob: Job = {
    id: 1,
    name: 'Test Job',
    status: 'pending',
    input_file: '/uploads/test.mp4',
    progress: 0,
    queue_position: null,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  it('should render basic job information', () => {
    render(<JobCard job={baseJob} />);

    expect(screen.getByText('Test Job')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('/uploads/test.mp4')).toBeInTheDocument();
    expect(screen.getByText('Created 2 minutes ago')).toBeInTheDocument();
    expect(screen.getByText('Updated 2 minutes ago')).toBeInTheDocument();
  });

  it('should render pending job with queue position', () => {
    const pendingJob: Job = { ...baseJob, queue_position: 3 };
    render(<JobCard job={pendingJob} />);

    expect(screen.getByText('Queue position: 3')).toBeInTheDocument();
  });

  it('should render processing job with progress bar', () => {
    const processingJob: Job = {
      ...baseJob,
      status: 'processing',
      progress: 65.5,
    };
    render(<JobCard job={processingJob} />);

    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('65.5%')).toBeInTheDocument();
    expect(screen.getByText('Progress:')).toBeInTheDocument();
  });

  it('should render completed job with output file and 100% progress', () => {
    const completedJob: Job = {
      ...baseJob,
      status: 'completed',
      progress: 100,
      output_file: '/outputs/completed.mp4',
    };
    render(<JobCard job={completedJob} />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('/outputs/completed.mp4')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('Output File:')).toBeInTheDocument();
  });

  it('should render failed job with error message', () => {
    const failedJob: Job = {
      ...baseJob,
      status: 'failed',
      error_message: 'FFmpeg encoding failed with error code 1',
    };
    render(<JobCard job={failedJob} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('FFmpeg encoding failed with error code 1'),
    ).toBeInTheDocument();
    expect(screen.getByText('Error:')).toBeInTheDocument();
  });

  it('should render cancelled job', () => {
    const cancelledJob: Job = { ...baseJob, status: 'cancelled' };
    render(<JobCard job={cancelledJob} />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('should apply correct status styling', () => {
    const { rerender } = render(<JobCard job={baseJob} />);

    // Test pending status
    let statusBadge = screen.getByText('Pending').closest('span');
    expect(statusBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');

    // Test processing status
    rerender(<JobCard job={{ ...baseJob, status: 'processing' }} />);
    statusBadge = screen.getByText('Processing').closest('span');
    expect(statusBadge).toHaveClass('bg-blue-100', 'text-blue-800');

    // Test completed status
    rerender(<JobCard job={{ ...baseJob, status: 'completed' }} />);
    statusBadge = screen.getByText('Completed').closest('span');
    expect(statusBadge).toHaveClass('bg-green-100', 'text-green-800');

    // Test failed status
    rerender(<JobCard job={{ ...baseJob, status: 'failed' }} />);
    statusBadge = screen.getByText('Failed').closest('span');
    expect(statusBadge).toHaveClass('bg-red-100', 'text-red-800');

    // Test cancelled status
    rerender(<JobCard job={{ ...baseJob, status: 'cancelled' }} />);
    statusBadge = screen.getByText('Cancelled').closest('span');
    expect(statusBadge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('should render status icons correctly', () => {
    const { rerender } = render(<JobCard job={baseJob} />);

    // Check that status icons are present (emojis)
    expect(screen.getByText('⏳')).toBeInTheDocument(); // pending

    rerender(<JobCard job={{ ...baseJob, status: 'processing' }} />);
    expect(screen.getByText('⚡')).toBeInTheDocument(); // processing

    rerender(<JobCard job={{ ...baseJob, status: 'completed' }} />);
    expect(screen.getByText('✅')).toBeInTheDocument(); // completed

    rerender(<JobCard job={{ ...baseJob, status: 'failed' }} />);
    expect(screen.getByText('❌')).toBeInTheDocument(); // failed

    rerender(<JobCard job={{ ...baseJob, status: 'cancelled' }} />);
    expect(screen.getByText('⏹️')).toBeInTheDocument(); // cancelled
  });

  it('should not render optional fields when they are not present', () => {
    render(<JobCard job={baseJob} />);

    expect(screen.queryByText('Output File:')).not.toBeInTheDocument();
    expect(screen.queryByText('FFmpeg Command:')).not.toBeInTheDocument();
    expect(screen.queryByText('Progress:')).not.toBeInTheDocument();
    expect(screen.queryByText('Error:')).not.toBeInTheDocument();
    expect(screen.queryByText('Queue position:')).not.toBeInTheDocument();
  });

  it('should handle progress bar width correctly', () => {
    const processingJob: Job = {
      ...baseJob,
      status: 'processing',
      progress: 75.5,
    };
    render(<JobCard job={processingJob} />);

    const progressBar = screen
      .getByText('75.5%')
      .previousElementSibling?.querySelector('div');
    expect(progressBar).toHaveStyle({ width: '75.5%' });
  });
});
