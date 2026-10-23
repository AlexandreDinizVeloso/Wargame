import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStaticMap } from '../shared/map';
import { NATIONS, RELIGIONS } from '../shared/rules';
import { BUILDINGS } from '../shared/development';
import { BALANCE, ECONOMY_BALANCE } from '../shared/balance';
import { SEASONS } from '../shared/strategy';
import { SUPREME_COMMANDS } from '../shared/supreme';
import { DILEMMAS } from '../shared/dilemmas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'godot-client/data');
mkdirSync(destination, { recursive: true });
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const map = makeStaticMap();
if (
  map.filter((p) => p.kind === 'LAND').length !== 42 ||
  map.filter((p) => p.kind === 'SEA_ZONE').length !== 10
)
  throw new Error('O cliente Godot deve compartilhar o tabuleiro de 42 terras e 10 mares.');
const geometrySource = path.join(root, 'shared/world-geometry.json');
copyFileSync(geometrySource, path.join(destination, 'world-geometry.json'));
const bootstrap = {
  version,
  protocolVersion: 7,
  map,
  nations: NATIONS,
  religions: RELIGIONS,
  buildings: BUILDINGS,
  seasons: SEASONS,
  balance: { opening: BALANCE, economy: ECONOMY_BALANCE },
  supremeCommands: SUPREME_COMMANDS,
  dilemmas: DILEMMAS,
};
writeFileSync(path.join(destination, 'bootstrap.json'), JSON.stringify(bootstrap, null, 2) + '\n');
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
writeFileSync(
  path.join(destination, 'manifest.json'),
  JSON.stringify(
    {
      generatedBy: 'npm run godot:sync',
      version,
      geometrySha256: sha256(readFileSync(geometrySource)),
      mapSha256: sha256(JSON.stringify(map)),
      source: 'shared/map.ts + shared/world-geometry.json',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Godot: dados sincronizados (${map.length} regiões, versão ${version}).`);
