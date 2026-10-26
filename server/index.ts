import { CONTINENT_BONUSES } from '../shared/risk';
import { SUPREME_COMMANDS } from '../shared/supreme';
import { BALANCE, ECONOMY_BALANCE } from '../shared/balance';
import { MAX_MASS_RECRUITMENT } from '../shared/massRecruitment';
import { SKILLS, TRAITS } from '../shared/military';
import { BUILDINGS } from '../shared/development';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRooms, RoomSaveDownloadError } from './rooms';
import {
  makeMap,
  makeStaticMap,
  WORLD_RIVERS,
  riverCrossings,
  impassableFeatures,
} from '../shared/map';
import { DILEMMAS } from '../shared/dilemmas';
import { NATIONS, RELIGIONS, EMBLEMS, holyCityId } from '../shared/rules';
import { EVENTS, RESOURCES, SEASONS } from '../shared/strategy';
import { OBJECTIVES } from '../shared/types';
import worldGeometry from '../shared/world-geometry.json';
import { handleHttpGameApi } from './httpGameApi';
import { SFX_SPEC, CINEMATIC_SFX_SPEC } from '../shared/audioDSP';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const headless = process.argv.includes('--headless');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (await handleHttpGameApi(req, res, roomService)) return;
  if (req.method === 'GET' && req.url?.split('?')[0] === '/api/audio-assets') {
    const folder = path.join(root, production ? 'dist' : 'public', 'assets', 'sfx');
    const files = Object.keys({ ...SFX_SPEC, ...CINEMATIC_SFX_SPEC })
      .flatMap((name) => ['wav', 'ogg', 'mp3'].map((ext) => `${name}.${ext}`))
      .filter((name) => existsSync(path.join(folder, name)));
    const musicFolder = path.join(root, production ? 'dist' : 'public', 'assets', 'music');
    files.push(
      ...['peace', 'war', 'battle', 'victory', 'defeat']
        .flatMap((theme) => ['ogg', 'mp3', 'wav'].map((extension) => `bgm-${theme}.${extension}`))
        .filter((name) => existsSync(path.join(musicFolder, name))),
    );
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(files));
    return;
  }
  if (req.url?.split('?')[0] === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        game: 'concordia',
        version: '1.2.0',
        protocolVersion: 7,
      }),
    );
    return;
  }
  if (
    req.method === 'GET' &&
    ['/api/rooms', '/api/rooms/public'].includes(req.url?.split('?')[0] ?? '')
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify(roomService.listPublicRooms(req.url?.split('?')[0] === '/api/rooms/public')),
    );
    return;
  }
  const download = req.url?.split('?')[0].match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/DownloadSave$/);
  if (req.method === 'GET' && download) {
    try {
      const playerId =
        typeof req.headers['x-concordia-player'] === 'string'
          ? req.headers['x-concordia-player']
          : '';
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? '';
      const save = roomService.downloadSave(download[1], playerId, token);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="concordia-save-${save.game.code}.json"`,
      });
      res.end(JSON.stringify(save));
    } catch (error) {
      res.writeHead(error instanceof RoomSaveDownloadError ? error.status : 500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          error:
            error instanceof RoomSaveDownloadError
              ? error.message
              : 'Não foi possível ler o arquivo preservado da campanha.',
        }),
      );
    }
    return;
  }
  if (['/api/schema', '/api/bootstrap'].includes(req.url?.split('?')[0] ?? '')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        protocolVersion: 7,
        version: '1.2.0',
        geometry: worldGeometry,
        polling: { state: '/api/rooms/:code/state', intervalMs: 1000, presenceLeaseMs: 15000 },
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
        dilemmas: DILEMMAS,
        continentBonuses: CONTINENT_BONUSES,
        supremeCommands: SUPREME_COMMANDS,
        balance: { opening: BALANCE, economy: ECONOMY_BALANCE },
        massRecruitment: {
          command: 'MASS_RECRUIT',
          units: ['infantry', 'cavalry', 'artillery'],
          maximumRequest: MAX_MASS_RECRUITMENT,
          preservesExistingOrders: true,
          allowsPartialFulfillment: true,
        },
        rivers: WORLD_RIVERS,
        riverCrossings,
        impassableFeatures,
        skills: SKILLS,
        commanderTraits: TRAITS,
        buildings: BUILDINGS,
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
          'BUILD_BUILDING',
          'DEMOLISH_BUILDING',
          'ASSAULT_SIEGE',
          'NAVAL_BRIDGE',
          'AUTO_TRANSPORT',
          'BOMBARD_COAST',
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
      ).createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
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
