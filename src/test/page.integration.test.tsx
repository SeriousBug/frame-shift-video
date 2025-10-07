/**
 * Integration tests for the main page with database integration
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobService } from '../lib/db-service';
import { getDatabase } from '../lib/database';
import Home from '../app/page';

// Mock the theme components since they use client-side features
vi.mock('../components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

vi.mock('../components/theme-toggle', () => ({
  ThemeToggle: () => <button>Toggle Theme</button>,
}));

describe('Home Page Integration', () => {
  beforeEach(() => {
    // Clear all data before each test to ensure clean state
    const db = getDatabase();
    db.exec('DELETE FROM jobs');
    db.exec("DELETE FROM meta WHERE key != 'version'");
  });

  it('should render empty state when no jobs exist', async () => {
    render(await Home());

    expect(screen.getByText('Frame Shift Video')).toBeInTheDocument();
    expect(
      screen.getByText('Self-hosted video conversion service with FFmpeg'),
    ).toBeInTheDocument();
    expect(screen.getByText('No Jobs Yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Upload a video to get started with your first conversion job.',
      ),
    ).toBeInTheDocument();
  });

  it('should render jobs when they exist in the database', async () => {
    // Create test jobs in the database
    JobService.create({
      name: 'Test Video Conversion',
      input_file: '/uploads/test-video.mp4',
      output_file: '/outputs/converted-video.mp4',
      ffmpeg_command:
        'ffmpeg -i test-video.mp4 -c:v libx264 converted-video.mp4',
    });

    const job2Id = JobService.create({
      name: 'Another Conversion Job',
      input_file: '/uploads/another-video.avi',
    });

    // Update one job to processing state
    JobService.update(job2Id, { status: 'processing', progress: 45 });

    render(await Home());

    expect(screen.getByText('Frame Shift Video')).toBeInTheDocument();
    expect(screen.getByText('Video Jobs')).toBeInTheDocument();
    expect(screen.getByText('2 jobs total')).toBeInTheDocument();

    // Check if job cards are rendered
    expect(screen.getByText('Test Video Conversion')).toBeInTheDocument();
    expect(screen.getByText('Another Conversion Job')).toBeInTheDocument();

    // Check job details
    expect(screen.getByText('/uploads/test-video.mp4')).toBeInTheDocument();
    expect(
      screen.getByText('/outputs/converted-video.mp4'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'ffmpeg -i test-video.mp4 -c:v libx264 converted-video.mp4',
      ),
    ).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('should render jobs with different statuses correctly', async () => {
    JobService.create({
      name: 'Pending Job',
      input_file: '/uploads/pending.mp4',
      queue_position: 1,
    });

    const processingJobId = JobService.create({
      name: 'Processing Job',
      input_file: '/uploads/processing.mp4',
    });
    JobService.update(processingJobId, { status: 'processing', progress: 75 });

    const completedJobId = JobService.create({
      name: 'Completed Job',
      input_file: '/uploads/completed.mp4',
    });
    JobService.complete(completedJobId, '/outputs/completed.mp4');

    const failedJobId = JobService.create({
      name: 'Failed Job',
      input_file: '/uploads/failed.mp4',
    });
    JobService.setError(failedJobId, 'FFmpeg encoding failed');

    render(await Home());

    expect(screen.getByText('4 jobs total')).toBeInTheDocument();

    // Check all job names are present
    expect(screen.getByText('Pending Job')).toBeInTheDocument();
    expect(screen.getByText('Processing Job')).toBeInTheDocument();
    expect(screen.getByText('Completed Job')).toBeInTheDocument();
    expect(screen.getByText('Failed Job')).toBeInTheDocument();

    // Check status indicators
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    // Check queue position for pending job
    expect(screen.getByText('Queue position: 1')).toBeInTheDocument();

    // Check error message for failed job
    expect(screen.getByText('FFmpeg encoding failed')).toBeInTheDocument();
  });

  it('should display progress bars for processing and completed jobs', async () => {
    const processingJobId = JobService.create({
      name: 'Processing Job',
      input_file: '/uploads/processing.mp4',
    });
    JobService.update(processingJobId, {
      status: 'processing',
      progress: 65.5,
    });

    const completedJobId = JobService.create({
      name: 'Completed Job',
      input_file: '/uploads/completed.mp4',
    });
    JobService.complete(completedJobId, '/outputs/completed.mp4');

    render(await Home());

    // Check progress text
    expect(screen.getByText('65.5%')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();

    // Check progress labels
    expect(screen.getAllByText('Progress:')).toHaveLength(2);
  });

  it('should show single job count correctly', async () => {
    JobService.create({
      name: 'Single Job',
      input_file: '/uploads/single.mp4',
    });

    render(await Home());

    expect(screen.getByText('1 job total')).toBeInTheDocument();
  });

  it('should handle jobs with minimal data', async () => {
    JobService.create({
      name: 'Minimal Job',
      input_file: '/uploads/minimal.mp4',
    });

    render(await Home());

    expect(screen.getByText('Minimal Job')).toBeInTheDocument();
    expect(screen.getByText('/uploads/minimal.mp4')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    // Should not show optional fields
    expect(screen.queryByText('Output File:')).not.toBeInTheDocument();
    expect(screen.queryByText('FFmpeg Command:')).not.toBeInTheDocument();
    expect(screen.queryByText('Progress:')).not.toBeInTheDocument();
    expect(screen.queryByText('Error:')).not.toBeInTheDocument();
  });
});
