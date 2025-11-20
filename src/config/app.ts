/**
 * Application configuration
 */

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  tempDirPrefix: 'comapeo-settings-',
  maxAttempts: 120, // Maximum number of attempts to check for the built file
  delayBetweenAttempts: 1000, // Delay between attempts in milliseconds
};
