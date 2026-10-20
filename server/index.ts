import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms } from './rooms';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.url?.split('?')[0] === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', game: 'concordia', version: '0.1.0' }));
    return;
  }
  if (!production) {
    vite!.middlewares(req, res, () => {
      res.writeHead(404);
      res.end('Não encontrado.');
    });
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://server').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const dist = path.join(root, 'dist'),
    candidate = path.resolve(dist, `.${pathname}`);
  if (!candidate.startsWith(dist + path.sep) && candidate !== dist) {
    res.writeHead(403);
    res.end();
    return;
  }
  const file =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : path.join(dist, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(503);
    res.end('Execute npm run build antes de iniciar em produção.');
    return;
  }
  res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader(
    'Cache-Control',
    path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
  );
  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
});
const roomService = attachRooms(server);
const vite = production
  ? null
  : await (
      await import('vite')
    ).createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () =>
  console.log(
    `Concórdia: servidor ${production ? 'produção' : 'desenvolvimento'} na porta ${port} (${host}).`,
  ),
);
async function shutdown() {
  roomService.close();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
