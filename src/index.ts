import { createApp } from './app';
import { config } from './config/app';

// Create and start the application
const app = createApp();
app.listen(config.port);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);

export { app };
export type { App } from './app';
