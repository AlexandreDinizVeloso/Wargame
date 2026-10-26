import { buildingLevel } from '../shared/development';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, GraduationCap, Sparkles, X } from 'lucide-react';
import type { GameView } from '../shared/types';
import { controller } from '../shared/rules';

interface Progress {
  building?: { provinceId: string; kind: 'BARRACKS' | 'MARKET'; level: number };
  step: number;
  target: string;
  recruited: boolean;
  visited: string[];
  startedTurn: number;
}

interface StepLesson {
  title: string;
  subtitle: string;
  body: string;
  bullets: string[];
}

const STEPS: readonly StepLesson[] = [
  {
    title: 'Comando de Batalhão, Terreno & Rios',
    subtitle: 'Movimento, Fronteiras, Suprimento e Estações',
    body: 'Clique Esquerdo seleciona província ou formação; Clique Direito ordena marcha ou ataque. Selecione seu estandarte e clique com o botão direito numa terra neutra vizinha iluminada.',
    bullets: [
      'Composição: Infantaria protege canhões; Cavalaria flanqueia em planícies (+20%); Artilharia reduz níveis de Forte.',
      'Rios & Suprimento: atravessar rios aplica −15% de ataque (−25% na Primavera). Tropas além do Suprimento sofrem atrito.',
      'Estações (3 rodadas cada): 🌸 Primavera (+100% recrutas), ☀️ Verão (+1 movimento e +15% ataque), 🍂 Outono (2× comércio naval), ❄️ Inverno (20% atrito hostil e −15 moral).',
    ],
  },
  {
    title: 'Cerco, Conquista & Pacificação',
    subtitle: 'Muralhas, Ordem Pública e Eras de Campanha',
    body: 'Confirme as ordens no botão Pronto para resolver o ataque e iniciar o cerco. Confirme novas rodadas até a barra de cerco terminar e o território mudar de controle.',
    bullets: [
      'Artilharia, generais Mestre de Cerco, o Verão (+1) e a Era da Hegemonia (rodada 21+, +1) aceleram a queda de fortes.',
      'Territórios conquistados precisam da ordem Pacificar ou de Templos para evitar revoltas e restaurar impostos.',
      'Guarnições sem rota de recuo ou com força 3× menor sofrem Aniquilação Total (Stackwipe).',
    ],
  },
  {
    title: 'Economia, 6 Obras & Especialização',
    subtitle: 'Desenvolvimento Urbano e Bônus Continentais',
    body: 'Clique com o botão esquerdo em uma cidade sua. Todas as 6 construções custam apenas Ouro (Mercado, Quartel, Forte e Porto custam 20 Ouro no nível 1). Construa um Quartel ou Mercado e confirme a rodada.',
    bullets: [
      '6 Edifícios: Mercado (+ouro), Quartel (+recrutas), Forte (+defesa), Porto (frotas/rotas), Fundição (artilharia) e Templo (+fé/estabilidade).',
      'Especialização: cidades evoluídas podem tornar-se Metrópole Mercantil, Cidadela Militar, Bastião, Empório Naval ou Centro Sagrado.',
      'Bônus de Continente: controlar um continente inteiro rende bônus por rodada (Am. Sul +3🪙, Am. Norte +5🪙, África/MENA +6🪙, Europa +7🪙/+1👑, Ásia +10🪙/+2👑).',
    ],
  },
  {
    title: 'Recrutamento em Massa, Líderes & Comando Supremo',
    subtitle: 'Ações Rápidas (⚡), Generais e Autoridade (👑)',
    body: 'Na aba Recrutamento & Guarnição (ou em ⚡ Ações Rápidas no topo), prepare novas tropas. Depois, selecione seu estandarte, abra a aba Líder e atribua um General disponível.',
    bullets: [
      '⚡ Ações Rápidas: o Recrutamento em Massa distribui automaticamente pedidos de Infantaria, Cavalaria e Artilharia pelas suas cidades.',
      'Autoridade (👑): moeda unificada (Influência + Prestígio + XP Militar) usada em Doutrinas, Diplomacia e nos 5 Atos do Comando Supremo.',
      '5 Comandos Supremos: ⚡ Marcha Forçada (35👑), 🪙 Títulos de Guerra (30👑, +120 ouro), 🛡️ Guarda Imperial (50👑), 💣 Rompe-Muralhas (45👑) e 🔥 Sabotagem (40👑).',
    ],
  },
  {
    title: 'Diplomacia, Mares, Conselho & Vitória',
    subtitle: 'Tratados de Paz, Lentes (F1–F5), Dilemas e Objetivos',
    body: 'Visite Diplomacia, Comércio & Mares e Objetivos na barra superior. Frotas disputam nós comerciais e transportam tropas (ou use Fretamento Automático); vença com 75% do mapa ou sua Carta Secreta.',
    bullets: [
      'Dilemas do Conselho: decisões periódicas de Crise, Tática e Política que aplicam modificadores temporários à sua nação.',
      'Tratados de Paz (War Score até 100): Ceder Províncias (20 pts), Reparações de 25% por 5 rodadas (25 pts), Humilhação (30 pts) ou Vassalagem (75 pts).',
      'Lentes F1–F5 & Névoa: alterne entre F1 Político, F2 Econômico, F3 Logística, F4 Diplomático e F5 Revolta/Religião. A visão alcança 1 salto de suas terras, tropas e aliados.',
    ],
  },
] as const;

