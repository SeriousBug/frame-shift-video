/**
 * Bun test setup file
 */

import { beforeAll } from 'bun:test';

// Suppress React 18 act warnings for async updates
global.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // Set environment to test mode
  process.env.NODE_ENV = 'test';
});
