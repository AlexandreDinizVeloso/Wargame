import TurnResolutionSequencer, { CINEMATIC_DURATION } from './TurnResolutionSequencer';
import TacticalBattleModal from './TacticalBattleModal';
import { getNationAuthority } from '../shared/economy';
import { verticalRules } from '../shared/fogOfWar';
import { useStrategistProfile } from './useStrategistProfile';
const StrategistProfileModal = lazy(() => import('./StrategistProfileModal'));
import CampaignSaveControls from './CampaignSaveControls';
import MapLensSelector from './MapLensSelector';
import OutlinerDock from './OutlinerDock';
import { ERAS, campaignEra } from '../shared/world';
import { goldRules, FACTION_TRAITS } from '../shared/factions';
const PostGameAnalytics = lazy(() => import('./PostGameAnalytics'));
import TutorialOverlay from './TutorialOverlay';
import { TopBarModal } from './TopBarModal';
import { MaritimeOverview } from './MaritimePanel';
const CommanderPanel = lazy(() => import('./CommanderPanel'));
import { AudioControls } from './AudioControls';
import CampaignPanel from './CampaignPanel';
import PlayerNameForm from './PlayerNameForm';
const SkillTreeDrawer = lazy(() => import('./SkillTreeDrawer'));
import { crossingOptions } from '../shared/naval';
import PersonalAlerts from './Notifications';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  BookOpen,
  Castle,
  Check,
  ChevronDown,
  Coins,
  Crown,
  Download,
  Flag,
  Handshake,
  Menu,
  MessageSquare,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Swords,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { Battalion, GameView, MapMode, Province, TurnResolutionReport } from '../shared/types';