const EXTRA_GUIDES = [
  {
    id: 'supreme',
    title: '👑 Autoridade & 5 Comandos Supremos',
    items: [
      '⚡ Marcha Forçada (35 👑): +25 moral, remove desorganização, +1 movimento e ignora penalidades de rio e terreno.',
      '🪙 Títulos de Guerra (30 👑): adiciona +120 Ouro imediatamente ao tesouro nacional (repetível).',
      '🛡️ Guarda Imperial (50 👑): cria batalhão de elite (4 Infantaria, 2 Cavalaria, moral 100%, treino 1,3×) sem gastar Recrutas.',
      '💣 Rompe-Muralhas (45 👑): destrói 1 nível de forte e ocupa imediatamente província inimiga vizinha sem guarnição.',
      '🔥 Sabotagem de Suprimento (40 👑): −40 moral em batalhão inimigo e zera seu suprimento na rodada.',
    ],
  },
  {
    id: 'seasons',
    title: '🌦️ Estações (3 Rodadas) & Eras',
    items: [
      '🌸 Primavera: +100% geração de Recrutas; cheias causam −25% de ataque ao atravessar rios.',
      '☀️ Verão: +1 movimento terrestre, +15% poder de ataque terrestre e +1 progresso de cerco.',
      '🍂 Outono: +100% receita de nós comerciais marítimos e −25% no custo de Mercado e Porto.',
      '❄️ Inverno: 20% atrito em território hostil/cerco, −15 moral e +50% manutenção em campanha.',
      '⏳ Eras: Consolidação (R1–8), Impérios (R9–20, −10% custo de doutrinas) e Hegemonia (R21+, +1 progresso de cerco).',
    ],
  },
  {
    id: 'continents',
    title: '🌍 Bônus Continentais, Lentes & Conselho',
    items: [
      'América do Sul (4 terras): +3 Ouro, +0,5 Recrutas/rodada. América do Norte (7 terras): +5 Ouro, +1 Recruta/rodada.',
      'MENA & África (9 terras): +6 Ouro, +1 Recruta/rodada. Europa (9 terras): +7 Ouro, +1,5 Recrutas, +1 Autoridade/rodada.',
      'Ásia (13 terras): +10 Ouro, +2 Recrutas, +2 Autoridade/rodada.',
      'Conselho & Passivas: cada uma das 8 facções possui bônus únicos (Véspera, Aurélia, Kaldor, Turan, Ferro-Norte, Sapiência, Sol Invicto, Verídia).',
    ],
  },
] as const;

function readProgress(key: string, turn: number): Progress {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (
      v &&
      Number.isInteger(v.step) &&
      v.step >= 0 &&
      v.step < 5 &&
      typeof v.target === 'string' &&
      Array.isArray(v.visited)
    )
      return { ...v, startedTurn: typeof v.startedTurn === 'number' ? v.startedTurn : turn };
  } catch {}
  return { step: 0, target: '', recruited: false, visited: [], startedTurn: turn };
}

