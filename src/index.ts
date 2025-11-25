import { createApp } from './app';
import { config } from './config/app';
import pkg from '../package.json';

// Create and start the application
const app = createApp();
app.listen(config.port);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(`📦 Version: ${pkg.version}`);

export { app };
export type { App } from './app';
