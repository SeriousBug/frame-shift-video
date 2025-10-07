/**
 * Vitest test setup file
 */

import { afterAll, beforeAll } from 'vitest';
import { closeDatabase } from '../lib/database';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-database.sqlite');

beforeAll(() => {
  // Set environment to test mode
  process.env.NODE_ENV = 'test';

  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

afterAll(() => {
  // Close database connections
  closeDatabase();

  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});