export default function TutorialOverlay({
  game,
  playerId,
  selectedArmyId,
  selectedProvinceId,
  activePanel,
  onClose,
  onComplete,
}: {
  game: GameView;
  playerId: string;
  selectedArmyId: string;
  selectedProvinceId: string;
  activePanel: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const key = `concordia-tutorial-${game.code}`,
    [progress, setProgress] = useState(() => readProgress(key, game.turn)),
    [guideTab, setGuideTab] = useState<string | null>(null),
    [spot, setSpot] = useState<{ x: number; y: number; width: number; height: number } | null>(
      null,
    );
  const ownArmy = game.battalions.find((a) => a.ownerId === playerId && !a.isFleet),
    selectedArmy = game.battalions.find((a) => a.id === selectedArmyId),
    city = game.provinces.find((p) => p.id === selectedProvinceId),
    ready = game.players.find((p) => p.id === playerId)?.ready;
  const neutralMarch = game.plannedOrders.find(
    (o) => o.type === 'MOVE_BATTALION' && !!(o.path?.length || o.targetProvinceId),
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(progress));
    } catch {}
  }, [key, progress]);

  useEffect(() => {
    if (progress.step === 0 && neutralMarch?.type === 'MOVE_BATTALION') {
      const destination = neutralMarch.path?.at(-1) ?? neutralMarch.targetProvinceId,
        target = game.provinces.find((p) => p.id === destination);
      if (target && !target.ownerId && !target.occupierId)
        setProgress((p) => ({ ...p, step: 1, target: target.id }));
    }
    if (
      progress.step === 1 &&
      progress.target &&
      game.history.some(
        (h) =>
          h.turn >= progress.startedTurn &&
          h.sieges.some(
            (s) =>
              s.completed && s.attackerOwnerId === playerId && s.provinceId === progress.target,
          ),
      )
    )
      setProgress((p) => ({ ...p, step: 2 }));
    if (progress.step === 2) {
      const order = game.plannedOrders.find(
        (o) =>
          o.type === 'BUILD_BUILDING' && (o.building === 'BARRACKS' || o.building === 'MARKET'),
      );
      if (
        order?.type === 'BUILD_BUILDING' &&
        (order.building === 'BARRACKS' || order.building === 'MARKET') &&
        !progress.building
      ) {
        const city = game.provinces.find((p) => p.id === order.provinceId);
        if (city)
          setProgress((p) => ({
            ...p,
            building: {
              provinceId: city.id,
              kind: order.building as 'BARRACKS' | 'MARKET',
              level: buildingLevel(city, order.building) + 1,
            },
          }));
      }
      const city = game.provinces.find((p) => p.id === progress.building?.provinceId);
      if (
        city &&
        progress.building &&
        buildingLevel(city, progress.building.kind) >= progress.building.level
      )
        setProgress((p) => ({ ...p, step: 3 }));
    }
    if (progress.step === 3) {
      const recruited =
        progress.recruited || game.plannedOrders.some((o) => o.type === 'RECRUIT_BATTALION');
      const assigned = game.commanders.some(
        (c) => c.ownerId === playerId && !c.isAdmiral && !!c.assignedBattalionId,
      );
      if (recruited && assigned) setProgress((p) => ({ ...p, step: 4, recruited: true }));
      else if (recruited && !progress.recruited) setProgress((p) => ({ ...p, recruited: true }));
    }
    if (
      progress.step === 4 &&
      ['diplomacy', 'maritime', 'secret'].includes(activePanel) &&
      !progress.visited.includes(activePanel)
    )
      setProgress((p) => ({ ...p, visited: [...p.visited, activePanel] }));
  }, [game, playerId, progress, activePanel, neutralMarch]);

  const selector = useMemo(() => {
    if (progress.step === 0) {
      if (selectedArmy?.ownerId === playerId) {
        const location = game.provinces.find((p) => p.id === selectedArmy.provinceId);
        const target = game.provinces.find(
          (p) =>
            p.kind === 'LAND' && !p.ownerId && !p.occupierId && location?.neighbors.includes(p.id),
        );
        if (target) return `.province-shape[data-province="${target.id}"]`;
      }
      return ownArmy ? `[data-battalion="${ownArmy.id}"]` : '.unified-navigation';
    }
    if (progress.step === 1) return '.ready-button';
    if (progress.step === 2 && progress.building) return '.ready-button';
    if (progress.step === 2)
      return city && controller(city) === playerId
        ? '[data-window="province"]'
        : `.province-shape[data-province="${game.provinces.find((p) => p.capitalOf === playerId)?.id ?? ownArmy?.provinceId ?? 'castile'}"]`;
    if (progress.step === 3)
      return progress.recruited ? '[data-window="battalion"]' : '[data-window="province"]';
    return '.unified-navigation';
  }, [game, playerId, progress, selectedArmy, city, ownArmy]);

  useEffect(() => {
    const measure = () => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      const next =
        r && r.width > 0
          ? { x: r.x - 5, y: r.y - 5, width: r.width + 10, height: r.height + 10 }
          : null;
      setSpot((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    measure();
    const timer = setInterval(measure, 180);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [selector]);

  const complete =
    progress.visited.includes('diplomacy') &&
    progress.visited.includes('maritime') &&
    progress.visited.includes('secret');
  const lesson = STEPS[progress.step] ?? STEPS[0];
  const activeGuide = EXTRA_GUIDES.find((g) => g.id === guideTab);

  return (
    <div className="tutorial-overlay" data-tutorial-step={progress.step + 1}>
      {spot && (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{ left: spot.x, top: spot.y, width: spot.width, height: spot.height }}
        />
      )}
      <aside
        className="tutorial-card"
        aria-label="Tutorial Rápido (5 Passos)"
        aria-live="polite"
        data-tutorial-card
      >
        <header>
          <span>
            <GraduationCap size={18} /> ACADEMIA DE CONCÓRDIA
          </span>
          <button aria-label="Fechar tutorial" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <ol aria-label="Progresso do tutorial">
          {STEPS.map((t, i) => (
            <li
              key={t.title}
              className={i === progress.step ? 'current' : i < progress.step ? 'complete' : ''}
              aria-current={i === progress.step ? 'step' : undefined}
              onClick={() => {
                setGuideTab(null);
                setProgress((p) => ({ ...p, step: i }));
              }}
              style={{ cursor: 'pointer' }}
              title={`${i + 1}. ${t.title}`}
            >
              {i + 1}
            </li>
          ))}
        </ol>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: '2px',
          }}
        >
          <button
            type="button"
            className="text-button"
            onClick={() => setGuideTab(null)}
            style={{
              fontSize: '0.7rem',
              padding: '3px 7px',
              background: !guideTab ? 'rgba(214, 173, 96, 0.22)' : undefined,
              borderColor: !guideTab ? 'rgba(214, 173, 96, 0.6)' : undefined,
            }}
          >
            <Sparkles size={11} /> Passo {progress.step + 1}/5
          </button>
          {EXTRA_GUIDES.map((g) => (
            <button
              key={g.id}
              type="button"
              className="text-button"
              onClick={() => setGuideTab((curr) => (curr === g.id ? null : g.id))}
              style={{
                fontSize: '0.7rem',
                padding: '3px 7px',
                background: guideTab === g.id ? 'rgba(214, 173, 96, 0.22)' : undefined,
                borderColor: guideTab === g.id ? 'rgba(214, 173, 96, 0.6)' : undefined,
              }}
            >
              <BookOpen size={11} /> {g.title.split(' ')[1]}
            </button>
          ))}
        </div>

        {activeGuide ? (
          <div style={{ display: 'grid', gap: '6px' }}>
            <h3 style={{ fontSize: '0.95rem' }}>{activeGuide.title}</h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: '16px',
                display: 'grid',
                gap: '5px',
                fontSize: '0.78rem',
                color: '#dfd5be',
                lineHeight: 1.38,
              }}
            >
              {activeGuide.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <h3>
              {progress.step + 1}. {lesson.title}
            </h3>
            <p>{lesson.body}</p>
            <ul
              style={{
                margin: '2px 0',
                paddingLeft: '16px',
                display: 'grid',
                gap: '4px',
                fontSize: '0.77rem',
                color: '#d8ceb6',
                lineHeight: 1.35,
              }}
            >
              {lesson.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </>
        )}

        {progress.step === 1 && (
          <small>
            {ready
              ? 'Ordens confirmadas; aguardando a resolução.'
              : `Cerco: ${game.provinces.find((p) => p.id === progress.target)?.siege?.progress ?? 0}/${game.provinces.find((p) => p.id === progress.target)?.siege?.required ?? '—'}. O avanço é automático ao conquistar.`}
          </small>
        )}
        {progress.step === 4 && (
          <small>
            Consultas visitadas:{' '}
            {progress.visited.filter((p) => ['diplomacy', 'maritime', 'secret'].includes(p)).length}
            /3. Use Esc para voltar ao mapa.
          </small>
        )}

        <footer>
          <button
            className="text-button"
            onClick={() => {
              setGuideTab(null);
              setProgress((p) => ({ ...p, step: Math.max(0, p.step - 1) }));
            }}
            disabled={progress.step === 0}
          >
            <ChevronLeft size={13} /> Rever passo
          </button>
          {progress.step === 4 ? (
            <button
              className="primary"
              disabled={!complete}
              onClick={() => {
                try {
                  sessionStorage.removeItem(key);
                  sessionStorage.setItem(`${key}-complete`, 'true');
                } catch {}
                onComplete();
              }}
            >
              Concluir tutorial
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Aguarda sua ação no tabuleiro</span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setGuideTab(null);
                  setProgress((p) => ({ ...p, step: Math.min(4, p.step + 1) }));
                }}
                title="Avançar para o próximo passo"
              >
                Avançar <ChevronRight size={13} />
              </button>
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}
