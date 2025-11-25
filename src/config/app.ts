/**
 * Application configuration
 */

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120, // Maximum number of attempts to check for the built file
  delayBetweenAttempts: 1000, // Delay between attempts in milliseconds
  jsonByteLimit: 1_000_000, // 1 MB limit for JSON payloads
  iconByteLimit: 2_000_000, // 2 MB limit for SVG icons
  maxEntries: 10_000, // Safety cap on total entries across payload
  iconFetchTimeoutMs: 5000, // Timeout for fetching remote SVGs
  validationTimeoutMs: 15000, // Timeout for comapeocat validation to prevent hangs
};
