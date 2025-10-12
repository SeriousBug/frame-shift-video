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
}

export interface CreateJobInput {
  name: string;
  input_file: string;
  output_file?: string;
  ffmpeg_command_json?: string;
  queue_position?: number;
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
}

export interface FileSelection {
  id: string;
  data: string;
  created_at: string;
}
