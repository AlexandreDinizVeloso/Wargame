import { technologyCost } from './world';
import type {
  Battalion,
  CommanderTrait,
  GameState,
  Player,
  SkillBranch,
  SkillDefinition,
  SkillId,
} from './types';
export const TRAITS: Record<CommanderTrait, { name: string; description: string }> = {
  SIEGE_MASTER: {
    name: 'Mestre de Cerco',
    description: '+1 cerco por rodada; ignora um nível de forte em combate.',
  },
  BLITZ_VANGUARD: {
    name: 'Vanguarda Relâmpago',
    description: '+15% ataque ao invadir; ignora custo adicional de floresta.',
  },
  IRON_WALL: {
    name: 'Bastião de Ferro',
    description: '+20% defesa, +15 recuperação de moral; protege da primeira aniquilação.',
  },
  FOREST_RANGER: {
    name: 'Mestre da Emboscada',
    description: '+30% ataque/defesa em florestas, colinas e montanhas.',
  },
  QUARTERMASTER: {
    name: 'Intendente Logístico',
    description: '−30% manutenção, +6 suprimento local e imunidade a atrito.',
  },
  SEA_WOLF: {
    name: 'Lobo do Mar',
    description: '+25% ataque naval e 35% chance de capturar um navio derrotado.',
  },
};
const skill = (id: SkillId, name: string, description: string): SkillDefinition => {
  const branch = id.slice(0, 3) as SkillBranch;
  const tier = Number(id[5]) as 1 | 2 | 3;
  return { id, branch, tier, cost: tier === 1 ? 25 : tier === 2 ? 45 : 70, name, description };
};
export const SKILLS: SkillDefinition[] = [
  skill('INF_T1', 'Formação de Escudos', '+12% defesa de infantaria.'),
  skill('INF_T2A', 'Falange de Piques', '+30% contra cavalaria e anula choque inimigo.'),
  skill('INF_T2B', 'Mosqueteiros de Linha', '+20% ataque de infantaria.'),
  skill('INF_T3', 'Guarda Veterana', '−25% baixas de infantaria e +10 moral após combate.'),
  skill('CAV_T1', 'Estribos de Aço', '+12% ataque de cavalaria.'),
  skill('CAV_T2A', 'Hussardos de Choque', '+30% ataque em planícies/costas; −10 moral no inimigo.'),
  skill(
    'CAV_T2B',
    'Dragões Exploradores',
    'Sem penalidade em terreno difícil e +15% defesa de cavalaria.',
  ),
  skill(
    'CAV_T3',
    'Manobra Envolvente',
    'Com ≥50% cavalaria: +1 movimento e +35% baixas em perseguição.',
  ),
  skill('ART_T1', 'Pólvora Calibrada', '+15% ataque de artilharia.'),
  skill(
    'ART_T2A',
    'Bombardas de Cerco',
    '+1 cerco com artilharia; destrói um nível de forte ao concluir.',
  ),
  skill(
    'ART_T2B',
    'Bateria de Campanha',
    '+25% poder campal; remove vulnerabilidade extra de canhões.',
  ),
  skill('ART_T3', 'Barragem Real', '−12 moral inimiga antes do choque, quando há artilharia.'),
  skill('NAV_T1', 'Cascos Couraçados', '+20% defesa e moral de frotas.'),
  skill(
    'NAV_T2A',
    'Corsários Reais',
    'Bloqueios transferem 35% da receita local para os corsários.',
  ),
  skill('NAV_T2B', 'Armada de Galeões', '+25% ataque de navios de guerra e +15% apoio costeiro.'),
  skill(
    'NAV_T3',
    'Domínio Oceânico',
    'Duas ligações marítimas por rodada; imunidade a atrito naval.',
  ),
];
export const BRANCHES: Record<SkillBranch, string> = {
  INF: '🛡️ Infantaria',
  CAV: '🐎 Cavalaria',
  ART: '💣 Artilharia',
  NAV: '⛵ Marinha',
};
export const hasSkill = (g: Pick<GameState, 'players'>, ownerId: string, id: SkillId) =>
  g.players.find((p) => p.id === ownerId)?.unlockedSkills.includes(id) ?? false;
export const commanderFor = (g: Pick<GameState, 'commanders'>, army: Battalion) =>
  g.commanders.find((c) => c.assignedBattalionId === army.id && c.ownerId === army.ownerId);
export function skillBlock(p: Player, id: SkillId, g?: Pick<GameState, 'turn'>): string | null {
  const s = SKILLS.find((s) => s.id === id);
  if (!s) return 'Doutrina desconhecida.';
  if (p.unlockedSkills.includes(id)) return 'Doutrina já desbloqueada.';
  if (p.militaryXP < (g ? technologyCost(g, s.tier, s.cost) : s.cost))
    return 'Experiência militar insuficiente.';
  if (s.tier > 1 && !p.unlockedSkills.includes(`${s.branch}_T1` as SkillId))
    return 'Desbloqueie o primeiro nível.';
  if (s.tier === 2 && p.unlockedSkills.some((i) => i.startsWith(`${s.branch}_T2`)))
    return 'Escolhas A/B são exclusivas.';
  if (s.tier === 3 && !p.unlockedSkills.some((i) => i.startsWith(`${s.branch}_T2`)))
    return 'Escolha uma especialização de nível 2.';
  return null;
}
export function movementAllowance(g: Pick<GameState, 'players'>, a: Battalion) {
  if (a.isFleet) return hasSkill(g, a.ownerId, 'NAV_T3') ? 2 : 1;
  const pure = a.cavalry > 0 && a.infantry === 0 && a.artillery === 0;
  const base = pure && g.players.find((p) => p.id === a.ownerId)?.nationId === 'turan' ? 2 : 1;
  return (
    base +
    (hasSkill(g, a.ownerId, 'CAV_T3') &&
    a.cavalry >= Math.ceil((a.infantry + a.cavalry + a.artillery) / 2) &&
    a.cavalry > 0
      ? 1
      : 0)
  );
}
