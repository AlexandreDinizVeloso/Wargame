import { getNationAuthority } from './economy';
import { councilModifierLabels, type CouncilModifiers } from './councilEffects';
import type { GameState, Player } from './types';

/** Legacy saves can retain this expired bonus; new councils use councilEffects. */
export const DILEMMA_ATTACK_BONUS = 0.2;
export type CouncilCategory = 'CRISIS' | 'TACTICAL' | 'POLICY';
export const COUNCIL_CATEGORIES: Record<CouncilCategory, string> = {
  CRISIS: 'Crise contextual',
  TACTICAL: 'Carta tática',
  POLICY: 'Política nacional',
};
export interface DilemmaOption {
  label: string;
  text: string;
  effect: string;
  gold: number;
  manpower: number;
  authority: number;
  duration: number;
  modifiers: Partial<CouncilModifiers>;
  local?: boolean;
  moraleChange?: number;
  navalOnly?: boolean;
  unrestChange?: number;
  pacificationChange?: number;
  infantry?: number;
}
export interface NationalDilemma {
  id: string;
  name: string;
  description: string;
  category: CouncilCategory;
  options: readonly [DilemmaOption, DilemmaOption];
}
export interface ActiveDilemma {
  id: string;
  turn: number;
  targetProvinceId?: string;
  context?: string;
}
const option = (
  value: Pick<DilemmaOption, 'label' | 'text' | 'effect'> & Partial<DilemmaOption>,
): DilemmaOption => ({
  gold: 0,
  manpower: 0,
  authority: 0,
  duration: 3,
  modifiers: {},
  ...value,
});
export const DILEMMAS: readonly NationalDilemma[] = [
  {
    id: 'guilds',
    name: 'Ultimato das Guildas',
    category: 'CRISIS',
    description:
      'Os mercadores oferecem liquidez imediata em troca de controle sobre as receitas futuras.',
    options: [
      option({
        label: 'A · Vender o monopólio',
        text: 'Receba dinheiro agora e entregue parte da arrecadação por três rodadas.',
        effect: 'TRADE_MONOPOLY',
        gold: 24,
        modifiers: { incomeMultiplier: 0.9, goldPerTurn: -9 },
      }),
      option({
        label: 'B · Comprar autonomia',
        text: 'Financie oficinas independentes para ampliar a receita futura.',
        effect: 'GUILD_REFORM',
        gold: -18,
        authority: -8,
        modifiers: { incomeMultiplier: 1.25 },
      }),
    ],
  },
  {
    id: 'barons',
    name: 'Barões da Fronteira',
    category: 'CRISIS',
    description:
      'A fronteira exige uma escolha entre concessões locais e mobilização das milícias.',
    options: [
      option({
        label: 'A · Negociar privilégios',
        text: 'Pacifique a região, mas dispense parte das obrigações de recrutamento.',
        effect: 'BARON_CONCESSIONS',
        unrestChange: -18,
        pacificationChange: 15,
        modifiers: { manpowerGain: -1, defenseMultiplier: 0.95 },
      }),
      option({
        label: 'B · Incorporar as milícias',
        text: 'Converta três recrutas em uma companhia imediata e imponha a autoridade da Coroa.',
        effect: 'FRONTIER_MILITIA',
        authority: -14,
        manpower: -3,
        infantry: 3,
        unrestChange: 15,
        modifiers: { defenseMultiplier: 1.15 },
      }),
    ],
  },
  {
    id: 'harvest',
    name: 'Crise dos Celeiros',
    category: 'CRISIS',
    description:
      'Os intendentes alertam que abastecer as tropas está consumindo os recursos do reino.',
    options: [
      option({
        label: 'A · Racionar as fileiras',
        text: 'Reduza a manutenção com rações menores; a moral das formações cai imediatamente.',
        effect: 'ARMY_RATIONS',
        moraleChange: -12,
        modifiers: { upkeepMultiplier: 0.75 },
      }),
      option({
        label: 'B · Comprar abastecimento',
        text: 'Abra uma rota de suprimentos na região e mantenha as tropas preparadas, pagando pela logística.',
        effect: 'SUPPLY_CONTRACT',
        gold: -20,
        authority: -4,
        local: true,
        modifiers: { supplyBonus: 6, moraleRecovery: 5, upkeepMultiplier: 1.15 },
      }),
    ],
  },
  {
    id: 'pilgrims',
    name: 'Peregrinos e Conscrição',
    category: 'CRISIS',
    description:
      'As comunidades religiosas exigem proteção das famílias enquanto o exército precisa de homens.',
    options: [
      option({
        label: 'A · Proteger os peregrinos',
        text: 'Reduza a tensão local e reforce a legitimidade, suspendendo parte da conscrição.',
        effect: 'RELIGIOUS_EXEMPTIONS',
        unrestChange: -15,
        modifiers: { authorityGain: 1, manpowerGain: -1 },
      }),
      option({
        label: 'B · Convocar voluntários',
        text: 'Pague os preparativos e comprometa a Coroa para obter recrutas e reforçar a defesa.',
        effect: 'VOLUNTEER_MUSTER',
        gold: -14,
        authority: -8,
        manpower: 3,
        unrestChange: 8,
        modifiers: { defenseMultiplier: 1.15 },
      }),
    ],
  },
  {
    id: 'mint',
    name: 'Dívida da Coroa',
    category: 'CRISIS',
    description:
      'Os credores querem receber. Adiar a dívida financia a rodada e compromete a arrecadação seguinte.',
    options: [
      option({
        label: 'A · Adiar os pagamentos',
        text: 'Receba um adiantamento que será cobrado em receita e legitimidade por quatro rodadas.',
        effect: 'CROWN_DEBT',
        gold: 20,
        duration: 4,
        modifiers: { incomeMultiplier: 0.9, authorityGain: -1, goldPerTurn: -7 },
      }),
      option({
        label: 'B · Honrar os credores',
        text: 'Use o tesouro para recuperar confiança e melhorar a receita futura.',
        effect: 'CREDIT_RESTORED',
        gold: -24,
        authority: 8,
        modifiers: { incomeMultiplier: 1.15 },
      }),
    ],
  },
  {
    id: 'military-council',
    name: 'Brado das Companhias',
    category: 'TACTICAL',
    description:
      'Os oficiais propõem uma promessa de soldos e honrarias para sustentar a moral durante a campanha.',
    options: [
      option({
        label: 'A · Manter soldos ordinários',
        text: 'Economize na manutenção e aceite a queda imediata de moral das formações.',
        effect: 'ORDINARY_PAY',
        duration: 2,
        moraleChange: -8,
        modifiers: { upkeepMultiplier: 0.85 },
      }),
      option({
        label: 'B · Prometer soldos de campanha',
        text: 'Aumente a moral efetiva de todas as formações por três rodadas; a manutenção também sobe.',
        effect: 'BATTLE_CRY',
        authority: -10,
        modifiers: { moraleBonus: 20, upkeepMultiplier: 1.35 },
      }),
    ],
  },
  {
    id: 'arsenal',
    name: 'Véspera do Assalto',
    category: 'TACTICAL',
    description:
      'Os arsenais podem sustentar uma ofensiva curta ou preservar recursos para uma campanha defensiva.',
    options: [
      option({
        label: 'A · Preparar posições',
        text: 'Troque poder ofensivo por defesa e menor manutenção durante duas rodadas.',
        effect: 'DEFENSIVE_PREPARATION',
        duration: 2,
        modifiers: { attackMultiplier: 0.9, defenseMultiplier: 1.1, upkeepMultiplier: 0.85 },
      }),
      option({
        label: 'B · Abrir reservas de pólvora',
        text: 'Gaste recursos para uma ofensiva de duas rodadas, com consumo logístico maior.',
        effect: 'POWDER_RESERVES',
        gold: -14,
        authority: -8,
        duration: 2,
        modifiers: { attackMultiplier: 1.3, upkeepMultiplier: 1.15 },
      }),
    ],
  },
  {
    id: 'corsairs',
    name: 'Oferta dos Corsários',
    category: 'TACTICAL',
    description:
      'Capitães estrangeiros oferecem uma escolha entre lucros comerciais e superioridade naval temporária.',
    options: [
      option({
        label: 'A · Desviar as escoltas',
        text: 'Favoreça as rotas comerciais e aceite uma defesa nacional mais fraca.',
        effect: 'TRADE_ESCORT_DIVERSION',
        modifiers: { incomeMultiplier: 1.25, defenseMultiplier: 0.85 },
      }),
      option({
        label: 'B · Contratar os capitães',
        text: 'Compre capacidade ofensiva naval por três rodadas e ceda uma parte da receita.',
        effect: 'PRIVATEER_COMMISSION',
        gold: -16,
        navalOnly: true,
        moraleChange: 15,
        modifiers: { navalAttackMultiplier: 1.35, incomeMultiplier: 0.9 },
      }),
    ],
  },
  {
    id: 'frontier-settlers',
    name: 'Terra ou Fileiras',
    category: 'POLICY',
    description:
      'Por três rodadas, a Coroa pode priorizar os assentamentos produtivos ou ampliar a conscrição.',
    options: [
      option({
        label: 'A · Conceder alforrias',
        text: 'Pacifique a região e aumente a receita, dispensando homens do recrutamento.',
        effect: 'SETTLER_LIBERTIES',
        pacificationChange: 15,
        modifiers: { incomeMultiplier: 1.2, manpowerGain: -1 },
      }),
      option({
        label: 'B · Decretar conscrição',
        text: 'Obtenha recrutas agora e a cada rodada, prejudicando a economia e a ordem local.',
        effect: 'FRONTIER_CONSCRIPTION',
        authority: -12,
        manpower: 4,
        unrestChange: 15,
        modifiers: { manpowerGain: 1, incomeMultiplier: 0.8 },
      }),
    ],
  },
  {
    id: 'succession',
    name: 'Pacto dos Estados',
    category: 'POLICY',
    description:
      'O equilíbrio entre autonomia provincial e comando central determinará as próximas três rodadas.',
    options: [
      option({
        label: 'A · Delegar o comando',
        text: 'Amplie a receita cedendo Autoridade e reduzindo a recuperação de moral.',
        effect: 'DECENTRALIZED_COUNCIL',
        modifiers: { incomeMultiplier: 1.15, authorityGain: -2, moraleRecovery: -5 },
      }),
      option({
        label: 'B · Centralizar a Coroa',
        text: 'Pague a reorganização para recuperar Autoridade e defender o reino, sacrificando parte da receita.',
        effect: 'CENTRALIZED_COUNCIL',
        gold: -12,
        authority: -8,
        modifiers: { authorityGain: 3, defenseMultiplier: 1.15, incomeMultiplier: 0.85 },
      }),
    ],
  },
];

