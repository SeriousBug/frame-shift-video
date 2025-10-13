import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH =
  process.env.NODE_ENV === 'test'
    ? path.join(process.cwd(), 'data', 'test-database.sqlite')
    : path.join(process.cwd(), 'data', 'database.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database | null = null;

export function getDatabase(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.run('PRAGMA journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

/**
 * Execute a SQL query and return all results
 */
export function query<T = any>(sqlQuery: string, params: any[] = []): T[] {
  const database = getDatabase();
  const stmt = database.query(sqlQuery);
  return stmt.all(...params) as T[];
}

/**
 * Execute a SQL query and return first result
 */
export function queryOne<T = any>(
  sqlQuery: string,
  params: any[] = [],
): T | null {
  const database = getDatabase();
  const stmt = database.query(sqlQuery);
  return stmt.get(...params) as T | null;
}

/**
 * Execute a SQL query for modifications (INSERT, UPDATE, DELETE)
 */
export function execute(
  sqlQuery: string,
  params: any[] = [],
): {
  changes: number;
  lastInsertRowid: number | bigint;
} {
  const database = getDatabase();
  const stmt = database.query(sqlQuery);
  stmt.run(...params);

  return {
    changes: database.query('SELECT changes()').get() as number,
    lastInsertRowid: database.query('SELECT last_insert_rowid()').get() as
      | number
      | bigint,
  };
}

/**
 * Execute multiple SQL statements in a transaction
 */
export function transaction(callback: () => void): void {
  const database = getDatabase();
  database.run('BEGIN');
  try {
    callback();
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
}

/**
 * Database migrations
 * IMPORTANT: Never delete old migration entries, only add new ones!
 * Each migration runs only once and updates the version incrementally.
 */
const MIGRATIONS = [
  // Migration 1: Initial schema
  `
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_file TEXT NOT NULL,
      output_file TEXT,
      ffmpeg_command_json TEXT,
      progress REAL DEFAULT 0,
      error_message TEXT,
      queue_position INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_queue_position ON jobs(queue_position);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  `,
  // Migration 2: File selections table
  `
    CREATE TABLE IF NOT EXISTS file_selections (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_file_selections_created_at ON file_selections(created_at);
  `,
  // Migration 3: Add timing and frame tracking fields
  `
    ALTER TABLE jobs ADD COLUMN start_time DATETIME;
    ALTER TABLE jobs ADD COLUMN end_time DATETIME;
    ALTER TABLE jobs ADD COLUMN total_frames INTEGER;
  `,
  // Migration 4: Add retried flag for tracking retried jobs
  `
    ALTER TABLE jobs ADD COLUMN retried INTEGER DEFAULT 0;
  `,
  // Migration 5: Add config field to file_selections to store full configuration
  `
    ALTER TABLE file_selections ADD COLUMN config TEXT;
  `,
  // Migration 6: Add config_key to jobs table to link to configuration
  `
    ALTER TABLE jobs ADD COLUMN config_key TEXT;
  `,
  // Migration 7: Add expanded_folders and current_path to file_selections for server-side state management
  `
    ALTER TABLE file_selections ADD COLUMN expanded_folders TEXT;
    ALTER TABLE file_selections ADD COLUMN current_path TEXT DEFAULT '';
  `,
  // Migration 8: Add search_query to file_selections for search functionality
  `
    ALTER TABLE file_selections ADD COLUMN search_query TEXT;
  `,
];

/**
 * Initialize database with meta table and run migrations
 */
function initializeDatabase(): void {
  const database = getDatabase();

  // Always create meta table if it doesn't exist
  database.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Check current database version
  const versionResult = queryOne<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    ['version'],
  );
  const currentVersion = versionResult ? parseInt(versionResult.value, 10) : 0;

  // Run migrations if needed
  if (currentVersion < MIGRATIONS.length) {
    runMigrations(currentVersion);
  }
}

/**
 * Run database migrations from the given version
 */
function runMigrations(fromVersion: number): void {
  const database = getDatabase();

  transaction(() => {
    for (let i = fromVersion; i < MIGRATIONS.length; i++) {
      const migration = MIGRATIONS[i];
      const newVersion = i + 1;

      console.log(`Running migration ${newVersion}...`);

      // Execute migration
      database.run(migration);

      // Update version in meta table
      execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
        'version',
        newVersion.toString(),
      ]);

      console.log(`Migration ${newVersion} completed`);
    }
  });

  console.log(`Database migrated to version ${MIGRATIONS.length}`);
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Cleanup on process exit
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
