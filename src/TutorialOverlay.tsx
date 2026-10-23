import { buildingLevel } from '../shared/development';
import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
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
const TEXT = [
  [
    'Comando de Batalhão',
    'Clique Esquerdo: Selecionar | Clique Direito: Mover / Atacar. Selecione o estandarte e clique com o botão direito numa terra neutra vizinha iluminada. A seta no mapa mostra a marcha preparada.',
  ],
  [
    'Cerco e Conquista',
    'Confirme as ordens para resolver o ataque e iniciar o cerco. Confirme novas rodadas até a barra de cerco terminar e o território mudar de controle.',
  ],
  [
    'Economia e Quartéis',
    'Clique com o botão esquerdo em uma cidade sua em Cidade & Economia. Construa um Quartel ou Mercado e confirme a rodada para concluir a obra.',
  ],
  [
    'Recrutamento e Líderes',
    'Na aba Recrutamento & Guarnição, prepare novas tropas. Selecione seu estandarte, abra Líder e atribua um General disponível.',
  ],
  [
    'Diplomacia, Mares e Vitória',
    'Visite Diplomacia, Comércio & Mares e Objetivos na barra superior. Estreitos e portos abrem rotas; alianças e guerras ajudam a alcançar 75% do mapa ou sua carta.',
  ],
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
  }, [game, playerId, progress, activePanel]);
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
          {TEXT.map((t, i) => (
            <li
              key={t[0]}
              className={i === progress.step ? 'current' : i < progress.step ? 'complete' : ''}
              aria-current={i === progress.step ? 'step' : undefined}
            >
              {i + 1}
            </li>
          ))}
        </ol>
        <h3>
          {progress.step + 1}. {TEXT[progress.step][0]}
        </h3>
        <p>{TEXT[progress.step][1]}</p>
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
            onClick={() => setProgress((p) => ({ ...p, step: Math.max(0, p.step - 1) }))}
            disabled={progress.step === 0}
          >
            Rever passo
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
            <span>Aguarda sua ação no tabuleiro</span>
          )}
        </footer>
      </aside>
    </div>
  );
}