type CouncilWorld = Pick<GameState, 'players' | 'provinces' | 'battalions' | 'wars'>;
function situation(world: CouncilWorld | undefined, playerId: string) {
  const player = world?.players.find((p) => p.id === playerId);
  const owned = world?.provinces.filter((p) => p.kind === 'LAND' && p.ownerId === playerId) ?? [];
  const armies = world?.battalions.filter((a) => a.ownerId === playerId) ?? [];
  const enemyIds = new Set(
    (world?.wars ?? [])
      .filter((w) => w.active)
      .flatMap((w) =>
        w.attackerIds.includes(playerId)
          ? w.defenderIds
          : w.defenderIds.includes(playerId)
            ? w.attackerIds
            : [],
      ),
  );
  const threatened = owned.filter((p) =>
    world?.battalions.some(
      (a) =>
        enemyIds.has(a.ownerId) && (a.provinceId === p.id || p.neighbors.includes(a.provinceId)),
    ),
  );
  const unrest = owned.reduce((sum, p) => sum + p.unrest, 0) / Math.max(1, owned.length);
  const morale = armies.reduce((sum, a) => sum + a.morale, 0) / Math.max(1, armies.length);
  const frontline = [...threatened].sort(
    (a, b) => b.unrest - a.unrest || a.id.localeCompare(b.id),
  )[0];
  const troubled = [...owned].sort(
    (a, b) => b.unrest - a.unrest || a.pacification - b.pacification || a.id.localeCompare(b.id),
  )[0];
  return { player, owned, armies, enemyIds, threatened, unrest, morale, frontline, troubled };
}
function weightFor(id: string, state: ReturnType<typeof situation>): number {
  const { player, owned, armies, enemyIds, threatened, unrest, morale } = state;
  // Every card keeps a positive weight: contextual relevance never eliminates another category.
  switch (id) {
    case 'guilds':
      return 2 + Math.min(6, owned.filter((p) => p.isCoastal || p.marketLevel > 0).length * 2);
    case 'barons':
      return 2 + Math.min(8, Math.floor(unrest / 10)) + Math.min(8, threatened.length * 4);
    case 'harvest':
      return 2 + (armies.length > 1 ? 4 : 0) + ((player?.manpower ?? 20) < 4 ? 3 : 0);
    case 'pilgrims':
      return 2 + Math.min(8, owned.filter((p) => p.religion !== player?.faith).length * 3);
    case 'mint':
      return 2 + ((player?.gold ?? 100) < 20 ? 8 : 0) + (enemyIds.size ? 2 : 0);
    case 'military-council':
      return 2 + (armies.length && morale < 75 ? 7 : 0) + (enemyIds.size ? 4 : 0);
    case 'arsenal':
      return 2 + (owned.some((p) => p.siege) ? 8 : 0) + (enemyIds.size ? 3 : 0);
    case 'corsairs':
      return 2 + (armies.some((a) => a.isFleet) ? 8 : 0) + (owned.some((p) => p.isCoastal) ? 2 : 0);
    case 'frontier-settlers':
      return 2 + ((player?.manpower ?? 20) < 4 ? 6 : 0) + (owned.length > 3 ? 2 : 0);
    case 'succession':
      return 2 + (!enemyIds.size ? 3 : 0) + (player && getNationAuthority(player) < 15 ? 3 : 0);
    default:
      return 2;
  }
}
export function dilemmaFor(
  seed: number,
  playerId: string,
  turn: number,
  world?: CouncilWorld,
): ActiveDilemma {
  const state = situation(world, playerId);
  const salt = [
    playerId,
    String(Math.floor(state.player?.gold ?? 0)),
    String(Math.floor(state.player?.manpower ?? 0)),
    ...state.owned.map((p) => `${p.id}:${p.unrest}:${p.pacification}:${p.religion}`).sort(),
    ...[...state.enemyIds].sort(),
  ].join('|');
  let hash = (seed ^ Math.imul(turn, 2654435761)) >>> 0;
  for (const c of salt) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const weights = DILEMMAS.map((d) =>
    d.id === state.player?.lastDilemmaId ? 1 : weightFor(d.id, state),
  );
  let draw = hash % weights.reduce((sum, w) => sum + w, 0),
    index = 0;
  while (index < weights.length - 1 && draw >= weights[index]) {
    draw -= weights[index];
    index++;
  }
  const selected = DILEMMAS[index];
  const target = state.frontline ?? state.troubled;
  const context =
    selected.id === 'mint' && (state.player?.gold ?? 100) < 20
      ? 'O tesouro baixo aumentou a chance desta crise.'
      : selected.id === 'barons' && state.threatened.length
        ? 'Forças hostis ameaçam a fronteira.'
        : selected.id === 'pilgrims' && state.owned.some((p) => p.religion !== state.player?.faith)
          ? 'Há comunidades de outra fé em seu território.'
          : selected.id === 'military-council' && state.armies.length > 0 && state.morale < 75
            ? 'A moral das suas formações está baixa.'
            : selected.id === 'corsairs' && state.armies.some((a) => a.isFleet)
              ? 'Sua presença naval atraiu a proposta dos capitães.'
              : 'Uma decisão sorteada entre crises, táticas e políticas; a situação nacional influencia as chances.';
  return { id: selected.id, turn, ...(target ? { targetProvinceId: target.id } : {}), context };
}
export const dilemmaDefinition = (active: ActiveDilemma) =>
  DILEMMAS.find((d) => d.id === active.id);
