import CampaignPanel from './CampaignPanel';
import PlayerNameForm from './PlayerNameForm';
import SkillTreeDrawer from './SkillTreeDrawer';
import { crossingOptions } from '../shared/naval';
import { levyReason } from '../shared/emergency';
import PersonalAlerts from './Notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Castle,
  Check,
  ChevronDown,
  Coins,
  Crown,
  Download,
  Flag,
  Handshake,
  Landmark,
  Menu,
  MessageSquare,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Shield,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Battalion, GameView, MapMode, Province, TurnResolutionReport } from '../shared/types';
import { OBJECTIVES } from '../shared/types';
import {
  atWar,
  canUnitVisit,
  getRelation,
  chronicle,
  controller,
  landProvinces,
  livingPlayers,
  realmEconomy,
  RELIGIONS,
  telemetry,
  unitCount,
  unitPath,
} from '../shared/rules';
import { useGame } from './useGame';
import Atlas, { MAP_MODES, type CameraHandle } from './Atlas';
import { Entry, Lobby } from './Entry';
import ProvinceDrawer from './ProvinceDrawer';
import BattalionDrawer, { TacticalBar } from './BattalionDrawer';
import DiplomacyDrawer from './DiplomacyDrawer';
import WorldDrawer from './WorldDrawer';
import SecretDrawer from './SecretDrawer';
import WarModal from './WarModal';
import FirstReadyBanner from './FirstReadyBanner';
import { SEASONS, hegemonicThreat } from '../shared/strategy';
import TurnPanel, { type ReportTab } from './TurnPanel';
import { FloatingWindow } from './FloatingWindow';
import { audio } from './audio';
import { CoatOfArms, number, typing } from './ui';
function download(game: GameView, format: 'json' | 'txt') {
  const text = format === 'json' ? JSON.stringify(telemetry(game), null, 2) : chronicle(game),
    blob = new Blob([text], {
      type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = `concordia-${game.code}-rodada-${game.lastReport?.turn ?? 0}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Manual({
  close,
  active = true,
  onActivate,
}: {
  close: () => void;
  active?: boolean;
  onActivate?: () => void;
}) {
  return (
    <FloatingWindow
      id="manual"
      title="Manual de campanha"
      width={760}
      height={640}
      active={active}
      onActivate={onActivate}
      onClose={close}
    >
      <section className="manual-modal popup-sheet">
        <span className="eyebrow">A ARTE DE GOVERNAR</span>
        <h2>Um mundo. Dois legados.</h2>
        <div className="manual-grid">
          <section>
            <Swords size={25} />
            <h3>Dominação Total</h3>
            <p>
              Controle 75% das terras. Vassalos contribuem com metade de suas terras. Subjugar uma
              grande potência exige ocupação da capital e de 75% de seu território.
            </p>
          </section>
          <section>
            <Crown size={25} />
            <h3>Objetivos Secretos</h3>
            <p>
              Escolha uma carta secreta no primeiro turno. Cumpra todos os seus requisitos para
              vencer, mesmo sem dominar o mundo.
            </p>
          </section>
        </div>
        <h3>Cidades constroem. Batalhões se movem.</h3>
        <p>
          Clique no território para administrar a província. Clique em uma ficha para comandar a
          formação; ela pode marchar enquanto a cidade constrói. Clique direito em qualquer região
          para preparar o menor caminho legal. Uma ligação é percorrida por rodada.
        </p>
        <h3>Declare antes de invadir</h3>
        <p>
          Outro reino só pode ser atravessado com acesso militar ou guerra formal. Os aliados
          defensivos recebem chamado; recusar custa reputação. Ocupação não transfere propriedade:
          negocie cessões no tratado.
        </p>
        <h3>Componha seus exércitos</h3>
        <p>
          Infantaria protege canhões; cavalaria flanqueia em planícies e litoral. Artilharia reduz
          fortes e destrói moral, mas sofre baixas extras quando supera a infantaria. Treinamento,
          terreno, moral e suprimento decidem a batalha.
        </p>
        <h3>Domine as rotas</h3>
        <p>
          Portos constroem navios. Cada transporte leva quatro unidades; embarque em um porto e
          desembarque em uma costa alcançada pela frota. Navios de guerra bloqueiam a economia e
          enfraquecem cercos.
        </p>
        <h3>Governe o território</h3>
        <p>
          Conquistas precisam de pacificação. Exércitos desorganizados devem descansar em terra
          amiga. Mercados ampliam receitas; tropas além do suprimento sofrem atrito. Cidades
          Sagradas recolhem dízimos limitados de nações ativas da sua fé. Inquisição converte em uma
          missão e cria tensão; tolerância requer duas missões e reduz impostos em 10%.
        </p>
        <h3>O preço da guerra</h3>
        <p>
          Desgaste cresce com os combates e reduz renda e recuperação de moral. Tratados podem
          exigir terras, reparações, desarmamento, religião ou submissão. A partida segue sem limite
          de rodadas até uma vitória.
        </p>
        <h3>Seu conselho, sua mesa</h3>
        <p>
          Desanexe, arraste, redimensione ou minimize as janelas. Suas posições ficam salvas neste
          navegador. Baixe o relatório JSON ou a crônica TXT para estudar a partida.
        </p>
        <div className="keyboard-guide">
          <span>
            <kbd>1–5</kbd> mapas
          </span>
          <span>
            <kbd>Scroll</kbd> zoom
          </span>
          <span>
            <kbd>Espaço + arraste</kbd> câmera
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </div>
        <button className="primary" onClick={close}>
          Convocar o conselho <ArrowIcon />
        </button>
      </section>
    </FloatingWindow>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">→</span>;
}
type Panel = 'province' | 'battalion' | 'diplomacy' | 'world' | 'secret' | 'skills' | 'report';
export default function App() {
  const { game, playerId, status, error, setError, send, command, leave } = useGame();
  const camera = useRef<CameraHandle>(null);
  const [cartographic, setCartographic] = useState(() => {
    try {
      return localStorage.getItem('concordia-interface') !== 'classic';
    } catch {
      return true;
    }
  });
  const PanelWindow = cartographic ? CampaignPanel : FloatingWindow;
  const [focusedWindow, setFocusedWindow] = useState('');
  const openMenu = () => {
    setMenu(true);
    setFocusedWindow('council-menu');
  };
  const closeMenu = () => {
    setMenu(false);
    focusRemaining('council-menu');
  };
  const openManual = () => {
    setManual(true);
    setFocusedWindow('manual');
  };
  const closeManual = () => {
    setManual(false);
    focusRemaining('manual');
  };
  const [provinceTab, setProvinceTab] = useState<'build' | 'recruit' | 'diplomacy'>('build');
  const [panels, setPanels] = useState<Panel[]>([]),
    [provinceId, setProvince] = useState(''),
    [diplomacyTarget, setDiplomacyTarget] = useState(''),
    [warRequest, setWarRequest] = useState<{
      targetId: string;
      armyId?: string;
      provinceId?: string;
      bridgeFleetId?: string;
      autoTransport?: boolean;
    } | null>(null),
    [armyId, setArmy] = useState(''),
    [mode, setMode] = useState<MapMode>('POLITICAL'),
    [referenceId, setReference] = useState(''),
    [reportTab, setReportTab] = useState<ReportTab>('personal'),
    [manual, setManual] = useState(false),
    [menu, setMenu] = useState(false),
    [endOpen, setEndOpen] = useState(false),
    [muted, setMuted] = useState(audio.muted),
    [now, setNow] = useState(Date.now()),
    [replay, setReplay] = useState<{
      report: TurnResolutionReport;
      progress: number;
      nonce: number;
    } | null>(null);
  const firstReadySound = useRef('');
  useEffect(() => {
    const key = game?.firstReadyPlayerName ? `${game.code}:${game.turn}` : '';
    if (key && firstReadySound.current !== key) {
      firstReadySound.current = key;
      audio.play('war');
    }
  }, [game?.code, game?.turn, game?.firstReadyPlayerName]);
  const seenReport = useRef(''),
    seenWars = useRef(new Set<string>()),
    seenWinner = useRef('');
  const open = (panel: Panel) => {
    setFocusedWindow(panel);
    setPanels((v) => [
      ...v.filter(
        (p) =>
          p !== panel &&
          (!(cartographic && (panel === 'province' || panel === 'battalion')) ||
            (p !== 'province' && p !== 'battalion')),
      ),
      panel,
    ]);
  };
  const close = (panel: Panel) => {
    if (focusedWindow === panel) focusRemaining(panel);
    if (cartographic && panel === 'battalion') setArmy('');
    setPanels((v) => v.filter((p) => p !== panel));
  };
  const focusRemaining = (excluded: string) =>
    setFocusedWindow(
      [
        ...panels,
        ...(manual ? ['manual'] : []),
        ...(menu ? ['council-menu'] : []),
        ...(warRequest ? ['war'] : []),
        ...(endOpen ? ['result'] : []),
      ]
        .filter((id) => id !== excluded)
        .at(-1) ?? '',
    );
  const closeWar = () => {
    setWarRequest(null);
    focusRemaining('war');
  };
  const closeResult = () => {
    setEndOpen(false);
    focusRemaining('result');
  };
  useEffect(() => {
    if (warRequest) setFocusedWindow('war');
  }, [warRequest]);
  useEffect(() => {
    if (endOpen) setFocusedWindow('result');
  }, [endOpen]);
  const playReplay = useCallback(
    (report: TurnResolutionReport) => setReplay({ report, progress: 0, nonce: performance.now() }),
    [],
  );
  useEffect(() => {
    if (!replay) return;
    const started = performance.now();
    audio.play(replay.report.movements.length ? 'march' : 'click');
    const cannon = setTimeout(() => {
        if (replay.report.battles.length) audio.play('cannon');
      }, 1450),
      peace = setTimeout(() => {
        if (replay.report.diplomaticChanges.some((c) => c.action === 'PEACE')) audio.play('peace');
      }, 2900);
    let frame = 0;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - started) / 4000);
      if (progress === 1) {
        setReplay(null);
        return;
      }
      setReplay((r) => (r ? { ...r, progress } : null));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(cannon);
      clearTimeout(peace);
    };
  }, [replay?.nonce]);
  useEffect(() => {
    if (!game?.lastReport) return;
    const key = `${game.code}:${game.lastReport.turn}`;
    if (seenReport.current === key) return;
    seenReport.current = key;
    playReplay(game.lastReport);
  }, [game?.code, game?.lastReport?.turn, playReplay]);
  useEffect(() => {
    if (!game) return;
    for (const w of game.wars.filter((w) => w.active)) {
      const key = `${game.code}:${w.id}`;
      if (!seenWars.current.has(key)) {
        seenWars.current.add(key);
        audio.play('war');
      }
    }
    if (game.phase === 'finished' && seenWinner.current !== game.code) {
      seenWinner.current = game.code;
      setEndOpen(true);
      audio.play(game.winnerId ? 'victory' : 'peace');
    }
  }, [game?.wars.length, game?.phase, game?.code]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusedWindow === 'war' && warRequest) closeWar();
        else if (focusedWindow === 'result' && endOpen) closeResult();
        else if (focusedWindow === 'manual' && manual) closeManual();
        else if (focusedWindow === 'council-menu' && menu) closeMenu();
        else if (panels.includes(focusedWindow as Panel)) close(focusedWindow as Panel);
        else if (manual) closeManual();
        else if (menu) closeMenu();
        return;
      }
      if (typing(e.target)) return;
      const map = MAP_MODES.find((m) => m.key === e.key);
      if (map) setMode(map.id);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [manual, menu, endOpen, warRequest, panels, focusedWindow]);
  const currentCode = game?.code;
  useEffect(() => {
    setPanels([]);
    setArmy('');
    setProvince('');
    setReference('');
    setReplay(null);
  }, [currentCode]);
  const rootClick = (event: React.MouseEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) {
      audio.unlock();
      audio.play(event.target.closest('[data-sound=coins]') ? 'coins' : 'click');
    }
  };
  if (!game)
    return (
      <div className="application" onClickCapture={rootClick}>
        <Entry send={send} online={status === 'online'} onHelp={openManual} />
        {manual && (
          <Manual
            close={closeManual}
            active={focusedWindow === 'manual'}
            onActivate={() => setFocusedWindow('manual')}
          />
        )}
        <ConnectionToast error={error} status={status} dismiss={() => setError('')} />
      </div>
    );
  if (game.phase === 'lobby')
    return (
      <div className="application" onClickCapture={rootClick}>
        <Lobby game={game} playerId={playerId} command={command} leave={leave} />
        <ConnectionToast error={error} status={status} dismiss={() => setError('')} />
      </div>
    );
  const me = game.players.find((p) => p.id === playerId);
  if (!me) return null;
  const selected = game.provinces.find((p) => p.id === provinceId),
    selectedArmy = game.battalions.find((a) => a.id === armyId),
    eco = realmEconomy(game, playerId),
    alive = livingPlayers(game),
    land = landProvinces(game),
    owned = land.filter(
      (p) =>
        controller(p) === playerId ||
        game.players.find((q) => q.id === controller(p))?.subjectOfId === playerId,
    );
  const troopTotal = game.battalions
    .filter((a) => a.ownerId === playerId)
    .reduce((n, a) => n + unitCount(a), 0);
  const remaining = game.deadline ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : null;
  const ready = alive.filter((p) => p.ready || p.bot).length;
  const focus = (id: string) => {
    const p = game.provinces.find((p) => p.id === id);
    if (p) camera.current?.focus(p);
  };
  const selectArmy = (a: Battalion) => {
    setArmy(a.id);
    setProvince(a.provinceId);
    open('battalion');
  };
  const selectProvince = (p: Province) => {
    setProvinceTab('build');
    setProvince(p.id);
    open('province');
  };
  const tactical = (p: Province) => {
    if (!selectedArmy || selectedArmy.ownerId !== playerId) {
      setError('Selecione uma ficha de batalhão ou frota antes de preparar a rota.');
      return;
    }
    const host = controller(p);
    if (selectedArmy.embarkedOnId) {
      command({
        type: 'SUBMIT_ORDER',
        order: {
          type: 'EMBARK_BATTALION',
          battalionId: selectedArmy.id,
          disembarkProvinceId: p.id,
        },
      });
      return;
    }
    if (!selectedArmy.isFleet && p.kind === 'SEA_ZONE') {
      const fleet = game.battalions.find(
        (a) =>
          a.ownerId === playerId &&
          a.isFleet &&
          !a.embarkedArmyId &&
          a.provinceId === p.id &&
          a.transports * 4 >= unitCount(selectedArmy),
      );
      if (fleet) {
        command({
          type: 'SUBMIT_ORDER',
          order: { type: 'EMBARK_BATTALION', battalionId: selectedArmy.id, fleetId: fleet.id },
        });
        return;
      }
    }
    if (
      host &&
      host !== playerId &&
      !atWar(game, playerId, host) &&
      !canUnitVisit(game, selectedArmy, p)
    ) {
      setWarRequest({
        targetId: host,
        armyId: selectedArmy.id,
        provinceId: p.id,
        autoTransport:
          !game.provinces.find((q) => q.id === selectedArmy.provinceId)?.neighbors.includes(p.id) &&
          crossingOptions(game, selectedArmy, p, game.plannedOrders, true).length > 0,
      });
      return;
    }
    const from = game.provinces.find((q) => q.id === selectedArmy.provinceId)!;
    if (
      !from.neighbors.includes(p.id) &&
      crossingOptions(game, selectedArmy, p, game.plannedOrders).length
    ) {
      command({
        type: 'SUBMIT_ORDER',
        order: { type: 'AUTO_TRANSPORT', battalionId: selectedArmy.id, targetProvinceId: p.id },
      });
      return;
    }
    const path = unitPath(game, selectedArmy, p.id);
    if (!path || !path.length) {
      setError('Sem rota legal: confira guerra formal, acesso militar, portos e tipo de formação.');
      return;
    }
    command({
      type: 'SUBMIT_ORDER',
      order: { type: 'MOVE_BATTALION', battalionId: selectedArmy.id, path },
    });
  };
  const showReport = (tab: ReportTab) => {
    setReportTab(tab);
    open('report');
  };
  return (
    <div
      className={`game-viewport ${cartographic ? 'cartographic-interface' : 'classic-interface'}`}
      onClickCapture={rootClick}
      data-interface={cartographic ? 'cartographic' : 'classic'}
      data-audio-muted={muted}
    >
      <Atlas
        ref={camera}
        cartographic={cartographic}
        provinces={game.provinces}
        players={game.players}
        game={game}
        mode={mode}
        referenceId={referenceId || playerId}
        selectedId={provinceId}
        selectedArmyId={armyId}
        orders={game.plannedOrders}
        onSelect={selectProvince}
        onSelectArmy={selectArmy}
        onTactical={tactical}
        onCancelOrder={(id) => command({ type: 'CANCEL_ORDER', key: `army:${id}` })}
        onDeselect={() => setArmy('')}
        viewerId={playerId}
        replay={replay}
      />
      <header className="top-bar framed-panel">
        <button className="nation-heading" onClick={openMenu} title="Conselho da nação">
          <CoatOfArms nationId={me.nationId} size={32} />
          <span>
            <strong>{me.nation}</strong>
            <small>
              {me.name} · prestígio {number(me.prestige)}
            </small>
          </span>
          <ChevronDown size={12} />
        </button>
        <div className="top-resources">
          <div
            className="hud-stat"
            title={`Impostos ${number(eco.taxes, 1)}, comércio ${number(eco.trade, 1)}, dízimos ${number(eco.tithes, 1)}, nós marítimos ${number(eco.maritimeTrade, 1)} (incluídos no comércio); manutenção ${number(eco.upkeep, 1)}.`}
          >
            <Coins size={16} />
            <span>
              <strong data-testid="treasury">{number(me.gold)}</strong>
              <small>
                OURO{' '}
                <b className={eco.net >= 0 ? 'positive' : 'danger'}>
                  {eco.net >= 0 ? '+' : ''}
                  {number(eco.net, 1)}/rod.
                </b>
              </small>
            </span>
          </div>
          <div className="hud-stat">
            <Users size={16} />
            <span>
              <strong>
                {troopTotal}
                <em> / {eco.armyCap}</em>
              </strong>
              <small>FORÇAS / LIMITE DO EXÉRCITO</small>
            </span>
          </div>
          <div className="hud-stat reserves-stat">
            <Flag size={15} />
            <span>
              <strong>
                {number(me.manpower)} / {number(eco.manpowerCap, 1)}
                <em> / {number(me.influence)}</em>
              </strong>
              <small>RESERVAS / TETO · INFLUÊNCIA</small>
            </span>
          </div>
          <div className="hud-stat faith-stat" title={RELIGIONS[me.faith].tenet}>
            <Landmark size={16} />
            <span>
              <strong>{RELIGIONS[me.faith].name}</strong>
              <small>
                {me.religiousPolicy === 'TOLERANCE' ? 'ÉDITO DE TOLERÂNCIA' : 'INQUISIÇÃO'}
              </small>
            </span>
          </div>
          <div
            className="hud-stat exhaustion-stat"
            title="Desgaste reduz receita, recuperação de moral e eleva revolta."
          >
            <Swords size={15} />
            <span>
              <strong>{number(me.warExhaustion)}%</strong>
              <small>
                DESGASTE · AMEAÇA {me.aggressiveExpansion}%
                {me.nationId === 'sol_invicto' ? ` · FERVOR ${me.fervor}` : ''}
              </small>
            </span>
          </div>
        </div>
        <div className="turn-status">
          <strong>
            Rodada {String(game.turn).padStart(2, '0')} <small>∞</small>
          </strong>
          <span>
            {1550 + Math.floor((game.turn - 1) / 4)} · {SEASONS[game.season].icon}{' '}
            {SEASONS[game.season].name}
          </span>
          <small>
            {game.phase === 'finished'
              ? 'Campanha encerrada'
              : game.paused
                ? 'Campanha pausada'
                : remaining === null
                  ? 'Planejamento livre'
                  : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} para resolver`}
          </small>
        </div>
        <button
          className={`ready-button ${me.ready ? 'confirmed' : ''}`}
          disabled={game.phase !== 'planning' || status !== 'online'}
          onClick={() => command({ type: 'READY', ready: !me.ready })}
        >
          <Check size={18} />
          <span>
            {me.ready ? 'Reabrir ordens' : 'Confirmar ordens'}
            <small>
              {ready}/{alive.length} reinos prontos
            </small>
          </span>
        </button>
        <div className="top-tools">
          <button
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            title={muted ? 'Ativar som' : 'Silenciar som'}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              audio.setMuted(next);
              if (!next) audio.unlock();
            }}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button aria-label="Abrir menu" onClick={openMenu}>
            <Menu size={19} />
          </button>
        </div>
      </header>
      <div className="nation-ribbon" aria-label="Nações da campanha">
        {game.players.map((p) => {
          const r = getRelation(game, playerId, p.id);
          const status = p.subjectOfId
            ? '👑'
            : r?.atWar
              ? '⚔️'
              : r?.allied
                ? '🤝'
                : r && r.truceUntil >= game.turn
                  ? '🕊️'
                  : hegemonicThreat(game, p.id)
                    ? '🔥'
                    : '•';
          return (
            <button
              key={p.id}
              disabled={p.id === playerId}
              title={`${p.nation} · ${status}`}
              aria-label={`Diplomacia com ${p.nation}`}
              onClick={() => {
                setDiplomacyTarget(p.id);
                open('diplomacy');
              }}
            >
              <CoatOfArms nationId={p.nationId} size={25} />
              <small>{status}</small>
            </button>
          );
        })}
      </div>
      {game.sandboxContinued && (
        <div className="sandbox-banner">
          ⚔️ Dominação Livre · vitória original preservada na rodada {game.victoryRecord?.turn}
        </div>
      )}
      {game.turn <= game.graceUntilTurn && (
        <div className="grace-banner">
          🕊️ Pacto de não agressão · guerras liberadas na rodada {game.graceUntilTurn + 1}
        </div>
      )}
      <FirstReadyBanner game={game} />
      <PersonalAlerts
        game={game}
        playerId={playerId}
        command={command}
        onFocus={focus}
        compact={cartographic}
        onShowAll={() => showReport('personal')}
      />
      <nav className="hud-navigation">
        <button
          onClick={() => {
            const p = selected ?? game.provinces.find((p) => controller(p) === playerId);
            if (p) selectProvince(p);
          }}
          className={panels.includes('province') ? 'selected' : ''}
        >
          <Castle size={15} />
          Província
        </button>
        <button
          onClick={() => {
            const a = selectedArmy ?? game.battalions.find((a) => a.ownerId === playerId);
            if (a) selectArmy(a);
          }}
          className={panels.includes('battalion') ? 'selected' : ''}
        >
          <Swords size={15} />
          Batalhões
        </button>
        <button
          onClick={() => open('diplomacy')}
          className={panels.includes('diplomacy') ? 'selected' : ''}
        >
          <Handshake size={15} />
          Diplomacia
        </button>
        <button
          onClick={() => open('world')}
          className={panels.includes('world') ? 'selected' : ''}
        >
          <Crown size={15} />
          Mundo & Coalizões
        </button>
        <button onClick={() => open('skills')}>
          🎖️ Doutrinas & Árvore de Tropas · {me.militaryXP} XP
        </button>
        <button
          title={
            levyReason(game, playerId) ??
            '50 ouro, 15 estabilidade; cinco infantarias e defesa territorial.'
          }
          disabled={!!levyReason(game, playerId)}
          onClick={() => command({ type: 'EMERGENCY_LEVY' })}
        >
          🛡️ Convocar Defesa da Pátria
        </button>
        {game.enableSecretObjectives && (
          <button onClick={() => open('secret')}>🎯 Meu Objetivo Secreto</button>
        )}
        <button aria-label="Como jogar" onClick={openManual}>
          <BookOpen size={16} />
        </button>
      </nav>
      <div className="telemetry-tools">
        <button
          aria-label="Baixar Relatório (.JSON)"
          title="Baixar Relatório (.JSON)"
          onClick={() => download(game, 'json')}
        >
          <Download size={13} />
          <span>JSON</span>
        </button>
        <button
          aria-label="Baixar Crônica (.TXT)"
          title="Baixar Crônica (.TXT)"
          onClick={() => download(game, 'txt')}
        >
          <ScrollText size={13} />
          <span>TXT</span>
        </button>
      </div>
      <div className="victory-tracker">
        <button onClick={openMenu}>
          <Swords size={14} />
          <span>
            Dominação
            <strong>
              {number(
                (owned.reduce((n, p) => n + (controller(p) === playerId ? 1 : 0.5), 0) /
                  land.length) *
                  100,
              )}
              % <small>/ 75%</small>
            </strong>
          </span>
        </button>
        {game.enableSecretObjectives && (
          <button onClick={() => open('secret')}>
            🎯
            <span>
              {me.secretObjectives.find((c) => c.id === me.selectedObjectiveId)?.name ??
                'Escolha seu objetivo secreto'}
            </span>
          </button>
        )}
      </div>
      {warRequest && (
        <WarModal
          game={game}
          playerId={playerId}
          {...warRequest}
          command={command}
          close={closeWar}
          active={focusedWindow === 'war'}
          onActivate={() => setFocusedWindow('war')}
        />
      )}
      {panels.includes('skills') && (
        <PanelWindow
          id="skills"
          active={focusedWindow === 'skills'}
          onActivate={() => open('skills')}
          title="Doutrinas & Árvore de Tropas"
          width={660}
          height={650}
          anchor="right"
          onClose={() => close('skills')}
        >
          <SkillTreeDrawer game={game} playerId={playerId} command={command} />
        </PanelWindow>
      )}
      {panels.includes('secret') && (
        <PanelWindow
          id="secret"
          active={focusedWindow === 'secret'}
          onActivate={() => open('secret')}
          title="Meu Objetivo Secreto"
          icon={<Flag size={15} />}
          anchor="right"
          width={390}
          height={590}
          onClose={() => close('secret')}
        >
          <SecretDrawer game={game} playerId={playerId} command={command} />
        </PanelWindow>
      )}
      {!cartographic && selectedArmy?.ownerId === playerId && (
        <TacticalBar
          game={game}
          army={selectedArmy}
          playerId={playerId}
          command={command}
          onRecruit={() =>
            selectProvince(game.provinces.find((p) => p.id === selectedArmy.provinceId)!)
          }
          onDetails={() => open('battalion')}
          onDeselect={() => setArmy('')}
        />
      )}
      {replay && (
        <div className="replay-indicator">
          <Play size={13} />
          Resolução da rodada {replay.report.turn}
          <i style={{ width: `${replay.progress * 100}%` }} />
          <button aria-label="Encerrar animação" onClick={() => setReplay(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      {game.phase === 'finished' && !endOpen && (
        <button className="result-reopen" onClick={() => setEndOpen(true)}>
          <Crown size={16} />
          Ver resultado da campanha
        </button>
      )}
      {panels.includes('province') && selected && (
        <PanelWindow
          id="province"
          active={focusedWindow === 'province'}
          onActivate={() => open('province')}
          title="Inspeção de Província"
          icon={<Castle size={15} />}
          onClose={() => close('province')}
          width={338}
          height={610}
        >
          <ProvinceDrawer
            key={selected.id}
            game={game}
            playerId={playerId}
            province={selected}
            compact={cartographic}
            initialTab={provinceTab}
            command={command}
            onSelectArmy={selectArmy}
            onFocus={() => focus(selected.id)}
            onDiplomacy={(id) => {
              setDiplomacyTarget(id);
              open('diplomacy');
            }}
            onDeclareWar={(id) => setWarRequest({ targetId: id })}
          />
        </PanelWindow>
      )}
      {panels.includes('battalion') && selectedArmy && (
        <PanelWindow
          id="battalion"
          active={focusedWindow === 'battalion'}
          onActivate={() => open('battalion')}
          title="Comando de Batalhão"
          icon={<Swords size={15} />}
          anchor="right"
          width={340}
          height={610}
          onClose={() => close('battalion')}
        >
          {cartographic &&
            selectedArmy.ownerId === playerId &&
            game.plannedOrders.some(
              (o) =>
                'battalionId' in o &&
                o.battalionId === selectedArmy.id &&
                (o.type === 'AUTO_TRANSPORT' || o.type === 'MOVE_BATTALION'),
            ) && (
              <p className="chart-route-summary">
                {game.plannedOrders
                  .filter((o) => 'battalionId' in o && o.battalionId === selectedArmy.id)
                  .map((o) =>
                    o.type === 'AUTO_TRANSPORT'
                      ? `Destino: ${game.provinces.find((p) => p.id === o.targetProvinceId)?.name} · ${o.fleetId ? 'ponte naval grátis' : 'fretamento 15 ouro'}`
                      : o.type === 'MOVE_BATTALION'
                        ? `Marcha: ${game.provinces.find((p) => p.id === (o.path?.at(-1) ?? o.targetProvinceId))?.name}`
                        : null,
                  )}
              </p>
            )}
          {cartographic && selectedArmy.ownerId === playerId && (
            <TacticalBar
              game={game}
              army={selectedArmy}
              playerId={playerId}
              command={command}
              onRecruit={() => {
                setArmy('');
                setProvince(selectedArmy.provinceId);
                setProvinceTab('recruit');
                open('province');
              }}
              onDetails={() => focus(selectedArmy.provinceId)}
              onDeselect={() => {
                setArmy('');
                close('battalion');
              }}
            />
          )}
          {cartographic && selectedArmy.ownerId === playerId ? (
            <details className="advanced-command">
              <summary>General e ordens avançadas</summary>
              <BattalionDrawer
                key={selectedArmy.id}
                game={game}
                army={selectedArmy}
                playerId={playerId}
                command={command}
                onFocus={() => focus(selectedArmy.provinceId)}
                onSelect={(id) => {
                  const a = game.battalions.find((a) => a.id === id);
                  if (a) selectArmy(a);
                }}
              />
            </details>
          ) : (
            <BattalionDrawer
              key={selectedArmy.id}
              game={game}
              army={selectedArmy}
              playerId={playerId}
              command={command}
              onFocus={() => focus(selectedArmy.provinceId)}
              onSelect={(id) => {
                const a = game.battalions.find((a) => a.id === id);
                if (a) selectArmy(a);
              }}
            />
          )}
        </PanelWindow>
      )}
      {panels.includes('diplomacy') && (
        <PanelWindow
          id="diplomacy"
          active={focusedWindow === 'diplomacy'}
          onActivate={() => open('diplomacy')}
          title="Diplomacia & Guerras"
          icon={<Handshake size={15} />}
          anchor="right"
          width={414}
          height={620}
          onClose={() => close('diplomacy')}
        >
          <DiplomacyDrawer
            game={game}
            playerId={playerId}
            command={command}
            focusedRealmId={diplomacyTarget}
            onDeclareWar={(id) => setWarRequest({ targetId: id })}
          />
        </PanelWindow>
      )}
      {panels.includes('world') && (
        <PanelWindow
          id="world"
          active={focusedWindow === 'world'}
          onActivate={() => open('world')}
          title="Mundo & Coalizões"
          icon={<Crown size={15} />}
          anchor="right"
          width={374}
          height={620}
          onClose={() => close('world')}
        >
          <WorldDrawer game={game} playerId={playerId} command={command} />
        </PanelWindow>
      )}
      {panels.includes('report') && (
        <PanelWindow
          id="report"
          active={focusedWindow === 'report'}
          onActivate={() => open('report')}
          title="Relatório do Turno"
          icon={<ScrollText size={15} />}
          anchor="bottom"
          width={640}
          height={330}
          onClose={() => close('report')}
        >
          <TurnPanel
            game={game}
            playerId={playerId}
            command={command}
            tab={reportTab}
            setTab={setReportTab}
            onReplay={playReplay}
            onFocus={focus}
          />
        </PanelWindow>
      )}
      <footer className="hud-footer">
        <div className="footer-tabs">
          <button onClick={() => showReport('personal')}>
            🔔 Minha Nação (
            {
              game.notifications.filter(
                (n) =>
                  n.type !== 'WORLD' &&
                  n.involvesPlayerIds.includes(playerId) &&
                  !game.readNotificationIds.includes(n.id),
              ).length
            }
            )
          </button>
          <button onClick={() => showReport('orders')}>
            <ScrollText size={14} />
            Ordens <b>{game.plannedOrders.length}</b>
          </button>
          <button onClick={() => showReport('reports')}>
            <Swords size={14} />
            Relatórios <b>{game.lastReport?.battles.length ?? 0}</b>
          </button>
          <button aria-label="Conselho público" onClick={() => showReport('chat')}>
            <MessageSquare size={14} />
            Conselho <b>{game.chat.length}</b>
          </button>
          {game.lastReport && (
            <button
              className="replay-shortcut"
              aria-label="Rever Animação do Turno"
              onClick={() => playReplay(game.lastReport!)}
            >
              <Play size={14} />
            </button>
          )}
        </div>
        <span className="connection-indicator">
          <i className={status === 'online' ? 'status-dot' : 'status-dot offline'} />
          {status === 'online'
            ? game.persistenceEnabled
              ? 'Salvamento automático'
              : 'Sessão conectada'
            : 'Reconectando…'}{' '}
          <b>{game.code}</b>
        </span>
      </footer>
      <div className="map-controls framed-panel">
        <div className="map-mode-buttons">
          {MAP_MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'selected' : ''}
              aria-label={`Mapa ${m.name}`}
              aria-pressed={mode === m.id}
              title={`${m.key} · ${m.description}`}
              onClick={() => setMode(m.id)}
            >
              {m.id === 'POLITICAL' ? (
                <Flag size={16} />
              ) : m.id === 'RELIGIOUS' ? (
                <Landmark size={16} />
              ) : m.id === 'ECONOMIC_SUPPLY' ? (
                <Coins size={16} />
              ) : m.id === 'DIPLOMATIC' ? (
                <Handshake size={16} />
              ) : (
                <Shield size={16} />
              )}
              <small>{m.key}</small>
            </button>
          ))}
        </div>
        <div className="camera-controls">
          <button aria-label="Diminuir zoom" onClick={() => camera.current?.zoomOut()}>
            <Minus size={15} />
          </button>
          <button aria-label="Resetar câmera" onClick={() => camera.current?.reset()}>
            <RotateCcw size={15} />
          </button>
          <button aria-label="Aumentar zoom" onClick={() => camera.current?.zoomIn()}>
            <Plus size={15} />
          </button>
        </div>
      </div>
      {mode === 'DIPLOMATIC' && (
        <label className="reference-realm">
          Referência diplomática
          <select value={referenceId || playerId} onChange={(e) => setReference(e.target.value)}>
            {game.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nation}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="map-hint">
        {selectedArmy?.ownerId === playerId
          ? `${selectedArmy.name} · clique em um destino iluminado`
          : 'Selecione uma cidade ou uma ficha de batalhão'}
        <span>Espaço + arraste · scroll para zoom</span>
      </div>
      {menu && (
        <FloatingWindow
          id="council-menu"
          title="Conselho da nação"
          width={470}
          height={620}
          active={focusedWindow === 'council-menu'}
          onActivate={() => setFocusedWindow('council-menu')}
          onClose={closeMenu}
        >
          <section className="council-menu popup-sheet">
            <span className="eyebrow">SOB A SUA BANDEIRA</span>
            <CoatOfArms nationId={me.nationId} size={48} />
            <h2>{me.nation}</h2>
            <p>
              {RELIGIONS[me.faith].name} · estabilidade {number(me.stability)}% · prestígio{' '}
              {number(me.prestige)}
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={cartographic}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setCartographic(enabled);
                  setPanels((v) => v.slice(-1));
                  try {
                    localStorage.setItem(
                      'concordia-interface',
                      enabled ? 'cartographic' : 'classic',
                    );
                  } catch {}
                }}
              />
              Mapa cartográfico · HUD compacta
            </label>
            <PlayerNameForm name={me.name} command={command} />
            <label>
              Política religiosa
              <select
                value={me.religiousPolicy}
                disabled={game.phase !== 'planning'}
                onChange={(e) =>
                  command({
                    type: 'SET_RELIGIOUS_POLICY',
                    policy: e.target.value as 'TOLERANCE' | 'INQUISITION',
                  })
                }
              >
                <option value="TOLERANCE">Édito de Tolerância · −10% imposto</option>
                <option value="INQUISITION">Inquisição · conversão rápida e tensão</option>
              </select>
            </label>
            <p className="fine-print">{RELIGIONS[me.faith].tenet}</p>
            <div className="menu-actions">
              <button
                onClick={() => {
                  setMenu(false);
                  openManual();
                }}
              >
                <BookOpen size={15} />
                Manual de campanha
              </button>
              <button onClick={() => download(game, 'json')}>
                <Download size={15} />
                Baixar Relatório (.JSON)
              </button>
              <button onClick={() => download(game, 'txt')}>
                <ScrollText size={15} />
                Baixar Crônica (.TXT)
              </button>
              {game.phase === 'finished' && (
                <button
                  onClick={() => {
                    setMenu(false);
                    setEndOpen(true);
                  }}
                >
                  Resultado da campanha
                </button>
              )}
              <button
                onClick={() => {
                  setMenu(false);
                  setPanels([]);
                  leave();
                }}
              >
                Sair da campanha
              </button>
            </div>
          </section>
        </FloatingWindow>
      )}
      {endOpen && game.phase === 'finished' && (
        <FloatingWindow
          id="result"
          title="Resultado da campanha"
          width={600}
          height={650}
          active={focusedWindow === 'result'}
          onActivate={() => setFocusedWindow('result')}
          onClose={closeResult}
        >
          <section className="result-modal popup-sheet">
            <span className="eyebrow">A CRÔNICA FOI ESCRITA</span>
            <Crown size={50} />
            <h2>
              {game.winnerId
                ? game.players.find((p) => p.id === game.winnerId)?.nation
                : 'Nenhum império prevaleceu.'}
            </h2>
            <h3>
              {game.winnerObjective
                ? OBJECTIVES[game.winnerObjective].name
                : game.finishReason === 'legacy_finished'
                  ? `Resultado preservado da v${game.matchConfig.legacyResult?.version ?? '0.3.0'}`
                  : game.finishReason === 'realm_collapse'
                    ? 'Os reinos se dissolveram'
                    : 'Limite de rodadas alcançado'}
            </h3>
            {game.winnerObjective === 'SECRET_OBJECTIVE' && (
              <section className="secret-card">
                <h3>
                  🎯 Carta revelada:{' '}
                  {
                    game.players
                      .find((p) => p.id === game.winnerId)
                      ?.secretObjectives.find(
                        (c) =>
                          c.id ===
                          game.players.find((p) => p.id === game.winnerId)?.selectedObjectiveId,
                      )?.name
                  }
                </h3>
                {game.players
                  .find((p) => p.id === game.winnerId)
                  ?.secretObjectives.find(
                    (c) =>
                      c.id ===
                      game.players.find((p) => p.id === game.winnerId)?.selectedObjectiveId,
                  )
                  ?.requirements.map((r) => (
                    <p key={r.key}>
                      ✓ {r.label}: {r.target}
                    </p>
                  ))}
              </section>
            )}
            <p>
              {game.winnerObjective
                ? OBJECTIVES[game.winnerObjective].description
                : 'As duas condições permaneceram em disputa. A crônica preserva os resultados desta campanha.'}
            </p>
            <div className="result-stats">
              <span>
                {game.history.length}
                <small>rodadas</small>
              </span>
              <span>
                {game.history.reduce((n, h) => n + h.battles.length, 0)}
                <small>batalhas</small>
              </span>
              <span>
                {game.wars.length}
                <small>guerras</small>
              </span>
            </div>
            <button className="primary" onClick={() => download(game, 'json')}>
              <Download size={16} />
              Baixar Relatório (.JSON)
            </button>
            <button onClick={() => download(game, 'txt')}>
              <ScrollText size={16} />
              Baixar Crônica (.TXT)
            </button>
            <button
              className="primary"
              onClick={() => {
                download(game, 'json');
                closeResult();
              }}
            >
              🏆 Encerrar Campanha e Baixar Relatório
            </button>
            {game.finishReason === 'victory' && (
              <button
                disabled={game.hostId !== playerId}
                title={game.hostId !== playerId ? 'O anfitrião decide pela sala.' : ''}
                onClick={() => {
                  command({ type: 'CONTINUE_SANDBOX' });
                  closeResult();
                }}
              >
                ⚔️ Continuar Jogando (Modo Dominação Livre)
              </button>
            )}
            <button className="text-button" onClick={closeResult}>
              Explorar o mapa final
            </button>
          </section>
        </FloatingWindow>
      )}
      {manual && (
        <Manual
          close={closeManual}
          active={focusedWindow === 'manual'}
          onActivate={() => setFocusedWindow('manual')}
        />
      )}
      <ConnectionToast error={error} status={status} dismiss={() => setError('')} />
    </div>
  );
}
function ConnectionToast({
  error,
  status,
  dismiss,
}: {
  error: string;
  status: string;
  dismiss: () => void;
}) {
  return error ? (
    <div className="toast" role="alert">
      <span>{error}</span>
      <button aria-label="Fechar aviso" onClick={dismiss}>
        <X size={16} />
      </button>
    </div>
  ) : status === 'offline' ? (
    <div className="toast" role="status">
      Conexão perdida. Tentando recuperar a sessão…
    </div>
  ) : null;
}
