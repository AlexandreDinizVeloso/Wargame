import type { Player } from './types';
export interface DilemmaOption {
  label: string;
  text: string;
  gold: number;
  manpower: number;
  authority: number;
}
export interface NationalDilemma {
  id: string;
  name: string;
  description: string;
  options: readonly [DilemmaOption, DilemmaOption];
}
export interface ActiveDilemma {
  id: string;
  turn: number;
}
const option = (
  label: string,
  text: string,
  gold: number,
  manpower: number,
  authority: number,
): DilemmaOption => ({ label, text, gold, manpower, authority });
export const DILEMMAS: readonly NationalDilemma[] = [
  {
    id: 'guilds',
    name: 'Crise das Guildas Mercantes',
    description: 'As guildas exigem privilégios para financiar a Coroa.',
    options: [
      option(
        'A · Vender privilégios',
        'O tesouro recebe adiantamentos; a Coroa perde autonomia.',
        45,
        0,
        -20,
      ),
      option(
        'B · Reorganizar as guildas',
        'O Estado financia oficinas e recebe homens e legitimidade.',
        -30,
        12,
        15,
      ),
    ],
  },
  {
    id: 'barons',
    name: 'Revolta dos Barões da Fronteira',
    description: 'Os senhores locais oferecem prata em troca de imunidade.',
    options: [
      option('A · Conceder imunidade', 'Acordo fiscal com os barões.', 35, 0, -18),
      option(
        'B · Incorporar as milícias',
        'O tesouro sustenta uma nova guarda da fronteira.',
        -25,
        10,
        12,
      ),
    ],
  },
  {
    id: 'corsairs',
    name: 'Frota de Corsários Estrangeiros',
    description: 'Corsários propõem partilhar o saque sob nossa bandeira.',
    options: [
      option(
        'A · Emitir cartas de corso',
        'Receber o saque prejudica a credibilidade da Coroa.',
        50,
        0,
        -24,
      ),
      option(
        'B · Escoltar os mercadores',
        'Patrulhas recrutam marinheiros e fortalecem o governo.',
        -35,
        8,
        20,
      ),
    ],
  },
  {
    id: 'harvest',
    name: 'Colheita Excepcional',
    description: 'Os celeiros estão cheios: vender reservas ou sustentar novos recrutas?',
    options: [
      option(
        'A · Leiloar os celeiros',
        'Negociar a colheita enfraquece o controle estatal.',
        40,
        0,
        -15,
      ),
      option(
        'B · Alimentar a mobilização',
        'Reservas são convertidas em recrutas e apoio popular.',
        -20,
        15,
        8,
      ),
    ],
  },
  {
    id: 'military-council',
    name: 'Cisma do Conselho Militar',
    description: 'Generais disputam o futuro das forças da nação.',
    options: [
      option('A · Negociar cargos', 'A venda de comissões encerra a disputa.', 38, 0, -18),
      option('B · Criar uma academia', 'A formação comum fortalece o comando.', -35, 6, 25),
    ],
  },
  {
    id: 'pilgrims',
    name: 'Peregrinos nas Estradas',
    description: 'Uma grande peregrinação precisa de proteção e pousadas.',
    options: [
      option('A · Cobrar pedágios', 'A Coroa arrecada, mas desagrada aos peregrinos.', 32, 0, -14),
      option('B · Acolher os peregrinos', 'A hospitalidade atrai voluntários.', -22, 8, 16),
    ],
  },
  {
    id: 'mint',
    name: 'Crise da Casa da Moeda',
    description: 'A cunhagem pode ser desvalorizada para socorrer o tesouro.',
    options: [
      option('A · Desvalorizar a moeda', 'Mais ouro agora, menor confiança na Coroa.', 55, 0, -28),
      option(
        'B · Reformar a cunhagem',
        'Uma moeda confiável fortalece a administração.',
        -40,
        4,
        28,
      ),
    ],
  },
  {
    id: 'frontier-settlers',
    name: 'Colonos da Fronteira',
    description: 'Companhias privadas oferecem financiar a expansão.',
    options: [
      option('A · Conceder monopólios', 'Os contratos preenchem o tesouro.', 42, 0, -19),
      option(
        'B · Financiar assentamentos',
        'Famílias recebem terras e integram as reservas.',
        -28,
        14,
        10,
      ),
    ],
  },
  {
    id: 'arsenal',
    name: 'Incêndio no Arsenal',
    description: 'O arsenal precisa de reparos; comerciantes oferecem comprar seus terrenos.',
    options: [
      option(
        'A · Privatizar os terrenos',
        'A reconstrução é transferida aos mercadores.',
        36,
        0,
        -17,
      ),
      option(
        'B · Reconstruir o arsenal',
        'O investimento reúne artesãos e leais ao Estado.',
        -32,
        9,
        18,
      ),
    ],
  },
  {
    id: 'succession',
    name: 'Disputa pela Sucessão',
    description: 'Duas casas nobres procuram o favor do Conselho.',
    options: [
      option('A · Aceitar o dote', 'A união traz ouro e compromissos políticos.', 60, 0, -30),
      option('B · Convocar os Estados', 'Uma assembleia cara legitima a sucessão.', -38, 7, 26),
    ],
  },
];
export function dilemmaFor(seed: number, playerId: string, turn: number): ActiveDilemma {
  let hash = (seed ^ Math.imul(turn, 2654435761)) >>> 0;
  for (const c of playerId) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return { id: DILEMMAS[hash % DILEMMAS.length].id, turn };
}
export const dilemmaDefinition = (active: ActiveDilemma) =>
  DILEMMAS.find((d) => d.id === active.id);
export function dilemmaBlock(
  player: Pick<Player, 'gold' | 'manpower'>,
  choice: DilemmaOption,
): string | null {
  return player.gold + choice.gold < 0
    ? 'Ouro insuficiente.'
    : player.manpower + choice.manpower < 0
      ? 'Recrutas insuficientes.'
      : null;
}
