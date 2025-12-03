/**
 * System status monitoring utilities
 * Collects CPU and memory usage information for the current node
 */

import * as os from 'os';

/**
 * System status for a single node
 */
export interface NodeSystemStatus {
  /** Node identifier (e.g., "standalone", "leader", "follower-0") */
  nodeId: string;
  /** CPU usage percentage (0-100) */
  cpuUsagePercent: number;
  /** Number of CPU cores */
  cpuCores: number;
  /** Memory used in bytes */
  memoryUsedBytes: number;
  /** Total memory in bytes */
  memoryTotalBytes: number;
  /** Memory usage percentage (0-100) */
  memoryUsagePercent: number;
  /** Timestamp when this status was collected */
  timestamp: number;
}

/**
 * System status response for the API
 */
export interface SystemStatusResponse {
  /** Instance type: standalone, leader, or follower */
  instanceType: 'standalone' | 'leader' | 'follower';
  /** Status of all nodes (just one for standalone/follower, multiple for leader) */
  nodes: NodeSystemStatus[];
}

// Previous CPU times for calculating usage
let previousCpuTimes: { idle: number; total: number } | null = null;

/**
 * Get CPU times from all cores
 */
function getCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }

  return { idle, total };
}

/**
 * Calculate CPU usage percentage since last call
 * Returns 0 on first call (needs previous sample)
 */
function calculateCpuUsage(): number {
  const current = getCpuTimes();

  if (previousCpuTimes === null) {
    previousCpuTimes = current;
    return 0;
  }

  const idleDiff = current.idle - previousCpuTimes.idle;
  const totalDiff = current.total - previousCpuTimes.total;

  previousCpuTimes = current;

  if (totalDiff === 0) {
    return 0;
  }

  // CPU usage is (total - idle) / total * 100
  const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
  return Math.round(usage * 10) / 10; // Round to 1 decimal place
}

/**
 * Get memory usage information
 */
function getMemoryUsage(): {
  used: number;
  total: number;
  percent: number;
} {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const percent = Math.round((used / total) * 1000) / 10; // Round to 1 decimal place

  return { used, total, percent };
}

/**
 * Collect system status for this node
 */
export function collectSystemStatus(nodeId: string): NodeSystemStatus {
  const cpuUsagePercent = calculateCpuUsage();
  const cpuCores = os.cpus().length;
  const memory = getMemoryUsage();

  return {
    nodeId,
    cpuUsagePercent,
    cpuCores,
    memoryUsedBytes: memory.used,
    memoryTotalBytes: memory.total,
    memoryUsagePercent: memory.percent,
    timestamp: Date.now(),
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
