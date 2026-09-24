import { createServer } from 'node:http';
import next from 'next';
import { createRealtimeGateway } from '@/lib/realtime/server';

const dev = process.env.NODE_ENV !== 'production';
const bindAddress = dev ? '127.0.0.1' : '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT debe ser un puerto TCP válido');
}

const app = next({ dev, hostname: bindAddress, port });
await app.prepare();

const handle = app.getRequestHandler();
const httpServer = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    console.error('[server] request failed:', error);
    if (!response.headersSent) response.writeHead(500);
    response.end('Internal server error');
  });
});

const realtime = await createRealtimeGateway(httpServer);
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[server] ${signal}: closing gracefully`);
  try {
    await realtime.close();
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    console.error('[server] graceful shutdown failed:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

httpServer.listen(port, bindAddress, () => {
  const publicUrl = dev
    ? `http://localhost:${port}`
    : process.env.BETTER_AUTH_URL;
  console.info(
    `[server] CRM ready at ${publicUrl} (${dev ? 'development' : 'production'})`
  );
});
