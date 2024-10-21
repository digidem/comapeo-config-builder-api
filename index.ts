import { Elysia, t } from 'elysia';
import { cors } from "@elysiajs/cors";
import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
const port = process.env.PORT ?? 3000;
const execAsync = promisify(exec);

function runShellCommand(command: string) {
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

const app = new Elysia().use(cors())

app
  .post('/', async ({ body }: { body: { file: File } }) => {
    body: t.Object({
      file: t.File()
    })
    try {
      if (!body.file) {
        throw new Error('No file provided in the request body');
      }
      // Create a temporary directory
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comapeo-settings-'));
      console.log('Temporary directory created:', tmpDir);

      // Extract the ZIP file
      const zipBuffer = await body.file.arrayBuffer();
      const zip = new AdmZip(Buffer.from(zipBuffer));
      zip.extractAllTo(tmpDir, true);

      // Find the config directory within the extracted zip
      const configDir = (await fs.readdir(tmpDir)).find(async file => {
        const stats = await fs.stat(path.join(tmpDir, file));
        return stats.isDirectory();
      });

      if (!configDir) {
        throw new Error('No configuration directory found in the uploaded ZIP file');
      }

      const fullConfigPath = path.join(tmpDir, configDir);
      const buildDir = path.join(fullConfigPath, 'build');
      const metadata = JSON.parse(await fs.readFile(path.join(fullConfigPath, 'metadata.json'), 'utf-8'));
      const buildFileName = `${metadata.name}-${metadata.version}.comapeocat`;
      const buildPath = path.join(buildDir, buildFileName);

      console.log('Building settings in:', buildPath);
      await fs.mkdir(buildDir, { recursive: true });

      // Start the shell command in the background
      runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`);

      console.log('Waiting for .comapeocat file...');
      let builtSettingsPath = '';
      const maxAttempts = 120; // Increased maximum number of attempts
      const delayBetweenAttempts = 1000; // 1 second delay between attempts

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const fileStats = await fs.stat(buildPath);
          if (fileStats.isFile() && fileStats.size > 0) {
            builtSettingsPath = buildPath;
            break;
          }
        } catch (error) {
          // File doesn't exist yet, continue waiting
        }
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }

      if (!builtSettingsPath) {
        throw new Error('No .comapeocat file found in the build directory after waiting');
      }

      console.log('.comapeocat file found:', builtSettingsPath);

      // Clean up the temporary directory (uncomment when ready)
      // await fs.rm(tmpDir, { recursive: true, force: true });

      // Return the built settings file
      return Bun.file(builtSettingsPath);
    } catch (error) {
      console.error('Error processing the data:', error);
      return new Response(JSON.stringify({
        status: 500,
        message: 'Error processing the data: ' + (error as Error).message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  })
  .listen(port)
console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);

export { app };
export type App = typeof app;