import { OBJECTIVES } from '../shared/types';
import {
  nationOf,
  atWar,
  canUnitVisit,
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
const DiplomacyDrawer = lazy(() => import('./DiplomacyDrawer'));
const WorldDrawer = lazy(() => import('./WorldDrawer'));
const SecretDrawer = lazy(() => import('./SecretDrawer'));
import WarModal from './WarModal';
import FirstReadyBanner from './FirstReadyBanner';
import { SEASONS } from '../shared/strategy';
import type { ReportTab } from './TurnPanel';
const TurnPanel = lazy(() => import('./TurnPanel'));
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
function Manual({ close }: { close: () => void; active?: boolean; onActivate?: () => void }) {
  return (
    <TopBarModal id="manual" title="Manual de campanha" onClose={close}>
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
          formação; ela pode marchar enquanto a cidade constrói. Clique Esquerdo: Selecionar |
          Clique Direito: Mover / Atacar. Clique direito em qualquer região para preparar o menor
          caminho legal. Uma ligação é percorrida por rodada.
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
          O dock reúne as ações da cidade ou formação selecionada; os botões do conselho abrem uma
          consulta por vez. Arraste o título para mover e as bordas para redimensionar. Use Esc para
          fechar. Estatísticas mostra gráficos da campanha; o Conselho da nação permite baixar JSON
          e TXT.
        </p>
        <div className="keyboard-guide">
          <span>
            <kbd>F1–F5</kbd> lentes
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
    </TopBarModal>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">→</span>;
}
type Panel =
  | 'province'
  | 'battalion'
  | 'diplomacy'
  | 'world'
  | 'secret'
  | 'skills'
  | 'report'
  | 'maritime'
  | 'analytics';
const STRATEGY_TITLES: Partial<Record<Panel, string>> = {
  diplomacy: '👑 Diplomacia & Tratados',
  skills: '🎖️ Árvore Militar',
  maritime: '⚓ Comércio & Mares',
  world: '🌍 Crises & Coalizões',
  secret: '🎯 Objetivos',
  analytics: '📊 Estatísticas da campanha',
};
const REPORT_TITLES: Record<ReportTab, string> = {
  world: '🗺️ Crônica',
  personal: '🔔 Minha Nação',
  orders: '📜 Ordens',
  reports: '⚔️ Relatórios',
  chat: '💬 Conselho',
};
const GLOBAL_PANELS: Panel[] = ['diplomacy', 'skills', 'maritime', 'world', 'secret', 'analytics'];
export default function App() {
  const { game, playerId, status, error, setError, send, command, leave, pings, seatInvites } =
    useGame();
  const { profile, setProfile, toast: achievementToast } = useStrategistProfile(game, playerId);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileModal = profileOpen && (
    <Suspense fallback={<p role="status">Abrindo perfil…</p>}>
      <StrategistProfileModal
        profile={profile}
        onChange={setProfile}
        onClose={() => setProfileOpen(false)}
      />
    </Suspense>
  );
  const camera = useRef<CameraHandle>(null);
  const [cartographic, setCartographic] = useState(() => {
    try {
      return localStorage.getItem('concordia-interface') !== 'classic';
    } catch {
      return true;
    }
  });
  const PanelWindow = CampaignPanel;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [turnAnnouncement, setTurnAnnouncement] = useState<{
    turn: number;
    season: string;
    summary: string;
  } | null>(null);
  const announcedTurn = useRef('');
  const tutorialRoom = useRef('');
  const [focusedWindow, setFocusedWindow] = useState('');
  const openMenu = () => {
    setProfileOpen(false);
    setPanels([]);
    setManual(false);
    setWarRequest(null);
    setEndOpen(false);
    setMenu(true);
    setFocusedWindow('council-menu');
  };
  const inviteShown = useRef('');
  useEffect(() => {
    if (
      game &&
      seatInvites.length &&
      seatInvites[0].code === game.code &&
      inviteShown.current !== game.code
    ) {
      inviteShown.current = game.code;
      openMenu();
    }
  }, [game?.code, seatInvites]);
  const closeMenu = () => {
    setMenu(false);
    focusRemaining('council-menu');
  };
  const openManual = () => {
    setProfileOpen(false);
    setPanels([]);
    setMenu(false);
    setWarRequest(null);
    setEndOpen(false);
    setManual(true);
    setFocusedWindow('manual');
  };
  const closeManual = () => {
    setManual(false);
    focusRemaining('manual');
  };
  const [unitTab, setUnitTab] = useState<'command' | 'leaders' | 'details'>('command');
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
    [fogEnabled, setFogEnabled] = useState(true),
    [tacticalBattle, setTacticalBattle] = useState<import('../shared/types').BattleReport | null>(
      null,
    ),
    [muted, setMuted] = useState(audio.muted),
    [now, setNow] = useState(Date.now()),
    [replay, setReplay] = useState<{
      report: TurnResolutionReport;
      progress: number;
      nonce: number;
    } | null>(null);
  useEffect(() => {
    audio.setAmbience(
      game?.phase === 'planning'
        ? game.wars.some((w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(playerId))
          ? 'war'
          : 'peace'
        : 'off',
    );
    return () => audio.setAmbience('off');
  }, [
    game?.code,
    game?.phase,
    game?.wars
      .filter((w) => w.active && [...w.attackerIds, ...w.defenderIds].includes(playerId))
      .map((w) => w.id)
      .join('|'),
    playerId,
  ]);
  useEffect(() => {
    if (!game || game.phase === 'lobby') return;
    const stamp = `${game.code}:${game.turn}`;
    if (announcedTurn.current === stamp) return;
    const previous = announcedTurn.current;
    announcedTurn.current = stamp;
    if (!previous || !previous.startsWith(`${game.code}:`)) return;
    const battles =
      game.lastReport?.battles.filter(
        (b) => b.attackerId === playerId || b.defenderId === playerId,
      ) ?? [];
    const wins = battles.filter((b) => b.winnerId === playerId).length;
    setTurnAnnouncement({
      turn: game.turn,
      season: SEASONS[game.season].name,
      summary: battles.length
        ? `${battles.length} batalha(s) · ${wins} vitória(s) para sua nação`
        : 'Suas fronteiras atravessaram uma rodada sem batalhas.',
    });
    const timer = setTimeout(() => setTurnAnnouncement(null), 2500);
    return () => clearTimeout(timer);
  }, [game?.code, game?.turn, playerId]);
  useEffect(() => {
    if (
      !game?.matchConfig.tutorial ||
      game.phase !== 'planning' ||
      tutorialRoom.current === game.code
    )
      return;
    tutorialRoom.current = game.code;
    try {
      if (sessionStorage.getItem(`concordia-tutorial-${game.code}-complete`) !== 'true')
        setTutorialOpen(true);
    } catch {
      setTutorialOpen(true);
    }
    const home = game.provinces.find((p) => p.ownerId === playerId && p.capitalOf === playerId);
    if (home) camera.current?.focus(home);
  }, [game?.code, game?.phase, playerId]);
  const startTutorial = () => {
    audio.unlock();
    if (game) {
      setTutorialOpen(true);
      return;
    }
    send({
      type: 'create',
      name: 'Aprendiz',
      tutorial: true,
      mode: 'campaign',
      nationId: 'vespera',
      isPublic: false,
      enableSecretObjectives: false,
      roomName: 'Academia de Concórdia',
    });
  };
  const pingSound = useRef('');
  useEffect(() => {
    const latest = pings.at(-1);
    if (latest && latest.id !== pingSound.current) {
      pingSound.current = latest.id;
      audio.play('ping');
    }
  }, [pings]);
  const firstReadySound = useRef('');
  useEffect(() => {
    const key = game?.firstReadyPlayerName ? `${game.code}:${game.turn}` : '';
    if (key && firstReadySound.current !== key) {
      firstReadySound.current = key;
      audio.play('alert');
    }
  }, [game?.code, game?.turn, game?.firstReadyPlayerName]);
  const seenWars = useRef(new Set<string>()),
    seenWinner = useRef('');
  const open = (panel: Panel) => {
    setProfileOpen(false);
    setFocusedWindow(panel);
    setMenu(false);
    setManual(false);
    setWarRequest(null);
    setEndOpen(false);
    setPanels([panel]);
  };
  const close = (panel: Panel) => {
    if (focusedWindow === panel) focusRemaining(panel);
    if (panel === 'battalion') setArmy('');
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
    if (warRequest) {
      setFocusedWindow('war');
      setPanels([]);
      setMenu(false);
      setManual(false);
      setEndOpen(false);
    }
  }, [warRequest]);
  useEffect(() => {
    if (endOpen) {
      setFocusedWindow('result');
      setPanels([]);
      setMenu(false);
      setManual(false);
      setWarRequest(null);
    }
  }, [endOpen]);
  const playReplay = useCallback((report: TurnResolutionReport) => {
    setTacticalBattle(null);
    setReplay({ report, progress: 0, nonce: performance.now() });
  }, []);
  useEffect(() => {
    if (!replay) return;
    const started = performance.now(),
      cinematic = verticalRules(game),
      duration = cinematic ? CINEMATIC_DURATION : 4000;
    if (cinematic) audio.play('horn');
    if (!cinematic && replay.report.movements.some((m) => !m.isFleet)) audio.playMarchSound();
    if (!cinematic && replay.report.movements.some((m) => m.isFleet)) audio.playSailSound();
    const finish = setTimeout(() => {
      setReplay(null);
      if (cinematic) setTacticalBattle(null);
    }, duration);
    const marching = setTimeout(() => {
      if (cinematic) {
        if (replay.report.movements.some((m) => !m.isFleet)) audio.playMarchSound();
        if (replay.report.movements.some((m) => m.isFleet)) audio.playSailSound();
      }
    }, 1500);
    const cannon = setTimeout(
        () => {
          if (cinematic) {
            const battles = [...replay.report.battles].sort(
              (a, b) => b.attackerTroops + b.defenderTroops - (a.attackerTroops + a.defenderTroops),
            );
            const chosen =
              battles.find((b) => b.attackerId === playerId || b.defenderId === playerId) ??
              battles[0];
            if (chosen) setTacticalBattle(chosen);
          } else if (replay.report.battles.length) audio.playCombatSound();
        },
        cinematic ? 3500 : 1450,
      ),
      peace = setTimeout(() => {
        if (replay.report.diplomaticChanges.some((c) => c.action === 'PEACE')) audio.play('peace');
      }, 2900);
    let frame = 0;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - started) / duration);
      if (progress === 1) {
        setReplay(null);
        if (cinematic) setTacticalBattle(null);
        return;
      }
      setReplay((r) => (r ? { ...r, progress } : null));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(finish);
      clearTimeout(cannon);
      clearTimeout(marching);
      clearTimeout(peace);
    };
  }, [replay?.nonce]);
  const closeTacticalBattle = useCallback(() => setTacticalBattle(null), []);
  const replayTurn = useRef<{ code: string; turn: number } | null>(null);
  useEffect(() => {
    if (!game) return;
    const previous = replayTurn.current;
    replayTurn.current = { code: game.code, turn: game.turn };
    if (previous?.code === game.code && game.turn > previous.turn && game.lastReport)
      playReplay(game.lastReport);
  }, [game?.code, game?.turn, playReplay]);
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
      if (e.key === 'F1' || e.key === 'F2' || e.key === 'F3' || e.key === 'F4' || e.key === 'F5')
        e.preventDefault();
      const map = MAP_MODES.find(
        (m) => m.key === e.key || String(MAP_MODES.indexOf(m) + 1) === e.key,
      );
      if (map) {
        e.preventDefault();
        setMode(map.id);
      }
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
    setTacticalBattle(null);
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
        <Entry
          send={send}
          online={status === 'online'}
          onHelp={openManual}
          onTutorial={startTutorial}
          onProfile={() => setProfileOpen(true)}
        />
        {manual && (
          <Manual
            close={closeManual}
            active={focusedWindow === 'manual'}
            onActivate={() => setFocusedWindow('manual')}
          />
        )}
        {profileModal}
        <ConnectionToast error={error} status={status} dismiss={() => setError('')} />
      </div>
    );
  if (game.phase === 'lobby')
    return (
      <div className="application" onClickCapture={rootClick}>
        <Lobby
          game={game}
          playerId={playerId}
          command={command}
          leave={leave}
          send={send}
          seatInvites={seatInvites}
        />
        {profileModal}
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
  const diplomaticReference =
    referenceId ||
    (mode === 'DIPLOMATIC'
      ? selectedArmy?.ownerId && selectedArmy.ownerId !== 'NEUTRAL'
        ? selectedArmy.ownerId
        : selected
          ? controller(selected)
          : null
      : null) ||
    playerId;
  const troopTotal = game.battalions
    .filter((a) => a.ownerId === playerId)
    .reduce((n, a) => n + unitCount(a), 0);
  const remaining = game.deadline ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : null;
  const ready = alive.filter((p) => p.ready || p.bot).length;
  const focus = (id: string) => {
    const p = game.provinces.find((p) => p.id === id);
    if (p) camera.current?.focus(p);
  };
  const signal = (p: Province, note = '') => send({ type: 'map_ping', provinceId: p.id, note });
  const selectArmy = (a: Battalion) => {
    setReference('');
    if (a.isFleet) audio.playSailSound();
    setUnitTab('command');
    setArmy(a.id);
    setProvince(a.provinceId);
    open('battalion');
  };
  const selectProvince = (p: Province) => {
    setReference('');
    setArmy('');
    setProvinceTab('build');
    setProvince(p.id);
    open('province');
  };
  const tactical = (p: Province) => {
    if (!selectedArmy || selectedArmy.ownerId !== playerId) {
      setError('Selecione uma ficha de batalhão ou frota antes de preparar a rota.');
      return;
    }
    if (game.phase !== 'planning' || me.ready) {
      setError('Reabra as ordens antes de preparar movimento.');
      return;
    }
    audio.unlock();
    const host = controller(p);
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
    if (selectedArmy.embarkedOnId) {
      command({
        type: 'SUBMIT_ORDER',
        order: {
          type: 'EMBARK_BATTALION',
          battalionId: selectedArmy.id,
          disembarkProvinceId: p.id,
        },
      });
      audio.playSailSound();
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
        audio.playSailSound();
        return;
      }
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
      audio.playSailSound();
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
    if (selectedArmy.isFleet || from.straitNeighbors.includes(p.id)) audio.playSailSound();
    else audio.playMarchSound();
  };
  const showReport = (tab: ReportTab) => {
    setReportTab(tab);
    open('report');
  };
  return (
    <div
      className={`game-viewport release-candidate-interface ${cartographic ? 'cartographic-interface' : 'classic-interface'}`}
      onClickCapture={rootClick}
      data-interface={cartographic ? 'cartographic' : 'classic'}
      data-audio-muted={muted}
    >
      {achievementToast.length > 0 && (
        <aside className="achievement-toast" role="status">
          🏅 Conquista desbloqueada: {achievementToast.join(' · ')}
        </aside>
      )}
      <Atlas
        ref={camera}
        cartographic={cartographic}
        provinces={game.provinces}
        players={game.players}
        game={game}
        mode={mode}
        referenceId={diplomaticReference}
        selectedId={provinceId}
        selectedArmyId={armyId}
        orders={game.plannedOrders}
        onSelect={selectProvince}
        onSelectArmy={selectArmy}
        onTactical={tactical}
        onCancelOrder={(id) => command({ type: 'CANCEL_ORDER', key: `army:${id}` })}
        onDeselect={() => setArmy('')}
        viewerId={playerId}
        fogEnabled={fogEnabled}
        onBattle={setTacticalBattle}
        replay={replay}
        pings={pings}
        onPing={signal}
      />
      <MapLensSelector
        mode={mode}
        onChange={setMode}
        fogAvailable={verticalRules(game)}
        fogEnabled={fogEnabled}
        onToggleFog={() => setFogEnabled((v) => !v)}
      />
      <OutlinerDock
        game={game}
        playerId={playerId}
        onArmy={(a) => {
          selectArmy(a);
          focus(a.provinceId);
        }}
        onProvince={(p) => {
          selectProvince(p);
          focus(p.id);
        }}
      />
      <header className="top-bar framed-panel" data-hud-surface>
        <button className="nation-heading" onClick={openMenu} title="Conselho da nação">
          <CoatOfArms nationId={me.nationId} size={32} />
          <span>
            <strong>{me.nation}</strong>
            <small
              title={(goldRules(game)
                ? FACTION_TRAITS[me.nationId].effects
                : nationOf(me.nationId).ideas
              ).join(' · ')}
            >
              {goldRules(game) ? FACTION_TRAITS[me.nationId].name : 'Campanha clássica'} ·{' '}
              {me.name}{' '}
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
          <div
            className="hud-stat reserves-stat"
            title="Recrutas disponíveis / teto da reserva. Recuperação por rodada indicada abaixo."
          >
            <Users size={18} />
            <span>
              <strong>
                {number(me.manpower)} / {number(eco.manpowerCap)}
              </strong>
              <small>
                RECRUTAS <b className="positive">+{number(eco.manpower)}/rod.</b>
              </small>
            </span>
          </div>
          <div
            className="hud-stat authority-stat"
            title="Autoridade reúne influência, prestígio e experiência militar. Nas novas campanhas paga doutrinas, líderes, diplomacia e Defesa da Pátria. Batalhas e decisões alteram a previsão básica."
          >
            <Crown size={18} />
            <span>
              <strong data-testid="authority">{getNationAuthority(me)}</strong>
              <small>
                AUTORIDADE{' '}
                <b className="positive">
                  +
                  {number(
                    Math.max(0, Math.min(2, 50 - me.influence)) + (eco.owned.length ? 10 : 0),
                  )}
                  /rod.
                </b>
              </small>
            </span>
          </div>
        </div>
        <div className="turn-status">
          {goldRules(game) && (
            <span
              className="era-pill"
              title={ERAS[campaignEra(game.turn)].description}
              data-campaign-era={campaignEra(game.turn)}
            >
              {ERAS[campaignEra(game.turn)].icon} {ERAS[campaignEra(game.turn)].act} ·{' '}
              {ERAS[campaignEra(game.turn)].name}
            </span>
          )}
          <strong>
            Rodada {String(game.turn).padStart(2, '0')} <small>∞</small>
          </strong>
          <span>
            {(game.matchConfig.scenarioId === 'WORLD_GRAND_CAMPAIGN' ||
            game.matchConfig.scenarioId === 'AGE_OF_SAIL'
              ? 1500
              : 1550) + Math.floor((game.turn - 1) / 4)}{' '}
            · {SEASONS[game.season].icon} {SEASONS[game.season].name}
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
            aria-label="Perfil do Estrategista"
            title={profile.title}
            onClick={() => {
              setPanels([]);
              setMenu(false);
              setManual(false);
              setProfileOpen(true);
            }}
          >
            🏅
          </button>
          <button
            aria-label="🎓 Tutorial Rápido (5 Passos)"
            title="Tutorial Rápido (5 Passos)"
            onClick={startTutorial}
          >
            🎓
          </button>
          <button aria-label="Como jogar" title="Manual de campanha" onClick={openManual}>
            <BookOpen size={16} />
          </button>
          <button
            aria-label={muted ? 'Ativar efeitos' : 'Silenciar efeitos'}
            title={muted ? 'Ativar efeitos' : 'Silenciar efeitos'}
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
      {game.sandboxContinued && (
        <div className="sandbox-banner" data-hud-surface>
          ⚔️ Dominação Livre · vitória original preservada na rodada {game.victoryRecord?.turn}
        </div>
      )}
      {game.turn <= game.graceUntilTurn && (
        <div className="grace-banner" data-hud-surface>
          🕊️ Pacto de não agressão · guerras liberadas na rodada {game.graceUntilTurn + 1}
        </div>
      )}
      <FirstReadyBanner game={game} />
      {turnAnnouncement && (
        <aside className="turn-announcement" aria-live="polite" data-turn-announcement>
          <span>
            📜 Rodada {turnAnnouncement.turn} — {turnAnnouncement.season}
          </span>
          <small>{turnAnnouncement.summary}</small>
        </aside>
      )}
      <PersonalAlerts
        game={game}
        playerId={playerId}
        command={command}
        onFocus={focus}
        compact
        onShowAll={() => showReport('personal')}
      />
      <nav
        className="hud-navigation unified-navigation"
        aria-label="Conselhos estratégicos"
        data-hud-surface
      >
        <button onClick={() => open('diplomacy')} aria-label="Diplomacia" title="👑 Diplomacia">
          <Handshake size={15} />
          <span>Diplomacia</span>
        </button>
        <button
          onClick={() => open('skills')}
          aria-label="Árvore Militar"
          title="🎖️ Árvore Militar"
        >
          <Swords size={15} />
          <span>Árvore Militar</span>
        </button>
        <button
          onClick={() => open('maritime')}
          aria-label="Comércio & Mares"
          title="⚓ Comércio & Mares"
        >
          <Anchor size={15} />
          <span>Comércio & Mares</span>
        </button>
        <button
          onClick={() => open('world')}
          aria-label="Crises & Coalizões"
          title="🌍 Crises & Coalizões"
        >
          <Crown size={15} />
          <span>Crises & Coalizões</span>
        </button>
        <button onClick={() => open('secret')} aria-label="Objetivos" title="🎯 Objetivos">
          <Flag size={15} />
          <span>Objetivos</span>
        </button>
        <button
          onClick={() => open('analytics')}
          aria-label="Estatísticas da campanha"
          title="📊 Estatísticas"
        >
          <ScrollText size={15} />
          <span>Estatísticas</span>
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
      {panels.some((p) => GLOBAL_PANELS.includes(p)) && (
        <TopBarModal
          id="strategy-center"
          title={STRATEGY_TITLES[panels[0]] ?? 'Conselho Estratégico'}
          onClose={() => setPanels([])}
        >
          {panels[0] === 'diplomacy' && (
            <DiplomacyDrawer
              game={game}
              playerId={playerId}
              command={command}
              focusedRealmId={diplomacyTarget}
              onInspectRealm={(id) => setReference(id)}
              onDeclareWar={(id) => setWarRequest({ targetId: id })}
            />
          )}
          {panels[0] === 'skills' && (
            <SkillTreeDrawer game={game} playerId={playerId} command={command} />
          )}
          {panels[0] === 'maritime' && <MaritimeOverview game={game} playerId={playerId} />}
          {panels[0] === 'world' && (
            <WorldDrawer game={game} playerId={playerId} command={command} />
          )}
          {panels[0] === 'secret' && (
            <SecretDrawer game={game} playerId={playerId} command={command} />
          )}
          {panels[0] === 'analytics' && <PostGameAnalytics game={game} playerId={playerId} />}
        </TopBarModal>
      )}
      {tacticalBattle && (
        <TacticalBattleModal game={game} battle={tacticalBattle} onClose={closeTacticalBattle} />
      )}
      {replay && verticalRules(game) && (
        <TurnResolutionSequencer
          report={replay.report}
          progress={replay.progress}
          onSkip={() => {
            setReplay(null);
            setTacticalBattle(null);
          }}
          onReplay={() => {
            setTacticalBattle(null);
            playReplay(replay.report);
          }}
        />
      )}
      {replay && !verticalRules(game) && (
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
          key={selected.id}
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
            compact
            initialTab={provinceTab}
            command={command}
            onSelectArmy={selectArmy}
            onFocus={() => focus(selected.id)}
            onPing={(note) => signal(selected, note)}
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
          key={selectedArmy.id}
          active={focusedWindow === 'battalion'}
          onActivate={() => open('battalion')}
          title="Comando de Batalhão"
          icon={<Swords size={15} />}
          anchor="right"
          width={340}
          height={610}
          onClose={() => close('battalion')}
        >
          {selectedArmy.ownerId === playerId &&
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
                      ? `Destino: ${game.provinces.find((p) => p.id === o.targetProvinceId)?.name} · ${o.fleetId ? 'ponte naval grátis' : `fretamento ${goldRules(game) && me.nationId === 'vespera' ? '8' : '15'} ouro`}`
                      : o.type === 'MOVE_BATTALION'
                        ? `Marcha: ${game.provinces.find((p) => p.id === (o.path?.at(-1) ?? o.targetProvinceId))?.name}`
                        : null,
                  )}
              </p>
            )}
          {selectedArmy.ownerId === playerId ? (
            <>
              <div className="context-tabs" role="tablist" aria-label="Comando da unidade">
                {(
                  [
                    ['command', '⚔️ Comando'],
                    ['leaders', '🎖️ Líder'],
                    ['details', '⚙️ Detalhes'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    role="tab"
                    key={id}
                    aria-selected={unitTab === id}
                    onClick={() => setUnitTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {unitTab === 'command' && (
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
                  onDeselect={() => close('battalion')}
                />
              )}
              {unitTab === 'leaders' && (
                <CommanderPanel
                  game={game}
                  army={selectedArmy}
                  playerId={playerId}
                  command={command}
                />
              )}
              {unitTab === 'details' && (
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
            </>
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
      {panels.includes('report') && (
        <PanelWindow
          id="report"
          active={focusedWindow === 'report'}
          onActivate={() => open('report')}
          title={REPORT_TITLES[reportTab]}
          headerActions={
            (reportTab === 'personal' || reportTab === 'world') && (
              <button
                className="mark-read"
                onClick={() =>
                  command({
                    type: 'READ_NOTIFICATIONS',
                    notificationIds: game.notifications
                      .filter((n) =>
                        reportTab === 'world'
                          ? n.type === 'WORLD'
                          : n.type !== 'WORLD' && n.involvesPlayerIds.includes(playerId),
                      )
                      .map((n) => n.id),
                  })
                }
              >
                Marcar todos como lidos
              </button>
            )
          }
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
            onBattle={setTacticalBattle}
            onReplay={playReplay}
            onFocus={focus}
          />
        </PanelWindow>
      )}
      <footer className="hud-footer" data-hud-surface>
        <div className="footer-tabs">
          <button onClick={() => showReport('world')} aria-label="Crônica">
            🗺️ Crônica
          </button>
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
      <div className="map-controls framed-panel" data-hud-surface>
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
          <select value={diplomaticReference} onChange={(e) => setReference(e.target.value)}>
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
          ? `${selectedArmy.name} · botão direito no destino para mover / atacar`
          : 'Selecione uma cidade ou uma ficha de batalhão'}
        <span>
          Clique Esquerdo: Selecionar | Clique Direito: Mover / Atacar · arraste direito/meio:
          câmera · scroll: zoom
        </span>
      </div>
      {menu && (
        <TopBarModal id="council-menu" title="Conselho da nação" onClose={closeMenu}>
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
              Relevo cartográfico 2,5D
            </label>
            <PlayerNameForm name={me.name} command={command} />
            <p>
              Forças: {troopTotal} / {eco.armyCap} · {RELIGIONS[me.faith].name} · desgaste{' '}
              {number(me.warExhaustion)}%
            </p>
            <section className="faction-trait-card">
              <h3>{goldRules(game) ? FACTION_TRAITS[me.nationId].name : 'Tradições nacionais'}</h3>
              <ul>
                {(goldRules(game)
                  ? FACTION_TRAITS[me.nationId].effects
                  : nationOf(me.nationId).ideas
                ).map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </section>
            {game.matchConfig.sourceReport && (
              <p className="warning-box">
                Cenário derivado de relatório da rodada {game.matchConfig.sourceReport.turn}: novas
                ordens, novos eventos aleatórios e objetivos secretos desativados. Para retomada
                integral, use o Save JSON completo.
              </p>
            )}
            <AudioControls />
            {game.hostId === playerId && (
              <CampaignSaveControls send={send} canExport invites={seatInvites} />
            )}
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
        </TopBarModal>
      )}
      {endOpen && game.phase === 'finished' && (
        <TopBarModal
          id="result"
          title="Resultado da campanha"
          onClose={closeResult}
          footer={
            <>
              {game.finishReason === 'victory' && (
                <button
                  className="primary"
                  disabled={game.hostId !== playerId}
                  title={game.hostId !== playerId ? 'O anfitrião decide pela sala.' : ''}
                  onClick={() => {
                    command({ type: 'CONTINUE_SANDBOX' });
                    closeResult();
                  }}
                >
                  ⚔️ Continuar Jogando (Modo Sandbox)
                </button>
              )}
              <button onClick={() => download(game, 'json')}>📊 Baixar Relatório .JSON</button>
              <button onClick={() => download(game, 'txt')}>📜 Baixar Crônica .TXT</button>
            </>
          }
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
            <PostGameAnalytics game={game} playerId={playerId} />
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
          </section>
        </TopBarModal>
      )}
      {manual && (
        <Manual
          close={closeManual}
          active={focusedWindow === 'manual'}
          onActivate={() => setFocusedWindow('manual')}
        />
      )}
      {tutorialOpen && (
        <TutorialOverlay
          game={game}
          playerId={playerId}
          selectedArmyId={armyId}
          selectedProvinceId={provinceId}
          activePanel={panels[0] ?? ''}
          onClose={() => setTutorialOpen(false)}
          onComplete={() => {
            setTutorialOpen(false);
          }}
        />
      )}
      {profileModal}
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
