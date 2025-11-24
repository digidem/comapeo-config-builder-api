import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export interface ShellOptions {
  signal?: AbortSignal;
}

/**
 * Run a shell command and return the output
 * Supports abortion via AbortSignal to kill the child process
 * @param command The command to run
 * @param options Optional settings including abort signal
 * @returns A promise that resolves with the command output
 */
export function runShellCommand(command: string, options?: ShellOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Check if already aborted
    if (options?.signal?.aborted) {
      reject(new Error('Command aborted'));
      return;
    }

    const childProcess: ChildProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        // Don't log if killed by abort
        if (error.killed || error.signal === 'SIGTERM') {
          reject(new Error('Command aborted'));
          return;
        }
        console.error(`Execution failed: ${error}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`Error: ${stderr}`);
      }
      resolve(stdout);
    });

    // Listen for abort signal to kill the process
    if (options?.signal) {
      const abortHandler = () => {
        if (childProcess.pid) {
          childProcess.kill('SIGTERM');
        }
      };

      options.signal.addEventListener('abort', abortHandler, { once: true });

      // Clean up listener when process exits
      childProcess.on('exit', () => {
        options.signal?.removeEventListener('abort', abortHandler);
      });
    }
  });
}
