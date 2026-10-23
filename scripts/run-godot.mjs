import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = process.env.GODOT_BIN
  ? [process.env.GODOT_BIN]
  : process.platform === 'win32'
    ? ['godot.exe', 'godot4.exe', 'godot', 'godot4']
    : ['godot', 'godot4', '/usr/local/bin/godot'];
const executable = candidates.find((candidate) => {
  const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
  const version = (result.stdout ?? '').match(/^(\d+)\.(\d+)/m);
  return result.status === 0 && version && Number(version[1]) === 4 && Number(version[2]) >= 3;
});
if (!executable) {
  console.error(
    'Godot 4.3+ não encontrado. Instale a versão Standard e defina GODOT_BIN com o caminho do executável. Consulte godot-client/README_GODOT.md.',
  );
  process.exit(1);
}
const args = process.argv.slice(2);
if (args.includes('--export-release') || args.includes('--export-debug')) {
  mkdirSync(path.join(root, '.local', 'godot-build'), { recursive: true });
  mkdirSync(path.join(root, 'godot-client', 'build'), { recursive: true });
}
const child = spawn(executable, ['--path', path.join(root, 'godot-client'), ...args], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});
let diagnostics = '';
const forward = (stream, target) => {
  stream.on('data', (chunk) => {
    target.write(chunk);
    diagnostics += chunk.toString();
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);
child.on('error', (error) => {
  console.error(`Não foi possível iniciar Godot: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  const check =
    args.includes('--headless') && (args.includes('--editor') || args.includes('--script'));
  const failedScript =
    /(?:SCRIPT ERROR:|Parse Error:|ERROR: Failed to load|ERROR: Error loading)/.test(diagnostics);
  process.exitCode = check && failedScript ? 1 : (code ?? 1);
});
