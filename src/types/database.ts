/**
 * Database type definitions
 */

export interface MetaRecord {
  key: string;
  value: string;
}

export interface Job {
  id: number;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  input_file: string;
  output_file?: string;
  ffmpeg_command_json?: string;
  progress: number;
  error_message?: string;
  queue_position?: number;
  created_at: string;
  updated_at: string;
  start_time?: string;
  end_time?: string;
  total_frames?: number;
  retried?: number; // SQLite boolean: 0 = false, 1 = true
  config_key?: string; // Key to file_selections table for configuration
  cleared?: number; // SQLite boolean: 0 = false, 1 = true - whether job is hidden from UI
  config_json?: string; // JSON-encoded ConversionOptions for this specific job
  ffmpeg_stderr?: string; // Full FFmpeg stderr output for debugging
}

export interface CreateJobInput {
  name: string;
  input_file: string;
  output_file?: string;
  ffmpeg_command_json?: string;
  queue_position?: number;
  config_key?: string;
  config_json?: string;
}

export interface UpdateJobInput {
  status?: Job['status'];
  output_file?: string;
  ffmpeg_command_json?: string;
  progress?: number;
  error_message?: string;
  queue_position?: number;
  start_time?: string;
  end_time?: string;
  total_frames?: number;
  retried?: number;
  config_key?: string;
  cleared?: number;
  config_json?: string;
  ffmpeg_stderr?: string;
}

export interface FileSelection {
  id: string;
  data: string; // JSON array of selected file paths
  config?: string; // JSON-encoded ConversionOptions
  expanded_folders?: string; // JSON array of expanded folder paths
  current_path?: string; // Current directory being viewed
  search_query?: string; // Search query for filtering files
  created_at: string;
}
