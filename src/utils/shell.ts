import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

/**
 * Run a shell command and return the output
 * @param command The command to run
 * @returns A promise that resolves with the command output
 */
export function runShellCommand(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Execution failed: ${error}`);
        reject(error);
      }
      if (stderr) {
        console.error(`Error: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}
