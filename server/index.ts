import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms } from './rooms';
import { makeMap, makeStaticMap } from '../shared/map';
import { NATIONS, RELIGIONS, EMBLEMS, holyCityId } from '../shared/rules';
import { EVENTS, RESOURCES, SEASONS } from '../shared/strategy';
import { OBJECTIVES } from '../shared/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const headless = process.argv.includes('--headless');
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
    res.end(
      JSON.stringify({ status: 'ok', game: 'concordia', version: '0.4.0', protocolVersion: 4 }),
    );
    return;
  }
  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(roomService.listPublicRooms()));
    return;
  }
  if (req.url?.split('?')[0] === '/api/schema') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        protocolVersion: 4,
        nations: NATIONS.map((n) => ({ ...n, emblemPath: EMBLEMS[n.emblem] })),
        religions: RELIGIONS,
        holyCities: Object.fromEntries(
          (['WORLD', 'EUROPE', 'AMERICAS', 'ASIA'] as const).map((scope) => [
            scope,
            Object.fromEntries(
              Object.keys(RELIGIONS).map((id) => [
                id,
                holyCityId(
                  id as keyof typeof RELIGIONS,
                  makeMap(
                    scope === 'WORLD' ? 'campaign' : 'quick',
                    scope === 'WORLD' ? 'EUROPE' : scope,
                  ),
                ),
              ]),
            ),
          ]),
        ),
        objectives: OBJECTIVES,
        resources: RESOURCES,
        seasons: SEASONS,
        events: EVENTS,
        transport: '/ws',
        map: makeStaticMap(),
        orderTypes: [
          'RECRUIT_BATTALION',
          'MOVE_BATTALION',
          'ENTRENCH_BATTALION',
          'TRAIN_BATTALION',
          'MERGE_BATTALIONS',
          'SPLIT_BATTALION',
          'EMBARK_BATTALION',
          'BUILD_FORT',
          'BUILD_PORT',
          'BUILD_MARKET',
          'PACIFY',
          'CONVERT',
          'DIPLOMACY',
          'RAZE_PROVINCE',
          'MERGE_ALL',
        ],
      }),
    );
    return;
  }
  if (headless) {
    res.writeHead(404);
    res.end('Servidor headless: utilize /ws ou /api/schema.');
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
const roomService = attachRooms(server, {
  stateFile: process.env.ROOMS_STATE_FILE ?? path.join(root, '.local', 'rooms-state.json'),
});
const vite =
  production || headless
    ? null
    : await (
        await import('vite')
      ).createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
const port = Number(process.env.PORT ?? 3000),
  host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
  const address = server.address(),
    actualPort = address && typeof address === 'object' ? address.port : port;
  console.log(
    `Concórdia: servidor ${headless ? 'headless' : production ? 'produção' : 'desenvolvimento'} na porta ${actualPort} (${host}).`,
  );
  process.send?.({ type: 'listening', port: actualPort });
});
async function shutdown() {
  roomService.close();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
