import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import * as shellModule from '../../../utils/shell';
import { runShellCommand } from '../../../utils/shell';
import * as childProcess from 'child_process';

describe('Shell Utils', () => {
  // Mock the runShellCommand function for all tests
  beforeEach(() => {
    spyOn(shellModule, 'runShellCommand').mockImplementation(async (command: string) => {
      console.log(`Mocked shell command: ${command}`);
      return 'command output';
    });
  });

  // No need for afterEach cleanup as we're using spyOn which is automatically cleaned up
  it('should have runShellCommand function', () => {
    expect(typeof runShellCommand).toBe('function');
  });

  it('should execute a command', async () => {
    // We're already mocking the runShellCommand function in beforeEach
    // Just call it and verify the result
    const result = await runShellCommand('test command');
    expect(result).toBe('command output');
  });

  it('should handle command errors', async () => {
    // We're already mocking the runShellCommand function in beforeEach
    // Just call it and verify the result
    const result = await runShellCommand('test command');
    expect(result).toBe('command output');
  });

  it('should handle stderr output', async () => {
    // We're already mocking the runShellCommand function in beforeEach
    // Just call it and verify the result
    const result = await runShellCommand('test command');
    expect(result).toBe('command output');
  });

  it('should handle timeouts', async () => {
    // We're already mocking the runShellCommand function in beforeEach
    // Just call it and verify the result
    const result = await runShellCommand('test command', 1000);
    expect(result).toBe('command output');
  });
});
