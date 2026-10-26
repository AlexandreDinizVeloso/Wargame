import { useEffect, useRef, type RefObject } from 'react';
import type { BattleReport, Composition, Season } from '../../shared/types';

export interface BattleClock {
  elapsedMs: number;
  playing: boolean;
}

interface Props {
  battle: BattleReport;
  attackerColor: string;
  defenderColor: string;
  terrain: string;
  season: Season;
  clock: RefObject<BattleClock>;
  reducedMotion: boolean;
}

type ArmyKind = 'infantry' | 'cavalry' | 'artillery' | 'warships' | 'transports';
interface Miniature {
  side: 0 | 1;
  kind: ArmyKind;
  x: number;
  row: number;
  scale: number;
  seed: number;
  lossRank: number;
}

const WIDTH = 1600;
const DURATION = 1500;
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const smooth = (from: number, to: number, n: number) => {
  const t = clamp((n - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const hash = (value: string) =>
  [...value].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const random = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function compositionFor(battle: BattleReport, side: 0 | 1): Composition {
  const known = side === 0 ? battle.attackerCompositionBefore : battle.defenderCompositionBefore;
  if (known) return known;
  // Older reports do not record composition. Their neutral silhouettes only represent the known total.
  const troops = side === 0 ? battle.attackerTroops : battle.defenderTroops;
  return {
    infantry: battle.naval ? 0 : troops,
    cavalry: 0,
    artillery: 0,
    warships: battle.naval ? troops : 0,
    transports: 0,
  };
}

function formations(battle: BattleReport): Miniature[] {
  const units: Miniature[] = [];
  const seed = hash(battle.id);
  for (const side of [0, 1] as const) {
    const comp = compositionFor(battle, side);
    const kinds: ArmyKind[] = battle.naval
      ? ['warships', 'transports']
      : ['infantry', 'cavalry', 'artillery'];
    let slot = 0;
    for (const kind of kinds) {
      const count = comp[kind];
      if (!(count > 0)) continue;
      const visualCount = battle.naval
        ? Math.min(kind === 'warships' ? 4 : 2, Math.max(1, Math.ceil(Math.sqrt(count))))
        : Math.min(kind === 'infantry' ? 28 : kind === 'cavalry' ? 8 : 4, Math.ceil(count * 2.5));
      for (let i = 0; i < visualCount; i++) {
        const row = battle.naval ? slot % 3 : kind === 'artillery' ? 0 : i % 3;
        const column = battle.naval ? Math.floor(slot / 3) : Math.floor(i / 3);
        const rear = kind === 'artillery' ? 115 : kind === 'cavalry' ? -60 : 0;
        const x = battle.naval
          ? 290 + column * 128 + row * 42
          : 360 + column * 21 + row * 13 - rear;
        units.push({
          side,
          kind,
          x: side === 0 ? x : WIDTH - x,
          row,
          scale: battle.naval ? 0.9 + row * 0.14 : 0.94 + row * 0.12,
          seed: random(seed + side * 107 + slot * 13 + i),
          lossRank: (i + 0.5) / visualCount,
        });
        slot++;
      }
    }
  }
  return units;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(7,12,14,.34)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.12, 0, Math.PI * 2);
  ctx.fill();
}

function flag(ctx: CanvasRenderingContext2D, color: string, t: number, size = 1) {
  ctx.save();
  ctx.scale(size, size);
  ctx.strokeStyle = '#4c3826';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -48);
  ctx.stroke();
  const flutter = Math.sin(t * 4) * 3;
  ctx.beginPath();
  ctx.moveTo(1, -47);
  ctx.bezierCurveTo(10, -49 + flutter, 17, -41 - flutter, 27, -45);
  ctx.lineTo(27, -27);
  ctx.bezierCurveTo(17, -23 - flutter, 9, -33 + flutter, 1, -29);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ddbc73';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f1dfab';
  ctx.fillRect(11, -43, 3, 15);
  ctx.restore();
}

function soldier(
  ctx: CanvasRenderingContext2D,
  color: string,
  t: number,
  walk: number,
  shooting: boolean,
  banner: boolean,
) {
  const step = Math.sin(t * 9) * 4 * walk;
  ctx.lineWidth = 3.8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#25282b';
  ctx.beginPath();
  ctx.moveTo(-2, -10);
  ctx.lineTo(-4 - step, 0);
  ctx.moveTo(2, -10);
  ctx.lineTo(5 + step, 0);
  ctx.stroke();
  const coat = ctx.createLinearGradient(-5, -25, 6, -8);
  coat.addColorStop(0, color);
  coat.addColorStop(1, '#1a2429');
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-5, -25);
  ctx.lineTo(4, -25);
  ctx.lineTo(7, -10);
  ctx.lineTo(-6, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c8b99b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-4, -22);
  ctx.lineTo(4, -13);
  ctx.stroke();
  ctx.fillStyle = '#bb987b';
  ctx.beginPath();
  ctx.arc(0, -28, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#333b3b';
  ctx.beginPath();
  ctx.ellipse(0, -31, 5.5, 2.1, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-3.4, -35, 6.8, 4);
  if (banner) {
    ctx.save();
    ctx.translate(7, -6);
    flag(ctx, color, t, 0.95);
    ctx.restore();
  } else {
    ctx.strokeStyle = '#593c27';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-1, -18);
    ctx.lineTo(shooting ? 23 : 13, shooting ? -19 : -39);
    ctx.stroke();
    ctx.strokeStyle = '#b4b6ab';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(shooting ? 16 : 8, shooting ? -19 : -32);
    ctx.lineTo(shooting ? 29 : 17, shooting ? -19 : -45);
    ctx.stroke();
    ctx.strokeStyle = '#b99b7b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -23);
    ctx.lineTo(10, -19);
    ctx.stroke();
  }
}

