import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Castle,
  CheckCheck,
  ChevronDown,
  Clock3,
  Coins,
  Compass,
  Copy,
  Crown,
  Flag,
  Handshake,
  Layers3,
  Leaf,
  Map,
  Menu,
  MessageCircle,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Target,
  Tent,
  TriangleAlert,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { OBJECTIVES } from '../shared/types';
import type { GameView, MapMode, Objective, Player, Province } from '../shared/types';
import { realmEconomy, supplyLimit } from '../shared/rules';
import Atlas, { MAP_MODES, type CameraHandle } from './Atlas';
import { Entry, Lobby } from './Entry';
import { ProvinceDrawer, QuickMarch } from './ProvinceDrawer';
import DiplomacyDrawer from './DiplomacyDrawer';
import TurnPanel, { type TurnTab } from './TurnPanel';
import { legalDestination } from './orders';
import { Brand, number, ObjectiveIcon, typing, type Command } from './ui';
import { useGame } from './useGame';

function Countdown({ game }: { game: GameView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((game.deadline ?? now) - now) / 1000));
  return (
    <span className={`countdown ${seconds < 30 && !game.demo && !game.paused ? 'urgent' : ''}`}>
      <Clock3 size={12} />
      {game.phase === 'finished'
        ? 'Encerrada'
        : game.paused
          ? 'Campanha pausada'
          : game.demo
            ? 'Demonstração · sem prazo'
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
    </span>
  );
}
function Manual({ game, me, close }: { game: GameView; me: Player; close: () => void }) {
  return (
    <div className="modal-scrim">
      <section className="game-modal manual-modal" role="dialog" aria-label="Manual de campanha">
        <button className="window-close" aria-label="Fechar manual" onClick={close}>
          <X size={18} />
        </button>
        <div className="eyebrow">MANUAL DO CONSELHO</div>
        <h2>Quatro caminhos. Um legado.</h2>
        <p>
          Todos planejam ao mesmo tempo. Uma ordem por província; missões podem visar terras
          inimigas adjacentes. Mercenários e diplomacia têm efeito imediato.
        </p>
        <div className="manual-objectives">
          {Object.entries(OBJECTIVES).map(([id, o]) => (
            <article key={id}>
              <ObjectiveIcon objective={id as Objective} />
              <h3>{o.name}</h3>
              <strong>
                {number(me.scores[id as Objective], 1)} / {game.victoryTargets[id as Objective]}
              </strong>
              <p>{o.formula}</p>
            </article>
          ))}
        </div>
        <div className="manual-rules">
          <article>
            <Coins size={19} />
            <h3>Economia e pacificação</h3>
            <p>
              Imposto = base × pacificação/100 × (1,15 mesma religião; 0,85 diferente) × (1 −
              revolta/200). Guarnição parada de 3 tropas dá +15 pacificação e −10 revolta.
              Pacificação explícita dá +35/−25. Conquistas começam em 20 de pacificação, ou 0 com
              outra fé, e +30 revolta.
            </p>
          </article>
          <article>
            <Tent size={19} />
            <h3>Suprimento e tropas</h3>
            <p>
              Limite = base + 3 por nível de forte + 2 com pacificação ≥ 80. O excesso perde 15%
              arredondados para cima e custa manutenção progressiva. Mercenários custam o dobro na
              contratação e 2,2× na manutenção. Treinamento varia de 1,00 a 1,50.
            </p>
          </article>
          <article>
            <Swords size={19} />
            <h3>Combate e recuo</h3>
            <p>
              Força = tropas × treinamento × (0,5 + 0,5 × moral/100). Terreno e fortes beneficiam a
              defesa. Derrotados recuam com 55–70% dos sobreviventes, com arredondamento de tropas e
              moral 15. Aniquilação exige vantagem ≥ 2,5× ou moral zero sem rota de fuga.
            </p>
          </article>
          <article>
            <Handshake size={19} />
            <h3>Pactos e hegemonia</h3>
            <p>
              Alianças, acesso e tributo exigem aceitação. Romper aliança custa 4 influência, 10
              moral e gera trégua até a rodada seguinte. A partir de 75% de qualquer legado, o líder
              vira hegêmona: demais reinos recebem +10% de força contra ele e podem romper pactos
              com ele sem penalidade ou trégua.
            </p>
          </article>
        </div>
        <div className="manual-shortcuts">
          <strong>Atalhos</strong>
          <span>1–5 · modos do mapa</span>
          <span>Scroll · zoom</span>
          <span>Meio/direito ou Espaço + arraste · mover câmera</span>
          <span>Clique direito numa vizinha · marcha tática</span>
          <span>Esc · fechar janela</span>
        </div>
      </section>
    </div>
  );
}
function Hud({
  game,
  me,
  command,
  leave,
  status,
  setError,
}: {
  game: GameView;
  me: Player;
  command: Command;
  leave: () => void;
  status: string;
  setError: (s: string) => void;
}) {
  const camera = useRef<CameraHandle>(null),
    [mode, setMode] = useState<MapMode>('POLITICAL'),
    [selectedId, setSelectedId] = useState(''),
    [referenceId, setReferenceId] = useState(me.id),
    [drawer, setDrawer] = useState<'province' | 'diplomacy' | null>(null),
    [realmId, setRealmId] = useState(me.id),
    [quick, setQuick] = useState<{ sourceId: string; targetId?: string } | null>(null),
    [tab, setTab] = useState<TurnTab>('orders'),
    [expanded, setExpanded] = useState(false),
    [manual, setManual] = useState(false),
    [menu, setMenu] = useState(false),
    [copied, setCopied] = useState(false);
  const selected = game.provinces.find((p) => p.id === selectedId),
    eco = realmEconomy(game, me.id);
  const troops =
      eco.owned.reduce((n, p) => n + p.troops, 0) +
      [...game.stationedArmies, ...game.displacedArmies]
        .filter((a) => a.ownerId === me.id)
        .reduce((n, a) => n + a.troops, 0),
    supply = eco.owned.reduce((n, p) => n + supplyLimit(p), 0);
  const threat = [...game.players]
      .filter((p) => game.provinces.some((q) => q.ownerId === p.id))
      .sort(
        (a, b) =>
          Math.max(...Object.values(b.victoryProgress)) -
          Math.max(...Object.values(a.victoryProgress)),
      )[0],
    leader = game.players.find((p) => p.id === game.hegemonyLeaderId),
    winner = game.players.find((p) => p.id === game.winnerId),
    alive = eco.owned.length > 0;
  const reference = game.players.find((p) => p.id === referenceId),
    ready = game.players.filter(
      (p) => p.bot || p.ready || !game.provinces.some((q) => q.ownerId === p.id),
    ).length;
  const mySelectedArmy =
    selected?.ownerId === me.id
      ? selected
      : game.stationedArmies.find((a) => a.provinceId === selectedId && a.ownerId === me.id);
  const act: Command = (cmd) => {
    command(cmd);
    if (
      cmd.type === 'SUBMIT_ORDER' &&
      cmd.order.type !== 'DIPLOMACY' &&
      !(cmd.order.type === 'RECRUIT' && cmd.order.isMercenary)
    ) {
      setTab('orders');
      setExpanded(true);
    }
  };
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (quick) setQuick(null);
        else if (manual) setManual(false);
        else if (menu) setMenu(false);
        else if (drawer) setDrawer(null);
        else setExpanded(false);
        return;
      }
      if (typing(e.target)) return;
      if (!quick && !manual && !menu) {
        const chosen = MAP_MODES.find((m) => m.key === e.key);
        if (chosen) {
          e.preventDefault();
          setMode(chosen.id);
        }
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [quick, manual, menu, drawer]);
  function showProvince(p: Province) {
    setSelectedId(p.id);
    setDrawer('province');
  }
  function showDiplomacy(id = me.id) {
    setRealmId(id);
    setReferenceId(id);
    setMode('DIPLOMATIC');
    setDrawer('diplomacy');
  }
  function tactical(target: Province) {
    if (
      !selected ||
      !mySelectedArmy ||
      mySelectedArmy.troops < (selected.ownerId === me.id ? 2 : 1)
    ) {
      setError('Selecione uma província com tropas suas antes de dar a ordem tática.');
      return;
    }
    if (!selected.neighbors.includes(target.id)) {
      setError('A marcha precisa terminar em uma província vizinha.');
      return;
    }
    if (!legalDestination(game, me.id, target)) {
      setError('Um tratado impede a marcha. Solicite acesso militar ou encerre o pacto.');
      return;
    }
    if (me.ready) {
      setError('Reabra suas ordens para editar.');
      return;
    }
    setQuick({ sourceId: selected.id, targetId: target.id });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(game.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Código da sala: ${game.code}`);
    }
  }
  return (
    <div
      className={`game-viewport ${expanded ? 'panel-expanded' : ''} ${leader || game.phase === 'finished' ? 'has-alert' : ''}`}
    >
      <Atlas
        ref={camera}
        provinces={game.provinces}
        players={game.players}
        game={game}
        mode={mode}
        referenceId={referenceId}
        selectedId={selectedId}
        orders={game.plannedOrders}
        onSelect={showProvince}
        onTactical={tactical}
      />
      <header className="hud-topbar glass">
        <button className="hud-nation" onClick={() => setMenu(true)} title="Menu da campanha">
          <span className="nation-shield" style={{ color: me.color, borderColor: me.color }}>
            <Crown size={22} />
          </span>
          <span>
            <strong>{me.nation}</strong>
            <small>
              {me.name}
              <span className="mobile-realm-meta">
                {' '}
                · {me.faith} · Est. {me.stability}%
              </span>
            </small>
          </span>
          <ChevronDown size={12} />
        </button>
        <div className="hud-economy">
          <div
            className="hud-stat"
            title={`Receita ${number(eco.income, 2)} · manutenção ${number(eco.upkeep, 2)} por rodada`}
          >
            <Coins size={17} />
            <div>
              <strong data-testid="treasury">{number(me.gold, 1)}</strong>
              <small>
                OURO{' '}
                <span className={eco.net >= 0 ? 'positive' : 'danger-text'}>
                  {eco.net >= 0 ? '+' : ''}
                  {number(eco.net, 1)}
                </span>
              </small>
            </div>
          </div>
          <div
            className="hud-stat"
            title="Total de tropas e soma dos suprimentos próprios. O limite e o atrito são locais, por província."
          >
            <Users size={17} />
            <div>
              <strong>
                {troops}
                <em> / {supply}</em>
              </strong>
              <small>TROPAS / SUPRIMENTO</small>
            </div>
          </div>
          <div
            className="hud-stat compact-stat"
            title={`${me.manpower} reservas de população · ${me.influence} influência`}
          >
            <Sparkles size={16} />
            <div>
              <strong>
                {me.influence}
                <em> / {me.manpower}</em>
              </strong>
              <small>INFLUÊNCIA / RESERVAS</small>
            </div>
          </div>
          <div className="hud-stat faith-stat" title={`Religião estatal: ${me.faith}`}>
            <Sun size={17} />
            <div>
              <strong>{me.faith}</strong>
              <small>RELIGIÃO ESTATAL</small>
            </div>
          </div>
          <div
            className="hud-stat stability-stat"
            title="Média de pacificação menos metade da revolta nas suas províncias."
          >
            <Leaf size={17} />
            <div>
              <strong>{me.stability}%</strong>
              <small>ESTABILIDADE</small>
            </div>
          </div>
        </div>
        <button
          className={`threat-tracker ${leader ? 'danger-text' : ''}`}
          onClick={() => showDiplomacy(threat?.id ?? me.id)}
          title="Maior progresso em qualquer um dos quatro legados"
        >
          <Target size={15} />
          <span>
            <small>MAIOR AMBIÇÃO</small>
            <strong>
              {threat?.nation ?? '—'}{' '}
              <b>{number(Math.max(0, ...Object.values(threat?.victoryProgress ?? {})))}%</b>
            </strong>
          </span>
        </button>
        <div className="hud-turn">
          <h2>
            Rodada {String(game.turn).padStart(2, '0')} <span>/ {game.maxTurns}</span>
          </h2>
          <small>
            {1550 + Math.floor((game.turn - 1) / 4)} ·{' '}
            {['Primavera', 'Verão', 'Outono', 'Inverno'][(game.turn - 1) % 4]}
          </small>
          <Countdown game={game} />
        </div>
        <button
          className={`button ready-button ${me.ready ? 'outline' : 'primary'}`}
          disabled={game.phase !== 'planning' || !alive || status !== 'online'}
          onClick={() => command({ type: 'READY', ready: !me.ready })}
        >
          <CheckCheck size={17} />
          <span>
            {me.ready ? 'Reabrir ordens' : 'Confirmar ordens'}
            <small>
              {ready}/{game.players.length} reinos prontos
            </small>
          </span>
        </button>
        <button
          className="icon-button hud-menu"
          aria-label="Menu da campanha"
          onClick={() => setMenu(true)}
        >
          <Menu size={20} />
        </button>
      </header>
      {game.phase === 'finished' ? (
        <div className="hegemony-banner victory glass">
          <Crown size={24} />
          <div>
            <strong>
              {winner ? `${winner.nation} escreveu seu legado.` : 'A campanha terminou.'}
            </strong>
            <span>
              {winner && game.winnerObjective
                ? `Vitória por ${OBJECTIVES[game.winnerObjective].name}. `
                : ''}
              Inspecione o mapa e os relatórios.
            </span>
          </div>
          <button
            className="button outline small-button"
            onClick={() => {
              setTab('reports');
              setExpanded(true);
            }}
          >
            Ver resultados
          </button>
        </div>
      ) : (
        leader && (
          <div className="hegemony-banner glass">
            <TriangleAlert size={23} />
            <div>
              <strong>A ascensão de {leader.nation}</strong>
              <span>
                75% de um legado: demais reinos têm +10% de força contra a hegemonia e podem romper
                pactos com ela sem penalidade ou trégua.
              </span>
            </div>
          </div>
        )
      )}
      <div className="hud-navigation">
        <button
          className={`glass nav-chip ${drawer === 'province' ? 'active' : ''}`}
          onClick={() => {
            if (selected) setDrawer(drawer === 'province' ? null : 'province');
            else setError('Clique numa província para inspecioná-la.');
          }}
        >
          <Flag size={16} />
          Província
        </button>
        <button
          className={`glass nav-chip ${drawer === 'diplomacy' ? 'active' : ''}`}
          onClick={() => (drawer === 'diplomacy' ? setDrawer(null) : showDiplomacy())}
        >
          <Handshake size={16} />
          Diplomacia{game.offers.some((o) => o.to === me.id) && <i className="notification-dot" />}
        </button>
        <button
          className="glass nav-chip"
          aria-label="Conselho público"
          onClick={() => {
            setTab('chat');
            setExpanded(true);
          }}
        >
          <MessageCircle size={16} />
        </button>
        <button className="glass nav-chip" aria-label="Como jogar" onClick={() => setManual(true)}>
          <BookOpen size={16} />
        </button>
      </div>
      {drawer && (
        <aside
          className="inspector-drawer glass"
          aria-label={drawer === 'province' ? 'Província selecionada' : 'Diplomacia e reinos'}
        >
          <header>
            <div className="drawer-tabs">
              <button
                className={drawer === 'province' ? 'active' : ''}
                disabled={!selected}
                onClick={() => setDrawer('province')}
              >
                <Flag size={13} />
                Província
              </button>
              <button
                className={drawer === 'diplomacy' ? 'active' : ''}
                onClick={() => setDrawer('diplomacy')}
              >
                <Handshake size={13} />
                Reinos
              </button>
            </div>
            <button
              className="icon-button"
              aria-label="Fechar gaveta"
              onClick={() => setDrawer(null)}
            >
              <X size={16} />
            </button>
          </header>
          <div className="drawer-scroll">
            {drawer === 'province' && selected ? (
              <ProvinceDrawer
                key={selected.id}
                game={game}
                me={me}
                province={selected}
                command={act}
                onMarch={(p) => setQuick({ sourceId: p.id })}
                onFocus={() => camera.current?.focus(selected)}
                onDiplomacy={showDiplomacy}
              />
            ) : (
              <DiplomacyDrawer
                game={game}
                me={me}
                selectedId={realmId}
                onSelect={(id) => {
                  setRealmId(id);
                  setReferenceId(id);
                }}
                command={act}
              />
            )}
          </div>
        </aside>
      )}
      {!alive && game.phase === 'planning' && (
        <div className="spectator-badge glass">
          <Shield size={15} />
          Seu reino está sem território. Acompanhe a campanha e o conselho.
        </div>
      )}
      <TurnPanel
        game={game}
        me={me}
        command={act}
        tab={tab}
        setTab={setTab}
        expanded={expanded}
        setExpanded={setExpanded}
        onProvince={(id) => {
          const p = game.provinces.find((p) => p.id === id);
          if (p) showProvince(p);
        }}
      />
      <div className="map-controls">
        <div className="map-mode-label glass">
          <Compass size={13} />
          <span>
            {mode === 'DIPLOMATIC'
              ? `Relações de ${reference?.nation ?? me.nation}`
              : MAP_MODES.find((m) => m.id === mode)?.description}
          </span>
        </div>
        <div className="map-control-row">
          <div className="map-modes glass" aria-label="Modos do mapa">
            {MAP_MODES.map((m, i) => {
              const Icon = [Flag, Sun, Coins, Handshake, TriangleAlert][i];
              return (
                <button
                  key={m.id}
                  className={mode === m.id ? 'active' : ''}
                  title={`${m.name} [${m.key}] · ${m.description}`}
                  aria-label={`Mapa ${m.name}`}
                  aria-pressed={mode === m.id}
                  onClick={() => setMode(m.id)}
                >
                  <Icon size={17} />
                  <small>{m.key}</small>
                </button>
              );
            })}
          </div>
          <div className="camera-controls glass">
            <button aria-label="Diminuir zoom" onClick={() => camera.current?.zoomOut()}>
              <ZoomOut size={17} />
            </button>
            <button aria-label="Resetar câmera" onClick={() => camera.current?.reset()}>
              <RotateCcw size={16} />
            </button>
            <button aria-label="Aumentar zoom" onClick={() => camera.current?.zoomIn()}>
              <ZoomIn size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="connection-badge">
        <i className={status === 'online' ? 'connected' : ''} />
        {status === 'online'
          ? game.persistenceEnabled
            ? 'Salvamento automático'
            : 'Conectado · sessão em memória'
          : 'Reconectando…'}
        <span>SALA {game.code}</span>
      </div>
      {quick && (
        <QuickMarch
          key={`${quick.sourceId}-${quick.targetId ?? ''}`}
          game={game}
          me={me}
          source={game.provinces.find((p) => p.id === quick.sourceId)!}
          targetId={quick.targetId}
          command={act}
          close={() => setQuick(null)}
        />
      )}
      {manual && <Manual game={game} me={me} close={() => setManual(false)} />}
      {menu && (
        <div className="modal-scrim">
          <section className="game-modal campaign-menu" role="dialog" aria-label="Menu da campanha">
            <button
              className="window-close"
              aria-label="Fechar menu"
              onClick={() => setMenu(false)}
            >
              <X size={18} />
            </button>
            <Brand />
            <h2>O conselho permanece.</h2>
            <p>
              {me.nation} · {me.name}
            </p>
            <div className="menu-code">
              <small>CÓDIGO DA SALA</small>
              <strong>{game.code}</strong>
              <button className="icon-button" aria-label="Copiar código da sala" onClick={copy}>
                {copied ? <CheckCheck size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <p className="small muted">
              {game.persistenceEnabled
                ? 'A campanha e as sessões são salvas automaticamente. Reiniciar o servidor preserva o jogo.'
                : 'Este servidor não está configurado para salvar campanhas em disco.'}{' '}
              Guarde esta aba para manter a sua sessão.
            </p>
            <button
              className="button outline full"
              onClick={() => {
                setMenu(false);
                setManual(true);
              }}
            >
              <BookOpen size={16} />
              Como jogar
            </button>
            <button className="button outline full" onClick={() => setMenu(false)}>
              Voltar ao mapa
            </button>
            <button className="button ghost full" onClick={leave}>
              Sair da sala
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const { game, playerId, status, error, setError, send, command, leave } = useGame();
  const me = game?.players.find((p) => p.id === playerId);
  return (
    <>
      {game && me ? (
        game.phase === 'lobby' ? (
          <Lobby game={game} me={me} command={command} leave={leave} />
        ) : (
          <Hud
            key={game.code}
            game={game}
            me={me}
            command={command}
            leave={leave}
            status={status}
            setError={setError}
          />
        )
      ) : (
        <Entry send={send} status={status} />
      )}
      <div className="toast-region" aria-live="polite">
        {error && (
          <div className="toast" role="alert">
            <TriangleAlert size={18} />
            <span>{error}</span>
            <button className="icon-button" aria-label="Fechar aviso" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
