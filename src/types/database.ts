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
}

export interface CreateJobInput {
  name: string;
  input_file: string;
  output_file?: string;
  ffmpeg_command_json?: string;
  queue_position?: number;
  config_key?: string;
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
}

export interface FileSelection {
  id: string;
  data: string;
  config?: string; // JSON-encoded ConversionOptions
  created_at: string;
}