function cavalry(ctx: CanvasRenderingContext2D, color: string, t: number, moving: number) {
  const gait = t * 10;
  ctx.strokeStyle = '#3d2e24';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? -12 : 11;
    const bend = Math.sin(gait + i * 1.7) * 7 * moving;
    ctx.beginPath();
    ctx.moveTo(x, -15);
    ctx.lineTo(x + bend * 0.5, -7);
    ctx.lineTo(x - bend, 0);
    ctx.stroke();
  }
  const flank = ctx.createLinearGradient(-20, -30, 20, -10);
  flank.addColorStop(0, '#7a5540');
  flank.addColorStop(1, '#352d27');
  ctx.fillStyle = flank;
  ctx.beginPath();
  ctx.ellipse(0, -21, 21, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(11, -24);
  ctx.lineTo(16, -43);
  ctx.lineTo(29, -41);
  ctx.lineTo(34, -33);
  ctx.lineTo(23, -30);
  ctx.lineTo(20, -15);
  ctx.fill();
  ctx.strokeStyle = '#1b2425';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-17, -23);
  ctx.quadraticCurveTo(-30, -29, -29, -13);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-11, -26, 20, 10);
  ctx.fillStyle = '#253237';
  ctx.fillRect(-4, -44, 11, 20);
  ctx.fillStyle = '#c9ab84';
  ctx.beginPath();
  ctx.arc(2, -49, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bdbaa5';
  ctx.beginPath();
  ctx.ellipse(2, -53, 6, 3, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b5b2a5';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(9, -37);
  ctx.lineTo(39, -62);
  ctx.stroke();
}

function cannon(ctx: CanvasRenderingContext2D, color: string, recoil: number) {
  ctx.fillStyle = '#503a27';
  ctx.beginPath();
  ctx.moveTo(-27, -5);
  ctx.lineTo(8, -20);
  ctx.lineTo(16, -15);
  ctx.lineTo(-20, -2);
  ctx.closePath();
  ctx.fill();
  const bronze = ctx.createLinearGradient(0, -25, 0, -12);
  bronze.addColorStop(0, '#d0ad66');
  bronze.addColorStop(0.4, '#75603c');
  bronze.addColorStop(1, '#332f25');
  ctx.fillStyle = bronze;
  ctx.beginPath();
  ctx.moveTo(-10 - recoil, -24);
  ctx.lineTo(30 - recoil, -26);
  ctx.lineTo(30 - recoil, -16);
  ctx.lineTo(-10 - recoil, -12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#151b1b';
  ctx.beginPath();
  ctx.ellipse(29 - recoil, -21, 2.8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(-13, -12, 14, 5);
  for (const x of [-9, 10]) {
    ctx.fillStyle = '#302a24';
    ctx.beginPath();
    ctx.arc(x, -7, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#967e57';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 8, -7 - Math.sin(a) * 8);
      ctx.lineTo(x + Math.cos(a) * 8, -7 + Math.sin(a) * 8);
      ctx.stroke();
    }
  }
}

function galleon(ctx: CanvasRenderingContext2D, color: string, t: number, transport: boolean) {
  ctx.save();
  ctx.rotate(Math.sin(t * 1.3) * 0.022);
  const wood = ctx.createLinearGradient(0, -12, 0, 28);
  wood.addColorStop(0, '#ac7a4d');
  wood.addColorStop(0.25, '#79502f');
  wood.addColorStop(1, '#302e28');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(-61, -3);
  ctx.quadraticCurveTo(-8, 8, 61, -13);
  ctx.lineTo(45, 18);
  ctx.quadraticCurveTo(-5, 34, -47, 19);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c19a59';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-46 + i * 2, 5 + i * 6);
    ctx.quadraticCurveTo(0, 22 + i * 2, 49 - i * 3, 1 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#71472d';
  ctx.fillRect(-52, -22, 25, 22);
  ctx.fillRect(28, -23, 21, 16);
  ctx.strokeStyle = '#c4b48c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-54, -23);
  ctx.lineTo(-25, -23);
  ctx.moveTo(28, -24);
  ctx.lineTo(51, -24);
  ctx.stroke();
  for (const mast of [-18, 24]) {
    const mastHeight = mast < 0 ? 110 : 91;
    ctx.strokeStyle = '#5a3c29';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mast, 0);
    ctx.lineTo(mast, -mastHeight);
    ctx.stroke();
    for (const level of [0, 1]) {
      const y = -mastHeight + 11 + level * 37;
      const width = mast < 0 ? 45 : 35;
      const wave = Math.sin(t * 2 + mast + level) * 3;
      const sail = ctx.createLinearGradient(mast - 15, y, mast + 30, y + 28);
      sail.addColorStop(0, '#e0d4af');
      sail.addColorStop(0.65, color);
      sail.addColorStop(1, '#665840');
      ctx.fillStyle = sail;
      ctx.beginPath();
      ctx.moveTo(mast - width / 2, y);
      ctx.lineTo(mast + width / 2, y);
      ctx.quadraticCurveTo(mast + width / 2 + 8 + wave, y + 22, mast + width / 2, y + 33);
      ctx.quadraticCurveTo(mast, y + 29, mast - width / 2, y + 33);
      ctx.quadraticCurveTo(mast - width / 2 + 9 + wave, y + 17, mast - width / 2, y);
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,225,181,.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(59,47,35,.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(mast, -mastHeight);
    ctx.lineTo(-49, 0);
    ctx.moveTo(mast, -mastHeight);
    ctx.lineTo(55, -7);
    ctx.stroke();
  }
  if (!transport) {
    ctx.fillStyle = '#171f20';
    for (let i = 0; i < 6; i++) ctx.fillRect(-30 + i * 12, 8 - i * 0.6, 5, 4);
  }
  ctx.save();
  ctx.translate(-18, -110);
  flag(ctx, color, t, 0.47);
  ctx.restore();
  ctx.restore();
}

function fallbackLandscape(
  ctx: CanvasRenderingContext2D,
  height: number,
  naval: boolean,
  season: Season,
) {
  const winter = season === 'WINTER';
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, winter ? '#263848' : '#1f3540');
  sky.addColorStop(0.4, winter ? '#9dafb5' : '#b5aa86');
  sky.addColorStop(0.62, winter ? '#778e97' : '#7b7f68');
  sky.addColorStop(1, naval ? '#102b33' : winter ? '#5b6a68' : '#293b32');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, height);
  const glow = ctx.createRadialGradient(1100, height * 0.26, 0, 1100, height * 0.26, 490);
  glow.addColorStop(0, 'rgba(255,220,156,.48)');
  glow.addColorStop(0.45, 'rgba(230,186,116,.13)');
  glow.addColorStop(1, 'rgba(200,180,130,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, height * 0.75);
  for (let layer = 0; layer < 4; layer++) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= WIDTH + 50; x += 50) {
      const y =
        height * (0.35 + layer * 0.08) +
        Math.sin(x * 0.004 + layer * 3) * (35 + layer * 4) +
        Math.sin(x * 0.013 + layer) * 16;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, height);
    ctx.closePath();
    ctx.fillStyle = ['#4f6265', '#485c5a', '#3f554b', '#34483c'][layer];
    if (naval) ctx.fillStyle = ['#485f64', '#3b565e', '#294854', '#183946'][layer];
    ctx.globalAlpha = 0.35 + layer * 0.12;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!naval) {
    for (let i = 0; i < 290; i++) {
      const x = random(i * 9 + 2) * WIDTH;
      const y = height * (0.57 + random(i * 13) * 0.43);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(202,180,112,.14)' : 'rgba(14,34,24,.2)';
      ctx.fillRect(x, y, 2 + random(i) * 7, 1);
    }
  }
}

function castle(ctx: CanvasRenderingContext2D, height: number, level: number) {
  const x = 1210;
  const y = height * 0.51;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.77;
  ctx.fillStyle = '#4f5550';
  ctx.fillRect(-82, -41, 160, 43);
  for (const tower of [-85, -32, 30, 80].slice(0, Math.min(4, level + 2))) {
    ctx.fillStyle = '#62685f';
    ctx.fillRect(tower - 11, -67, 23, 71);
    ctx.fillStyle = '#343f3d';
    ctx.fillRect(tower - 3, -48, 5, 13);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#73766a';
      ctx.fillRect(tower - 13 + i * 9, -75, 6, 12);
    }
  }
  ctx.fillStyle = '#252f2e';
  ctx.beginPath();
  ctx.moveTo(-12, 2);
  ctx.lineTo(-12, -20);
  ctx.quadraticCurveTo(0, -37, 12, -20);
  ctx.lineTo(12, 2);
  ctx.fill();
  ctx.restore();
}

function smoke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  age: number,
  seed: number,
  scale: number,
) {
  if (age < 0 || age > 2.6) return;
  const alpha = Math.max(0, 1 - age / 2.6) * 0.26;
  for (let i = 0; i < 4; i++) {
    const radius = (10 + age * 17 + i * 4) * scale;
    const sx = x + age * (30 + i * 5) + Math.sin(seed + i) * 12;
    const sy = y - age * (19 + i * 5) + Math.cos(seed + i) * 6;
    const cloud = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    cloud.addColorStop(0, `rgba(210,204,181,${alpha})`);
    cloud.addColorStop(1, 'rgba(150,156,148,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }
}

function flash(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, size: number) {
  if (age < 0 || age > 0.16) return;
  const alpha = (1 - age / 0.16) * 0.8;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, size);
  glow.addColorStop(0, `rgba(255,236,185,${alpha})`);
  glow.addColorStop(0.23, `rgba(242,172,75,${alpha * 0.75})`);
  glow.addColorStop(1, 'rgba(221,131,48,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
}

/** A visual reconstitution only: all outcomes and losses come from the authoritative report. */
export default function BattleTheatreCanvas({
  battle,
  attackerColor,
  defenderColor,
  terrain,
  season,
  clock,
  reducedMotion,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d', { alpha: false });
    if (!context) return;
    const ctx = context;
    const units = formations(battle);
    const compactUnits: Miniature[] = [];
    const compactLimits: Record<ArmyKind, number> = {
      infantry: 18,
      cavalry: 4,
      artillery: 2,
      warships: 2,
      transports: 1,
    };
    for (const side of [0, 1] as const)
      for (const kind of Object.keys(compactLimits) as ArmyKind[]) {
        const group = units.filter((unit) => unit.side === side && unit.kind === kind);
        const count = Math.min(group.length, compactLimits[kind]);
        for (let i = 0; i < count; i++)
          compactUnits.push(group[Math.floor((i * group.length) / count)]);
      }
    const desktopOrdered = [...units].sort((a, b) => a.row - b.row);
    const compactOrdered = compactUnits.sort((a, b) => a.row - b.row);
    const seed = hash(battle.id);
    let frame = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let lastPaint = -1;
    const plate = new Image();
    plate.decoding = 'async';
    plate.src = `/assets/cinematics/${battle.naval ? 'naval' : 'land'}-battlefield.webp`;
    plate.onload = () => {
      lastPaint = -1;
    };

    const resize = () => {
      const bounds = element.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 1.75);
      element.width = Math.round(width * pixelRatio);
      element.height = Math.round(height * pixelRatio);
      lastPaint = -1;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const paint = () => {
      if (disposed) return;
      frame = requestAnimationFrame(paint);
      if (document.hidden || !width || !height) return;
      const elapsed = clamp(clock.current.elapsedMs, 0, DURATION);
      if (lastPaint === elapsed) return;
      lastPaint = elapsed;
      const time = elapsed / 1000;
      const h = (height * WIDTH) / width;
      const portrait = width <= 600 && height > width * 1.1;
      const movement = reducedMotion ? 0 : 1;
      const approach = smooth(0, 0.78, time);
      const aftermath = smooth(1.12, 1.46, time);
      const attackerWins = battle.outcome === 'attacker_victory';
      ctx.setTransform((width * pixelRatio) / WIDTH, 0, 0, (width * pixelRatio) / WIDTH, 0, 0);
      ctx.clearRect(0, 0, WIDTH, h);
      ctx.save();
      const zoom = 1 + approach * 0.025 * movement;
      ctx.translate(WIDTH / 2, h * 0.56);
      ctx.scale(zoom, zoom);
      ctx.translate(-WIDTH / 2 - Math.sin(time * 0.13) * 8 * movement, -h * 0.56);
      if (plate.complete && plate.naturalWidth > 0) {
        const scale = Math.max(WIDTH / plate.naturalWidth, h / plate.naturalHeight);
        const imageW = plate.naturalWidth * scale;
        const imageH = plate.naturalHeight * scale;
        ctx.drawImage(plate, (WIDTH - imageW) / 2, (h - imageH) / 2, imageW, imageH);
        ctx.fillStyle = battle.naval ? 'rgba(8,28,36,.16)' : 'rgba(12,24,19,.12)';
        ctx.fillRect(0, 0, WIDTH, h);
      } else fallbackLandscape(ctx, h, battle.naval, season);
      if (season === 'WINTER') {
        ctx.fillStyle = 'rgba(140,183,205,.17)';
        ctx.fillRect(0, 0, WIDTH, h);
      } else if (season === 'AUTUMN') {
        ctx.fillStyle = 'rgba(161,101,39,.12)';
        ctx.fillRect(0, 0, WIDTH, h);
      }
      if (!battle.naval && battle.fortLevel > 0 && !(plate.complete && plate.naturalWidth > 0))
        castle(ctx, h, battle.fortLevel);

      // Haze between the horizon and the formations gives their miniature silhouettes depth.
      const horizon = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.76);
      horizon.addColorStop(0, 'rgba(193,185,156,0)');
      horizon.addColorStop(0.35, 'rgba(198,191,165,.13)');
      horizon.addColorStop(1, 'rgba(150,159,146,0)');
      ctx.fillStyle = horizon;
      ctx.fillRect(0, h * 0.42, WIDTH, h * 0.4);
      if (battle.naval) {
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 58; i++) {
          const x = random(i * 17 + seed) * WIDTH;
          const y = h * (0.54 + random(i * 11 + seed) * 0.46);
          const drift = Math.sin(time * 0.8 + i) * 9 * movement;
          ctx.strokeStyle = `rgba(172,201,190,${0.06 + random(i) * 0.13})`;
          ctx.beginPath();
          ctx.moveTo(x + drift, y);
          ctx.quadraticCurveTo(x + 12 + drift, y - 3, x + 27 + drift, y);
          ctx.stroke();
        }
      }

      const ordered = portrait ? compactOrdered : desktopOrdered;
      for (const unit of ordered) {
        const sideSign = unit.side === 0 ? 1 : -1;
        const color = unit.side === 0 ? attackerColor : defenderColor;
        const losing = attackerWins ? unit.side === 1 : unit.side === 0;
        const total = unit.side === 0 ? battle.attackerTroops : battle.defenderTroops;
        const casualties = unit.side === 0 ? battle.attackerCasualties : battle.defenderCasualties;
        const composition =
          unit.side === 0 ? battle.attackerCompositionBefore : battle.defenderCompositionBefore;
        const compositionLosses =
          unit.side === 0 ? battle.attackerCompositionLosses : battle.defenderCompositionLosses;
        const knownKind = composition?.[unit.kind];
        const lossFraction =
          knownKind !== undefined && knownKind > 0 && compositionLosses
            ? clamp((compositionLosses[unit.kind] ?? 0) / knownKind)
            : total > 0
              ? clamp(casualties / total)
              : 0;
        const isCasualty = unit.lossRank < lossFraction;
        const fallen = isCasualty ? smooth(0.88 + unit.seed * 0.14, 1.14 + unit.seed * 0.08, time) : 0;
        const retreat =
          losing && !battle.stackwipe && battle.retreatDestinationId
            ? aftermath * 90 * movement
            : 0;
        const advance = battle.naval
          ? approach * 110 * movement
          : approach * (unit.kind === 'cavalry' ? 185 : 125) * movement;
        const x = portrait
          ? (unit.side === 0 ? 368 : 1232) +
            (unit.x - (unit.side === 0 ? 440 : 1160)) * 0.75 +
            (advance * 0.6 - retreat * 0.65) * sideSign
          : unit.x + (advance - retreat) * sideSign;
        const baseY = portrait
          ? battle.naval
            ? h * (0.44 + unit.row * 0.055)
            : h * (0.49 + unit.row * 0.02)
          : battle.naval
            ? h * (0.57 + unit.row * 0.112)
            : h * (0.66 + unit.row * 0.073);
        const flankOffset = portrait
          ? unit.kind === 'cavalry'
            ? h * 0.07
            : unit.kind === 'artillery'
              ? -h * 0.065
              : 0
          : unit.kind === 'cavalry'
            ? h * 0.11
            : unit.kind === 'artillery'
              ? -h * 0.095
              : 0;
        const y = baseY + flankOffset + (unit.seed - 0.5) * (battle.naval ? 14 : 9);
        const s = unit.scale * (battle.naval ? 1.12 : 1.18) * (portrait ? 2.3 : 1);
        const volleyTime =
          unit.kind === 'artillery' ? 0.28 + unit.seed * 0.08 : 0.48 + unit.seed * 0.1;
        const volleyAge = time - volleyTime;
        const secondAge = time - (battle.naval ? 0.74 + unit.seed * 0.08 : 0.82 + unit.seed * 0.08);
        shadow(
          ctx,
          x,
          y + 3,
          battle.naval ? 62 * s : unit.kind === 'cavalry' ? 26 * s : 10 * s,
          battle.naval ? 12 * s : 3 * s,
        );
        ctx.save();
        ctx.translate(
          x,
          y + (battle.naval ? Math.sin(time * 2.4 + unit.seed * 5) * 3 * movement : 0),
        );
        ctx.scale(s * sideSign, s);
        ctx.globalAlpha = 1 - fallen * 0.72;
        if (battle.naval) {
          ctx.translate(0, fallen * 25 * movement);
          ctx.rotate(fallen * 0.17 * movement);
          galleon(ctx, color, time * 2 * movement + unit.seed, unit.kind === 'transports');
        } else {
          if (fallen) {
            ctx.translate(0, -3 * movement);
            ctx.rotate(fallen * 1.35 * movement);
          }
          if (unit.kind === 'infantry')
            soldier(
              ctx,
              color,
              time * 2.4 * movement + unit.seed * 8,
              time < 0.78 ? movement : 0,
              time >= 0.44 && time < 0.98,
              unit.seed > 0.92,
            );
          else if (unit.kind === 'cavalry')
            cavalry(ctx, color, time * 2.4 * movement + unit.seed * 8, time < 0.98 ? movement : 0);
          else
            cannon(
              ctx,
              color,
              volleyAge > 0 && volleyAge < 0.22 ? Math.sin(volleyAge * 14) * 6 * movement : 0,
            );
        }
        ctx.restore();
        if (!reducedMotion && !fallen) {
          const armed =
            unit.kind === 'artillery' || unit.kind === 'infantry' || unit.kind === 'warships';
          if (armed) {
            const muzzleX =
              x + sideSign * (unit.kind === 'artillery' ? 34 : battle.naval ? 40 : 31) * s;
            const muzzleY = y - (unit.kind === 'artillery' ? 21 : battle.naval ? 2 : 20) * s;
            const fireAge = battle.naval ? time - (0.32 + unit.seed * 0.1) : volleyAge;
            flash(ctx, muzzleX, muzzleY, fireAge, unit.kind === 'infantry' ? 17 : 40);
            flash(ctx, muzzleX, muzzleY, secondAge, unit.kind === 'infantry' ? 13 : 31);
            if (unit.seed > (width < 700 ? 0.85 : 0.72)) {
              smoke(
                ctx,
                muzzleX,
                muzzleY,
                fireAge * 2.2,
                unit.seed * 12,
                unit.kind === 'infantry' ? 0.7 : 1.2,
              );
              smoke(
                ctx,
                muzzleX,
                muzzleY,
                secondAge * 2.2,
                unit.seed * 12,
                unit.kind === 'infantry' ? 0.6 : 1.1,
              );
            }
            if (unit.kind !== 'infantry' && fireAge > 0.03 && fireAge < 0.35) {
              const travel = fireAge / 0.35;
              const tx = muzzleX + sideSign * travel * 300;
              const ty = muzzleY - Math.sin(travel * Math.PI) * 60;
              ctx.strokeStyle = 'rgba(224,193,139,.25)';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(tx - sideSign * 25, ty - 2);
              ctx.lineTo(tx, ty);
              ctx.stroke();
              ctx.fillStyle = '#302d26';
              ctx.beginPath();
              ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // A few broad smoke banks read more like gunpowder than hundreds of glowing particles.
      for (let i = 0; i < (reducedMotion ? 3 : width < 700 ? 6 : 10); i++) {
        const start = 0.42 + random(seed + i * 17) * 0.45;
        const age = clamp((time - start) * 2.5, 0, 4);
        if (time < start) continue;
        const x = 470 + random(i * 11 + seed) * 650;
        const y = h * (0.63 + random(i + seed) * 0.16);
        const radius = 45 + age * 14;
        const fog = ctx.createRadialGradient(
          x + age * 8 * movement,
          y - age * 8 * movement,
          0,
          x,
          y,
          radius,
        );
        fog.addColorStop(0, `rgba(173,174,154,${(1 - aftermath * 0.45) * 0.12})`);
        fog.addColorStop(1, 'rgba(147,154,144,0)');
        ctx.fillStyle = fog;
        ctx.fillRect(x - radius, y - radius - 40, radius * 2 + 40, radius * 2 + 40);
      }
      const particles = reducedMotion ? 8 : width < 700 ? 18 : 32;
      for (let i = 0; i < particles; i++) {
        const offset = random(seed + i * 23);
        const x = ((offset * WIDTH + time * (8 + (i % 7)) * movement) % (WIDTH + 30)) - 15;
        const y =
          h * (0.35 + random(seed + i * 31) * 0.65) - Math.sin(time * 0.6 + i) * 12 * movement;
        ctx.fillStyle = season === 'WINTER' ? 'rgba(220,235,235,.29)' : 'rgba(224,198,139,.22)';
        ctx.beginPath();
        ctx.arc(x, y, season === 'WINTER' ? 1.7 : 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const vignette = ctx.createRadialGradient(
        WIDTH / 2,
        h * 0.53,
        WIDTH * 0.18,
        WIDTH / 2,
        h * 0.5,
        WIDTH * 0.7,
      );
      vignette.addColorStop(0, 'rgba(4,12,17,0)');
      vignette.addColorStop(1, 'rgba(4,12,17,.66)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, WIDTH, h);
      const foreground = ctx.createLinearGradient(0, h * 0.7, 0, h);
      foreground.addColorStop(0, 'rgba(5,13,17,0)');
      foreground.addColorStop(1, 'rgba(5,13,17,.58)');
      ctx.fillStyle = foreground;
      ctx.fillRect(0, h * 0.7, WIDTH, h * 0.3);
    };
    frame = requestAnimationFrame(paint);
    const invalidate = () => {
      lastPaint = -1;
    };
    document.addEventListener('visibilitychange', invalidate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      plate.onload = null;
      plate.src = '';
      document.removeEventListener('visibilitychange', invalidate);
    };
  }, [battle, attackerColor, defenderColor, terrain, season, clock, reducedMotion]);

  return <canvas ref={canvas} className="battle-cinema-canvas" aria-hidden="true" />;
}
