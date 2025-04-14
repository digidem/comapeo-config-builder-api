import { createApp } from './config/app';

const port = process.env.PORT ?? 3000;
const app = createApp();

app.listen(port);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);

export { app };
export type App = typeof app;
