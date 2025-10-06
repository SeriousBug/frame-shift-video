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
  ffmpeg_command?: string;
  progress: number;
  error_message?: string;
  queue_position?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  name: string;
  input_file: string;
  output_file?: string;
  ffmpeg_command?: string;
  queue_position?: number;
}

export interface UpdateJobInput {
  status?: Job['status'];
  output_file?: string;
  ffmpeg_command?: string;
  progress?: number;
  error_message?: string;
  queue_position?: number;
}