export function dilemmaConsequences(choice: DilemmaOption): string[] {
  const result: string[] = [];
  for (const [value, name] of [
    [choice.gold, 'Ouro'],
    [choice.manpower, 'Recrutas'],
    [choice.authority, 'Autoridade'],
  ] as const)
    if (value !== 0) result.push(`${value > 0 ? '+' : ''}${value} ${name} agora`);
  if (choice.infantry)
    result.push(`${choice.infantry} infantarias imediatamente (já pagas em Recrutas)`);
  if (choice.moraleChange)
    result.push(
      `${choice.moraleChange > 0 ? '+' : ''}${choice.moraleChange} moral imediata${choice.navalOnly ? ' das frotas' : ''}`,
    );
  if (choice.unrestChange)
    result.push(`${choice.unrestChange > 0 ? '+' : ''}${choice.unrestChange} revolta na região`);
  if (choice.pacificationChange)
    result.push(
      `${choice.pacificationChange > 0 ? '+' : ''}${choice.pacificationChange} pacificação na região`,
    );
  for (const label of councilModifierLabels(choice.modifiers))
    result.push(
      `${label} · ${choice.duration} rodadas${choice.local && label.includes('suprimento local') ? ' na região' : ''}`,
    );
  return result;
}
export function dilemmaBlock(
  player: Pick<Player, 'gold' | 'manpower'> &
    Partial<Pick<Player, 'influence' | 'prestige' | 'militaryXP'>>,
  choice: DilemmaOption,
  reserved: { gold?: number; manpower?: number; authority?: number } = {},
): string | null {
  if (choice.gold < 0 && player.gold - (reserved.gold ?? 0) < -choice.gold)
    return 'Ouro livre insuficiente; libere ordens reservadas.';
  if (choice.manpower < 0 && player.manpower - (reserved.manpower ?? 0) < -choice.manpower)
    return 'Recrutas livres insuficientes; libere ordens reservadas.';
  if (
    choice.authority < 0 &&
    getNationAuthority({
      influence: player.influence ?? 0,
      prestige: player.prestige ?? 0,
      militaryXP: player.militaryXP ?? 0,
    }) -
      (reserved.authority ?? 0) <
      -choice.authority
  )
    return 'Autoridade livre insuficiente; libere ordens reservadas.';
  return null;
}
