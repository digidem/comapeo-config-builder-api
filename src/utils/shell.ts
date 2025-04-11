import { exec } from 'child_process';

/**
 * Execute a shell command with proper error handling and timeout
 * @param command The command to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise with stdout
 */
export function runShellCommand(command: string, timeoutMs = 60000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const process = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Execution failed: ${error}`);
        reject(error);
        return;
      }
      if (stderr && stderr.trim() !== '') {
        console.warn(`Command stderr: ${stderr}`);
      }
      resolve(stdout);
    });
    
    // Set timeout to kill the process if it takes too long
    const timeout = setTimeout(() => {
      if (process.pid) {
        try {
          // Kill the process if it's still running
          process.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        } catch (err) {
          console.error('Error killing process:', err);
        }
      }
    }, timeoutMs);
    
    // Clear timeout when process exits
    process.on('exit', () => clearTimeout(timeout));
  });
}
