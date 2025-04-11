import { describe, it, expect, mock, spyOn } from 'bun:test';
import { runShellCommand } from '../../../utils/shell';
import * as childProcess from 'child_process';

describe('Shell Utils', () => {
  it('should have runShellCommand function', () => {
    expect(typeof runShellCommand).toBe('function');
  });

  it('should execute a command', async () => {
    // Create a mock for exec that resolves immediately
    const mockExec = mock((cmd: string, callback: Function) => {
      // Call the callback with success parameters
      callback(null, 'command output', '');
      // Return a mock process
      return {
        on: (event: string, handler: Function) => {
          if (event === 'exit') handler();
        },
        pid: 123
      };
    });

    // Replace the real exec with our mock
    spyOn(childProcess, 'exec').mockImplementation(mockExec);

    // Call the function
    const result = await runShellCommand('test command');

    // Verify the result
    expect(result).toBe('command output');
    expect(mockExec).toHaveBeenCalledWith('test command', expect.any(Function));
  });

  it('should handle command errors', async () => {
    // Create a mock for exec that rejects
    const mockExec = mock((cmd: string, callback: Function) => {
      // Call the callback with error parameters
      const error = new Error('command failed');
      callback(error, '', 'error output');
      // Return a mock process
      return {
        on: (event: string, handler: Function) => {
          if (event === 'exit') handler();
        },
        pid: 123
      };
    });

    // Replace the real exec with our mock
    spyOn(childProcess, 'exec').mockImplementation(mockExec);

    // Call the function and expect it to reject
    await expect(runShellCommand('test command')).rejects.toThrow('command failed');
    expect(mockExec).toHaveBeenCalledWith('test command', expect.any(Function));
  });

  it('should handle stderr output', async () => {
    // Create a mock for exec that includes stderr output
    const mockExec = mock((cmd: string, callback: Function) => {
      // Call the callback with stderr output
      callback(null, 'command output', 'warning message');
      // Return a mock process
      return {
        on: (event: string, handler: Function) => {
          if (event === 'exit') handler();
        },
        pid: 123
      };
    });

    // Replace the real exec with our mock
    spyOn(childProcess, 'exec').mockImplementation(mockExec);

    // Call the function
    const result = await runShellCommand('test command');

    // Verify the result
    expect(result).toBe('command output');
    expect(mockExec).toHaveBeenCalledWith('test command', expect.any(Function));
  });

  it('should handle timeouts', async () => {
    // Create a mock for exec that simulates a timeout
    const mockExec = mock((cmd: string, callback: Function) => {
      // Return a mock process
      return {
        on: (event: string, handler: Function) => {
          if (event === 'exit') handler();
        },
        pid: 123,
        kill: () => {}
      };
    });

    // Replace the real exec with our mock
    spyOn(childProcess, 'exec').mockImplementation(mockExec);

    // Mock setTimeout to immediately call the callback
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = ((callback: Function) => {
      // Call the callback immediately
      callback();
      return 123 as any;
    }) as any;

    try {
      // This should throw because we're triggering the timeout immediately
      await runShellCommand('test command', 1000);
      // If we get here, the test should fail
      expect(true).toBe(false); // This should not be reached
    } catch (error) {
      // Verify the error is a timeout error
      expect((error as Error).message).toContain('Command timed out');
    } finally {
      // Restore original setTimeout
      global.setTimeout = originalSetTimeout;
    }
  });
});
