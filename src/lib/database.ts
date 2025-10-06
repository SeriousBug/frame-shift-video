import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SQL } from './sql';

const DB_PATH = process.env.NODE_ENV === 'test' 
  ? path.join(process.cwd(), 'data', 'test-database.sqlite')
  : path.join(process.cwd(), 'data', 'database.sqlite');
const CURRENT_DB_VERSION = 1;

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

/**
 * Execute a SQL template query
 */
export function query<T = any>(sqlTemplate: { query: string; params: any[] }): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sqlTemplate.query);
  return stmt.all(...sqlTemplate.params) as T[];
}

/**
 * Execute a SQL template query and return first result
 */
export function queryOne<T = any>(sqlTemplate: { query: string; params: any[] }): T | undefined {
  const results = query<T>(sqlTemplate);
  return results[0];
}

/**
 * Execute a SQL template query for modifications (INSERT, UPDATE, DELETE)
 */
export function execute(sqlTemplate: { query: string; params: any[] }): Database.RunResult {
  const database = getDatabase();
  const stmt = database.prepare(sqlTemplate.query);
  return stmt.run(...sqlTemplate.params);
}

/**
 * Execute multiple SQL statements in a transaction
 */
export function transaction(callback: () => void): void {
  const database = getDatabase();
  const txn = database.transaction(callback);
  txn();
}

/**
 * Initialize database with meta table and run migrations
 */
function initializeDatabase(): void {
  const database = getDatabase();
  
  // Always create meta table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  
  // Check current database version
  const versionResult = queryOne<{ value: string }>(SQL`SELECT value FROM meta WHERE key = ${'version'}`);
  const currentVersion = versionResult ? parseInt(versionResult.value, 10) : 0;
  
  // Run migrations if needed
  if (currentVersion < CURRENT_DB_VERSION) {
    runMigrations(currentVersion);
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
      ffmpeg_command TEXT,
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
];

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
      database.exec(migration);
      
      // Update version in meta table
      const updateVersion = SQL`
        INSERT OR REPLACE INTO meta (key, value) 
        VALUES (${'version'}, ${newVersion.toString()})
      `;
      execute(updateVersion);
      
      console.log(`Migration ${newVersion} completed`);
    }
  });
  
  console.log(`Database migrated to version ${CURRENT_DB_VERSION}`);
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