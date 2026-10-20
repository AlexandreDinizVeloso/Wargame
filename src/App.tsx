import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  Compass,
  Copy,
  Crown,
  Flag,
  Globe2,
  Handshake,
  Landmark,
  Leaf,
  LogOut,
  Map,
  MessageCircle,
  Plus,
  Radio,
  ScrollText,
  Send,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Target,
  Tent,
  TrendingUp,
  Users,
  Wheat,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACTIONS, FACTIONS, OBJECTIVES, economyOf, incomeOf, orderCost } from '../shared/types';
import type {
  Action,
  GameMode,
  GameView,
  Objective,
  Order,
  Player,
  Province,
} from '../shared/types';
import { makeMap } from '../shared/map';
import Atlas from './Atlas';
import { useGame } from './useGame';

const objectiveIcons: Record<Objective, LucideIcon> = {
  conquest: Swords,
  prosperity: Landmark,
  concord: Handshake,
  faith: Sun,
};
const actionIcons: Record<Action, LucideIcon> = {
  move: Swords,
  recruit: Users,
  train: Shield,
  develop: Landmark,
  pacify: Leaf,
  convert: Sun,
};
const resourceNames = {
  grain: 'Terras agrícolas',
  trade: 'Entreposto comercial',
  iron: 'Jazidas de ferro',
  shrine: 'Centro religioso',
};
const resourceIcons = { grain: Wheat, trade: Coins, iron: Shield, shrine: Sun };
const previewMap = makeMap().map((p, i) => ({
  ...p,
  ownerId: i % 7 === 0 ? null : FACTIONS[Math.floor(p.col / 2)].nation,
  troops: 2 + ((i * 7) % 10),
  capital: [16, 11, 3, 21].includes(i),
}));
const previewPlayers = FACTIONS.map((f) => ({ ...f, id: f.nation }));
type SendAction = (message: Record<string, unknown>) => void;
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <div className="brand-mark">
        <Crown size={compact ? 23 : 27} strokeWidth={1.3} />
      </div>
      <div>
        <strong>CONCÓRDIA</strong>
        <span>ATLAS DE IMPÉRIOS</span>
      </div>
    </div>
  );
}
function ObjectiveIcon({ objective, size = 19 }: { objective: Objective; size?: number }) {
  const Icon = objectiveIcons[objective];
  return <Icon size={size} />;
}
function Countdown({ deadline, demo }: { deadline: number | null; demo: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil(((deadline ?? now) - now) / 1000));
  return (
    <span className="countdown">
      <Clock3 size={14} />
      {demo
        ? 'Sem pressa · demonstração'
        : deadline
          ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} para resolver`
          : 'Campanha encerrada'}
    </span>
  );
}
function Landing({ send, status }: { send: SendAction; status: string }) {
  const [intent, setIntent] = useState<'create' | 'join' | null>(null),
    [name, setName] = useState(localStorage.getItem('concordia-name') ?? ''),
    [code, setCode] = useState(''),
    [mode, setMode] = useState<GameMode>('quick'),
    [objective, setObjective] = useState<Objective>('conquest');
  function enter(demo = false) {
    localStorage.setItem('concordia-name', name.trim() || 'Estrategista');
    send({
      type: intent === 'join' && !demo ? 'join' : 'create',
      name: name.trim() || 'Estrategista',
      code,
      mode,
      objective,
      demo,
    });
  }
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <span className="prototype-label">
          <span className={`status-dot ${status === 'online' ? 'online' : ''}`} />
          {status === 'online' ? 'PROTÓTIPO JOGÁVEL · v0.1' : 'CONECTANDO AO SERVIDOR'}
        </span>
      </header>
      <main className="landing-main">
        <section className="hero-copy">
          <div className="eyebrow">
            <span />
            ESTRATÉGIA • DIPLOMACIA • LEGADO
          </div>
          <h1>
            Fronteiras mudam.
            <br />
            <em>
              Pactos fazem
              <br />
              história.
            </em>
          </h1>
          <p className="hero-description">
            Europa, por volta de 1550. Governe seu reino, negocie com seus rivais e decida qual
            legado vale uma guerra.
          </p>
          <div className="hero-specs">
            <span>
              <Users size={16} />
              3–8 jogadores
            </span>
            <span>
              <Clock3 size={16} />
              60 min ou 3–5 h*
            </span>
            <span>
              <Globe2 size={16} />
              No navegador
            </span>
          </div>
          <div className="hero-actions">
            <button
              className="button primary large"
              disabled={status !== 'online'}
              onClick={() => enter(true)}
            >
              <Compass size={19} />
              Jogar demonstração
              <ArrowRight size={18} />
            </button>
            <button
              className="button secondary large"
              disabled={status !== 'online'}
              onClick={() => setIntent('create')}
            >
              Criar uma sala
            </button>
          </div>
          <button className="text-link" onClick={() => setIntent('join')}>
            Já tem um código? Entrar na campanha <ArrowUpRight size={14} />
          </button>
          <p className="fine-print">
            Experimente contra 3 bots. Sem cadastro, sem instalação.
            <br />
            *Durações planejadas, ainda sujeitas a testes de equilíbrio.
          </p>
        </section>
        <section className="hero-atlas">
          <div className="hero-map-heading">
            <span className="eyebrow">UM CONTINENTE, MUITAS AMBIÇÕES</span>
            <span className="tag">1550</span>
          </div>
          <Atlas provinces={previewMap} players={previewPlayers} preview />
          <div className="map-caption">
            <div className="seal">
              <Crown size={21} />
            </div>
            <div>
              <strong>O próximo capítulo é seu.</strong>
              <span>Ordens simultâneas. Consequências compartilhadas.</span>
            </div>
          </div>
        </section>
      </main>
      <section className="principles">
        <article>
          <span className="principle-number">01</span>
          <Coins />
          <div>
            <h3>Uma economia de verdade</h3>
            <p>Impostos pagam tropas. Desenvolvimento sustenta ambições. Exércitos têm um custo.</p>
          </div>
        </article>
        <article>
          <span className="principle-number">02</span>
          <Handshake />
          <div>
            <h3>A paz também é estratégia</h3>
            <p>Alianças protegem fronteiras. Traições deixam marcas na confiança e na moral.</p>
          </div>
        </article>
        <article>
          <span className="principle-number">03</span>
          <Target />
          <div>
            <h3>Escolha seu legado</h3>
            <p>Supremacia, prosperidade, concórdia ou fé. Conquistar tudo é só uma das ambições.</p>
          </div>
        </article>
      </section>
      <footer className="landing-footer">
        <span>CONCÓRDIA / UM EXPERIMENTO DE GRANDE ESTRATÉGIA</span>
        <span>Mapa histórico esquemático · regras em desenvolvimento</span>
      </footer>
      {intent && (
        <div className="modal-backdrop">
          <form
            className="entry-modal"
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
          >
            <button
              type="button"
              className="icon-button close-modal"
              aria-label="Fechar"
              onClick={() => setIntent(null)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow">O CONSELHO AGUARDA</div>
            <h2>{intent === 'join' ? 'Entre na campanha' : 'Uma nova era começa'}</h2>
            <label>
              Como devemos chamar você?
              <input
                autoFocus
                placeholder="Seu nome"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            {intent === 'join' ? (
              <label>
                Código da sala
                <input
                  placeholder="Ex.: A3F021"
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                />
              </label>
            ) : (
              <div className="mode-picker">
                <button
                  type="button"
                  className={mode === 'quick' ? 'active' : ''}
                  onClick={() => setMode('quick')}
                >
                  <Clock3 size={19} />
                  <strong>Rápido</strong>
                  <small>20 rodadas · alvo de 60 min</small>
                </button>
                <button
                  type="button"
                  className={mode === 'campaign' ? 'active' : ''}
                  onClick={() => setMode('campaign')}
                >
                  <ScrollText size={19} />
                  <strong>Campanha</strong>
                  <small>40 rodadas · alvo de 3–5 h</small>
                </button>
              </div>
            )}
            <label>
              Seu caminho de vitória
              <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
                {Object.entries(OBJECTIVES).map(([key, o]) => (
                  <option key={key} value={key}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              {OBJECTIVES[objective].description} Você pode ajustar a escolha no conselho antes da
              partida.
            </p>
            <button className="button primary full" disabled={status !== 'online'}>
              {intent === 'join' ? 'Entrar na sala' : 'Reunir o conselho'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function Lobby({
  game,
  me,
  send,
  leave,
}: {
  game: GameView;
  me: Player;
  send: SendAction;
  leave: () => void;
}) {
  const host = game.hostId === me.id;
  return (
    <div className="lobby-page">
      <header className="landing-header">
        <Brand />
        <button className="quiet" onClick={leave}>
          <LogOut size={16} />
          Voltar
        </button>
      </header>
      <main className="lobby-main">
        <div className="eyebrow">ANTES QUE A HISTÓRIA COMECE</div>
        <div className="lobby-title">
          <div>
            <h1>Reúna o conselho.</h1>
            <p className="muted">
              Compartilhe o endereço do servidor e este código com seus amigos.
            </p>
          </div>
          <div className="room-invite">
            <small>CÓDIGO DA SALA</small>
            <strong>{game.code}</strong>
            <span>3–8 pessoas ou bots</span>
          </div>
        </div>
        <div className="lobby-columns">
          <section className="panel council">
            <div className="section-heading">
              <h2>O conselho</h2>
              <span className="tag">{game.players.length} / 8</span>
            </div>
            <div className="council-list">
              {game.players.map((p, i) => (
                <div className="council-player" key={p.id}>
                  <div
                    className="faction-avatar"
                    style={{ '--faction': p.color } as React.CSSProperties}
                  >
                    <Flag size={19} />
                  </div>
                  <div>
                    <strong>
                      {p.name}
                      {p.id === me.id && <small> VOCÊ</small>}
                    </strong>
                    <span>
                      {p.nation} · {OBJECTIVES[p.objective].name}
                    </span>
                  </div>
                  <span className="council-badge">
                    {p.bot ? (
                      <Bot size={17} />
                    ) : p.online ? (
                      <span className="status-dot online" />
                    ) : (
                      <span className="status-dot" />
                    )}
                    {game.hostId === p.id
                      ? 'Anfitrião'
                      : p.bot
                        ? 'Bot'
                        : p.online
                          ? 'Conectado'
                          : 'Ausente'}
                  </span>
                  {host && !p.online && !p.bot && (
                    <button
                      className="quiet tiny"
                      onClick={() => send({ type: 'replaceBot', playerId: p.id })}
                    >
                      Substituir por bot
                    </button>
                  )}
                  <span className="seat-number">0{i + 1}</span>
                </div>
              ))}
            </div>
            {host && game.players.length < 8 && (
              <button className="add-bot" onClick={() => send({ type: 'addBot' })}>
                <Plus size={17} />
                Adicionar reino controlado por bot
              </button>
            )}
            <div className="lobby-notice">
              <Radio size={18} />
              <p>
                Todos acessam o mesmo servidor. O código identifica a sala; ele não substitui a
                conexão de rede.
              </p>
            </div>
          </section>
          <aside className="panel campaign-settings">
            <h2>Os termos da campanha</h2>
            <label>
              Formato
              <select
                value={game.mode}
                disabled={!host}
                onChange={(e) => send({ type: 'mode', mode: e.target.value })}
              >
                <option value="quick">Rápido · 20 rodadas · 3 min por rodada</option>
                <option value="campaign">Campanha · 40 rodadas · 6 min por rodada</option>
              </select>
            </label>
            <div className="settings-summary">
              <span>
                <Target size={15} />
                {game.targetScore} pontos para vencer
              </span>
              <span>
                <Tent size={15} />
                {game.mode === 'campaign'
                  ? 'Suprimentos e desgaste de guerra'
                  : 'Logística simplificada'}
              </span>
            </div>
            <label>
              Seu legado
              <select
                value={me.objective}
                onChange={(e) =>
                  send({ type: 'identity', objective: e.target.value, doctrine: me.doctrine })
                }
              >
                {Object.entries(OBJECTIVES).map(([key, o]) => (
                  <option key={key} value={key}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">{OBJECTIVES[me.objective].formula}</p>
            <label>
              Política religiosa
              <select
                value={me.doctrine}
                onChange={(e) =>
                  send({ type: 'identity', objective: me.objective, doctrine: e.target.value })
                }
              >
                <option value="tolerant">Tolerância · crenças diferentes não geram revolta</option>
                <option value="devout">
                  Confessional · conversão dá influência, diferenças geram revolta
                </option>
              </select>
            </label>
            <p className="small muted">
              Sua crença oficial: {me.faith}. Política confessional gera +1 de influência por rodada
              para cada província da sua crença.
            </p>
            <button
              className="button primary full"
              disabled={!host || game.players.length < 3}
              onClick={() => send({ type: 'start' })}
            >
              <Flag size={17} />
              {host ? 'Iniciar campanha' : 'Aguardando o anfitrião'}
            </button>
            {host && game.players.length < 3 && (
              <p className="small muted">Adicione pessoas ou bots até completar pelo menos 3.</p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
function StatBar({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="stat-bar">
      <div>
        <span>{label}</span>
        <strong>
          {value}
          <small> / 100</small>
        </strong>
      </div>
      <div className="bar-track">
        <span style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}
function Inspector({
  game,
  me,
  selected,
  send,
  action,
  setAction,
  target,
  setTarget,
}: {
  game: GameView;
  me: Player;
  selected: Province | undefined;
  send: SendAction;
  action: Action;
  setAction: (a: Action) => void;
  target: string;
  setTarget: (id: string) => void;
}) {
  const [amount, setAmount] = useState(1);
  useEffect(() => {
    setAmount(Math.max(1, (selected?.troops ?? 2) - 1));
  }, [selected?.id, selected?.troops]);
  const mine = selected?.ownerId === me.id,
    owner = game.players.find((p) => p.id === selected?.ownerId),
    ResourceIcon = selected ? resourceIcons[selected.resource] : Flag;
  const ownOrder = game.myOrders.find((o) => o.provinceId === selected?.id);
  const order: Order = { provinceId: selected?.id ?? '', action, targetId: target, amount };
  const cost = selected ? orderCost(order, selected) : { gold: 0, manpower: 0, influence: 0 };
  const reserved = game.myOrders
    .filter((o) => o.provinceId !== selected?.id)
    .reduce(
      (sum, o) => {
        const c = orderCost(
          o,
          game.provinces.find((p) => p.id === o.provinceId)!,
        );
        return {
          gold: sum.gold + c.gold,
          manpower: sum.manpower + c.manpower,
          influence: sum.influence + c.influence,
        };
      },
      { gold: 0, manpower: 0, influence: 0 },
    );
  const affordable =
    cost.gold + reserved.gold <= me.gold &&
    cost.manpower + reserved.manpower <= me.manpower &&
    cost.influence + reserved.influence <= me.influence;
  const targets =
    selected?.neighbors
      .map((id) => game.provinces.find((p) => p.id === id)!)
      .filter(
        (p) =>
          !p.ownerId ||
          p.ownerId === me.id ||
          !game.relations.some(
            (r) =>
              ((r.a === me.id && r.b === p.ownerId) || (r.b === me.id && r.a === p.ownerId)) &&
              (r.allied || r.truceUntil >= game.turn),
          ),
      ) ?? [];
  const invalid =
    !mine ||
    me.ready ||
    game.phase !== 'planning' ||
    !affordable ||
    (action === 'move' && (selected!.troops < 2 || !targets.some((p) => p.id === target))) ||
    (action === 'develop' && selected!.development >= 3) ||
    (action === 'train' && selected!.training >= 100) ||
    (action === 'pacify' && selected!.unrest === 0) ||
    (action === 'convert' && selected!.faith === me.faith);
  return (
    <aside className="inspector">
      <div className="inspector-title">
        <span className="eyebrow">INTELIGÊNCIA REGIONAL</span>
        <Compass size={16} />
      </div>
      {selected ? (
        <>
          <div className="province-heading">
            <span className="region-owner" style={{ color: owner?.color }}>
              <Flag size={13} />
              {owner?.nation ?? 'Forças locais'}
            </span>
            <h2>{selected.name}</h2>
            <span className="resource-label">
              <ResourceIcon size={13} />
              {resourceNames[selected.resource]}
            </span>
          </div>
          <div className="province-quickstats">
            <div>
              <Users size={16} />
              <strong>{selected.troops}</strong>
              <span>Tropas</span>
            </div>
            <div>
              <Coins size={16} />
              <strong>{incomeOf(selected)}</strong>
              <span>Renda</span>
            </div>
            <div>
              <Landmark size={16} />
              <strong>{selected.development}/3</strong>
              <span>Nível</span>
            </div>
          </div>
          <div className="province-details">
            <StatBar label="Moral" value={selected.morale} />
            <StatBar label="Treinamento" value={selected.training} color="#80b2a4" />
            <StatBar
              label="Risco de revolta"
              value={selected.unrest}
              color={selected.unrest > 25 ? '#d18c7d' : '#80b2a4'}
            />
            <div className="faith-row">
              <Sun size={14} />
              <span>{selected.faith}</span>
              {selected.conversion > 0 && <small>{selected.conversion}% de conversão</small>}
            </div>
            {game.mode === 'campaign' && (
              <div className="supply-note">
                <Tent size={14} />
                Suprimento: {selected.troops} /{' '}
                {6 + selected.development * 3 + (selected.resource === 'grain' ? 3 : 0)}
              </div>
            )}
          </div>
          {mine ? (
            <div className="province-actions">
              <div className="section-heading">
                <h3>Preparar uma ordem</h3>
                {ownOrder && <span className="tag">PLANEJADA</span>}
              </div>
              <div className="action-grid">
                {Object.entries(ACTIONS).map(([key, a]) => {
                  const Icon = actionIcons[key as Action];
                  return (
                    <button
                      key={key}
                      className={action === key ? 'active' : ''}
                      disabled={me.ready || game.phase !== 'planning'}
                      onClick={() => setAction(key as Action)}
                    >
                      <Icon size={17} />
                      <span>{a.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="action-description">{ACTIONS[action].description}</p>
              {action === 'move' && (
                <>
                  <label>
                    Destino vizinho
                    <select value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Escolha no mapa ou aqui</option>
                      {targets.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} · {p.troops} tropas{' '}
                          {p.ownerId === me.id ? '(seu território)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="range-label">
                    Tropas em marcha <strong>{amount}</strong>
                    <input
                      aria-label="Tropas em marcha"
                      type="range"
                      min={1}
                      max={Math.max(1, selected.troops - 1)}
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      disabled={selected.troops < 2}
                    />
                  </label>
                </>
              )}
              <div className="order-price">
                <span>
                  <Coins size={13} />
                  {cost.gold} ouro
                </span>
                {cost.manpower > 0 && (
                  <span>
                    <Users size={13} />
                    {cost.manpower} reservas
                  </span>
                )}
                {cost.influence > 0 && (
                  <span>
                    <Sparkles size={13} />
                    {cost.influence} influência
                  </span>
                )}
              </div>
              <button
                className="button primary full"
                disabled={invalid}
                onClick={() => send({ type: 'order', order })}
              >
                <Plus size={16} />
                {ownOrder ? 'Substituir ordem' : 'Preparar ordem'}
              </button>
              {me.ready ? (
                <p className="small muted">Ordens confirmadas. Reabra para editar.</p>
              ) : !affordable ? (
                <p className="small warning">
                  Recursos insuficientes, considerando as outras ordens.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="foreign-note">
              <Shield size={22} />
              <p>
                {owner ? 'Território de outro reino.' : 'Região controlada por forças locais.'}{' '}
                Selecione uma província sua e prepare uma marcha para atacar um vizinho.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="empty-inspector">
          <Map size={36} strokeWidth={1} />
          <h3>Cada região conta.</h3>
          <p>Selecione uma província para ver sua economia, crença e exército.</p>
        </div>
      )}
      <div className="orders-section">
        <div className="section-heading">
          <h3>Suas ordens</h3>
          <span className="tag">{game.myOrders.length}</span>
        </div>
        {game.myOrders.length === 0 ? (
          <p className="muted small">
            Uma ordem por província a cada rodada. Recursos são reservados ao planejar e gastos na
            resolução.
          </p>
        ) : (
          game.myOrders.map((o) => {
            const p = game.provinces.find((p) => p.id === o.provinceId)!,
              Icon = actionIcons[o.action];
            return (
              <div className="order-item" key={o.provinceId}>
                <Icon size={15} />
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {ACTIONS[o.action].name}
                    {o.action === 'move'
                      ? ` · ${o.amount} → ${game.provinces.find((p) => p.id === o.targetId)?.name}`
                      : ''}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Cancelar ordem em ${p.name}`}
                  disabled={me.ready || game.phase !== 'planning'}
                  onClick={() => send({ type: 'cancel', provinceId: p.id })}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
function Diplomacy({ game, me, send }: { game: GameView; me: Player; send: SendAction }) {
  const [message, setMessage] = useState('');
  return (
    <div className="content-page">
      <div className="page-eyebrow">TRATADOS & INTERESSES</div>
      <h1>À mesa de negociação.</h1>
      <p className="muted">
        Até duas alianças por reino. Romper um pacto custa influência e moral, e impõe uma trégua
        curta.
      </p>
      {game.offers
        .filter((o) => o.to === me.id)
        .map((o) => (
          <div className="incoming-offer" key={o.id}>
            <Handshake size={22} />
            <div>
              <strong>
                {game.players.find((p) => p.id === o.from)?.nation} propõe uma aliança.
              </strong>
              <span>Vocês não poderão atacar um ao outro durante o pacto.</span>
            </div>
            <button
              className="button primary"
              onClick={() => send({ type: 'answer', offerId: o.id, accept: true })}
            >
              Aceitar
            </button>
            <button
              className="quiet"
              onClick={() => send({ type: 'answer', offerId: o.id, accept: false })}
            >
              Recusar
            </button>
          </div>
        ))}
      <div className="diplomacy-layout">
        <div className="diplomacy-grid">
          {game.players
            .filter((p) => p.id !== me.id)
            .map((p) => {
              const rel = game.relations.find(
                  (r) => (r.a === me.id && r.b === p.id) || (r.b === me.id && r.a === p.id),
                )!,
                pending = game.offers.some(
                  (o) => (o.from === me.id && o.to === p.id) || (o.from === p.id && o.to === me.id),
                );
              return (
                <article className="panel nation-card" key={p.id}>
                  <div className="nation-card-head">
                    <div
                      className="faction-avatar"
                      style={{ '--faction': p.color } as React.CSSProperties}
                    >
                      <Flag size={20} />
                    </div>
                    <span className={`relationship ${rel.allied ? 'allied' : ''}`}>
                      {rel.allied ? 'Aliado' : rel.truceUntil >= game.turn ? 'Trégua' : 'Neutro'}
                    </span>
                  </div>
                  <h2>{p.nation}</h2>
                  <p>
                    {p.name} {p.bot && <Bot size={13} />}
                  </p>
                  <div className="nation-facts">
                    <span>
                      <ObjectiveIcon objective={p.objective} size={14} />
                      {OBJECTIVES[p.objective].name}
                    </span>
                    <span>
                      <Sun size={14} />
                      {p.faith}
                    </span>
                  </div>
                  <div className="trust-meter">
                    <span>Confiança</span>
                    <strong className={rel.trust < 0 ? 'warning' : ''}>
                      {rel.trust > 0 ? '+' : ''}
                      {rel.trust}
                    </strong>
                  </div>
                  {rel.truceUntil >= game.turn && !rel.allied && (
                    <p className="small muted">Trégua até o fim da rodada {rel.truceUntil}.</p>
                  )}
                  <button
                    className={`button ${rel.allied ? 'danger-outline' : 'secondary'} full`}
                    disabled={me.ready || pending || game.phase !== 'planning'}
                    onClick={() => send({ type: rel.allied ? 'break' : 'offer', to: p.id })}
                  >
                    <Handshake size={15} />
                    {rel.allied
                      ? 'Romper aliança'
                      : pending
                        ? 'Proposta pendente'
                        : 'Propor aliança'}
                  </button>
                  {game.hostId === me.id && !p.online && !p.bot && game.phase === 'planning' && (
                    <button
                      className="quiet full"
                      onClick={() => send({ type: 'replaceBot', playerId: p.id })}
                      title="A substituição encerra a sessão desse jogador nesta campanha."
                    >
                      <Bot size={14} /> Substituir ausente por bot
                    </button>
                  )}
                </article>
              );
            })}
        </div>
        <aside className="panel chat-panel">
          <div className="section-heading">
            <h2>
              <MessageCircle size={18} />
              Conselho público
            </h2>
            <span className="tag">AO VIVO</span>
          </div>
          <div className="chat-messages">
            {game.chat.length === 0 ? (
              <div className="chat-empty">
                <ScrollText size={28} />
                <p>Diplomacia começa com uma conversa.</p>
                <small>
                  Todos na sala podem ler. Bots respondem a propostas de aliança, mas não ao chat.
                </small>
              </div>
            ) : (
              game.chat.map((m) => {
                const p = game.players.find((p) => p.id === m.playerId);
                return (
                  <div className="chat-message" key={m.id}>
                    <strong style={{ color: p?.color }}>{p?.name}</strong>
                    <p>{m.text}</p>
                  </div>
                );
              })
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim()) {
                send({ type: 'chat', text: message });
                setMessage('');
              }
            }}
          >
            <input
              placeholder="Uma proposta ao conselho…"
              aria-label="Mensagem ao conselho"
              maxLength={280}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="icon-button" aria-label="Enviar mensagem" disabled={!message.trim()}>
              <Send size={17} />
            </button>
          </form>
          <p className="small muted">
            Acordos no chat são informais. Use os botões para firmar alianças nas regras.
          </p>
        </aside>
      </div>
    </div>
  );
}
function Chronicle({ game }: { game: GameView }) {
  return (
    <div className="content-page">
      <div className="page-eyebrow">REGISTROS DA CAMPANHA</div>
      <h1>O peso das decisões.</h1>
      <div className="chronicle-layout">
        <section className="panel ranking">
          <h2>Legados em disputa</h2>
          {[...game.players]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <div className="ranking-row" key={p.id}>
                <span className="rank">{i + 1}</span>
                <div className="rank-info">
                  <strong style={{ color: p.color }}>{p.nation}</strong>
                  <span>{OBJECTIVES[p.objective].name}</span>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${Math.min(100, (p.score / game.targetScore) * 100)}%`,
                        background: p.color,
                      }}
                    />
                  </div>
                </div>
                <strong>
                  {p.score}
                  <small>/{game.targetScore}</small>
                </strong>
              </div>
            ))}
          <p className="small muted">
            A pontuação é verificada após resolver cada rodada. No limite de rodadas, vence o maior
            legado; empates usam território, ouro e identificador da sessão.
          </p>
        </section>
        <section className="panel chronicle-feed">
          <h2>Crônica</h2>
          {[...game.log].reverse().map((entry) => {
            const Icon =
              entry.kind === 'battle'
                ? Swords
                : entry.kind === 'diplomacy'
                  ? Handshake
                  : entry.kind === 'economy'
                    ? Coins
                    : ScrollText;
            return (
              <div className={`log-entry ${entry.kind}`} key={entry.id}>
                <div className="log-icon">
                  <Icon size={16} />
                </div>
                <div>
                  <small>RODADA {entry.turn}</small>
                  <p>{entry.text}</p>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
function Rules({ game }: { game: GameView }) {
  return (
    <div className="content-page rules-page">
      <div className="page-eyebrow">O MANUAL DO CONSELHO</div>
      <h1>
        Fácil de começar.
        <br />
        <em>Difícil de governar.</em>
      </h1>
      <p className="muted">
        Protótipo para explorar decisões de guerra, economia e diplomacia. Números e assimetrias
        históricas ainda precisam de partidas de teste.
      </p>
      <div className="rules-grid">
        <article className="panel">
          <Clock3 />
          <h2>Uma rodada, muitas decisões</h2>
          <p>
            Prepare até uma ordem por província. Todos planejam ao mesmo tempo; a rodada resolve
            quando todos confirmam ou quando o cronômetro termina. Na demonstração, você controla o
            ritmo.
          </p>
          <p>
            Ações locais e partidas de tropas acontecem antes das chegadas. Iniciativa de marchas é
            sorteada por rodada no servidor; a velocidade da conexão não decide a ordem.
          </p>
        </article>
        <article className="panel">
          <Coins />
          <h2>O reino precisa se pagar</h2>
          <p>
            Regiões geram de 3 a 6 de renda base, reduzida pela revolta. Cada nível de
            desenvolvimento acrescenta 2 à base. A manutenção custa 1 ouro para cada 3 tropas,
            arredondado para cima no total do reino.
          </p>
          <p>
            Recrutar custa 9 ouro e 3 reservas, criando 3 tropas. Reservas e influência se recuperam
            a cada rodada. Falta de dinheiro reduz a moral.
          </p>
        </article>
        <article className="panel">
          <Swords />
          <h2>Números não vencem sozinhos</h2>
          <p>
            Força = tropas × (0,65 + moral × 0,006) × (0,8 + treinamento × 0,005). Defesa recebe 12%
            de bônus; o atacante varia de −7% a +7%.
          </p>
          <p>
            Deixe ao menos 1 tropa na origem. Tropas marcham apenas para vizinhas. Novos recrutas
            diluem o treinamento do exército. A crônica registra os resultados.
          </p>
        </article>
        <article className="panel">
          <Sun />
          <h2>Integração, crença e revolta</h2>
          <p>
            Conquistar acrescenta 35 de revolta. Pacificação reduz 25; até 25, a região é estável. A
            partir de 85, ocorre uma rebelião. Duas missões mudam a crença local, mas cada uma gera
            6 de revolta.
          </p>
          <p>
            Tolerância reduz tensões entre crenças. Política confessional ganha influência nas
            regiões da crença oficial e gera revolta nas demais. Todas as religiões usam as mesmas
            regras abstratas.
          </p>
        </article>
        <article className="panel">
          <Handshake />
          <h2>Pactos têm consequências</h2>
          <p>
            Alianças exigem aceitação e impedem ataques entre os envolvidos. Cada reino tem até
            duas. Bots aceitam se a confiança for zero ou positiva.
          </p>
          <p>
            Romper custa 4 de influência, 10 de moral em suas províncias e 50 de confiança com o
            ex-aliado. Há trégua na rodada atual e na seguinte.
          </p>
        </article>
        <article className="panel">
          <Tent />
          <h2>Dois ritmos de campanha</h2>
          <p>
            Rápido: 20 rodadas de até 3 minutos, vitória a 16 pontos. Campanha: 40 rodadas de até 6
            minutos, vitória a 28 pontos.
          </p>
          <p>
            Na Campanha, suprimento local = 6 + 3 por nível + 3 em terras agrícolas. Tropas
            excedentes perdem 3 de moral cada. Combates aumentam desgaste em 10; paz reduz 6. Cada
            20 de desgaste gera 1 de revolta por rodada.
          </p>
          <span className="tag">ATUAL: {game.mode === 'quick' ? 'RÁPIDO' : 'CAMPANHA'}</span>
        </article>
      </div>
      <h2 className="victory-heading">Quatro maneiras de deixar sua marca</h2>
      <div className="victory-rules">
        {Object.entries(OBJECTIVES).map(([key, o]) => (
          <article key={key}>
            <ObjectiveIcon objective={key as Objective} />
            <h3>{o.name}</h3>
            <p>{o.formula}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
function Game({
  game,
  me,
  send,
  leave,
  status,
}: {
  game: GameView;
  me: Player;
  send: SendAction;
  leave: () => void;
  status: string;
}) {
  const [page, setPage] = useState<'map' | 'diplomacy' | 'chronicle' | 'rules'>('map'),
    [selectedId, setSelectedId] = useState(''),
    [action, setAction] = useState<Action>('recruit'),
    [target, setTarget] = useState(''),
    [copied, setCopied] = useState(false);
  const eco = economyOf(game.provinces, me.id),
    selected = game.provinces.find((p) => p.id === selectedId),
    ownObjective = OBJECTIVES[me.objective];
  const readyCount = game.players.filter((p) => p.ready || p.bot).length;
  useEffect(() => {
    if (!selectedId)
      setSelectedId(
        game.provinces.find((p) => p.ownerId === me.id && p.capital)?.id ??
          game.provinces.find((p) => p.ownerId === me.id)?.id ??
          '',
      );
  }, [me.id, game.code, selectedId, game.provinces]);
  const reserved = useMemo(
    () =>
      game.myOrders.reduce(
        (n, o) =>
          n +
          orderCost(
            o,
            game.provinces.find((p) => p.id === o.provinceId)!,
          ).gold,
        0,
      ),
    [game.myOrders, game.provinces],
  );
  const winner = game.players.find((p) => p.id === game.winnerId),
    alive = eco.owned.length > 0;
  function select(p: Province) {
    if (action === 'move' && selected?.ownerId === me.id && selected.neighbors.includes(p.id))
      setTarget(p.id);
    else {
      setSelectedId(p.id);
      setTarget('');
    }
  }
  return (
    <div className="game-shell">
      <aside className="sidebar">
        <Brand compact />
        <div className="sidebar-campaign">
          <span className="eyebrow">CAMPANHA EUROPEIA</span>
          <div>
            <span className="status-dot online" />
            {game.mode === 'quick' ? 'Partida rápida' : 'Grande campanha'}
          </div>
          <small>Europa · c. 1550</small>
        </div>
        <nav aria-label="Navegação principal">
          {(
            [
              { id: 'map', label: 'Mapa do mundo', Icon: Map },
              { id: 'diplomacy', label: 'Diplomacia', Icon: Handshake },
              { id: 'chronicle', label: 'Crônica e legados', Icon: ScrollText },
              { id: 'rules', label: 'Como jogar', Icon: BookOpen },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
              <Icon size={18} />
              {label}
              {id === 'diplomacy' && game.offers.some((o) => o.to === me.id) && (
                <span className="notification-dot" />
              )}
              {page === id && <ChevronRight size={13} className="nav-chevron" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-nation">
          <div className="sidebar-nation-top">
            <div
              className="faction-avatar"
              style={{ '--faction': me.color } as React.CSSProperties}
            >
              <Crown size={21} />
            </div>
            <div>
              <strong>{me.nation}</strong>
              <small>{me.name}</small>
            </div>
          </div>
          <div className="realm-facts">
            <span>
              <Flag size={13} />
              {eco.owned.length} regiões
            </span>
            <span>
              <Users size={13} />
              {eco.owned.reduce((n, p) => n + p.troops, 0)} tropas
            </span>
          </div>
          <div className="faith-policy">
            <Sun size={13} />
            {me.faith}
            <small>{me.doctrine === 'tolerant' ? 'Tolerância' : 'Confessional'}</small>
          </div>
          {game.mode === 'campaign' && (
            <div className="war-fatigue">
              Desgaste de guerra <strong>{me.warExhaustion}%</strong>
            </div>
          )}
        </div>
        <div className="sidebar-objective">
          <div className="eyebrow">SEU LEGADO</div>
          <div>
            <ObjectiveIcon objective={me.objective} />
            <h3>{ownObjective.name}</h3>
          </div>
          <p>{ownObjective.description}</p>
          <div className="legacy-score">
            <strong>
              {me.score}
              <small> / {game.targetScore}</small>
            </strong>
            <span>PONTOS</span>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.min(100, (me.score / game.targetScore) * 100)}%` }} />
          </div>
        </div>
        <div className="sidebar-bottom">
          <span>
            <span className={`status-dot ${status === 'online' ? 'online' : ''}`} />
            {status === 'online'
              ? 'Conectado'
              : status === 'connecting'
                ? 'Reconectando…'
                : 'Desconectado'}
          </span>
          <button className="quiet tiny" onClick={leave}>
            <LogOut size={14} />
            Sair da sala
          </button>
        </div>
      </aside>
      <main className="game-main">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              {['PRIMAVERA', 'VERÃO', 'OUTONO', 'INVERNO'][(game.turn - 1) % 4]} DE{' '}
              {1550 + Math.floor((game.turn - 1) / 4)}
            </span>
            <h2>
              Rodada {String(game.turn).padStart(2, '0')} <span>/ {game.maxTurns}</span>
            </h2>
          </div>
          <div className="treasury">
            <div>
              <Coins size={19} />
              <strong>
                {me.gold}
                <small>OURO</small>
              </strong>
              <span className={eco.net >= 0 ? 'positive' : 'warning'}>
                {eco.net >= 0 ? '+' : ''}
                {eco.net}/rod.
              </span>
            </div>
            <div>
              <Users size={18} />
              <strong>
                {me.manpower}
                <small>RESERVAS</small>
              </strong>
            </div>
            <div>
              <Sparkles size={18} />
              <strong>
                {me.influence}
                <small>INFLUÊNCIA</small>
              </strong>
            </div>
          </div>
          <button
            className="room-code"
            onClick={() => {
              navigator.clipboard
                ?.writeText(game.code)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
                .catch(() => {});
            }}
            aria-label={`Código da sala ${game.code}`}
          >
            <span>SALA</span>
            <strong>{game.code}</strong>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </header>
        {game.phase === 'finished' && (
          <div className="victory-banner">
            <Crown size={29} />
            <div>
              <strong>
                {winner ? `${winner.nation} escreveu seu legado.` : 'A campanha chegou ao fim.'}
              </strong>
              <span>
                {winner
                  ? `${winner.score} pontos · ${OBJECTIVES[winner.objective].name}`
                  : 'Todos os reinos perderam seus territórios.'}{' '}
                Confira os resultados na crônica.
              </span>
            </div>
            <button className="button secondary" onClick={() => setPage('chronicle')}>
              Ver resultados
            </button>
            <button className="quiet" onClick={leave}>
              Nova campanha
              <ArrowRight size={15} />
            </button>
          </div>
        )}
        {page === 'map' ? (
          <>
            <div className="board-heading">
              <div>
                <div className="page-eyebrow">O TABULEIRO DA HISTÓRIA</div>
                <h1>Um reino. Muitas escolhas.</h1>
                <p>Expanda com propósito. A paz também constrói um império.</p>
              </div>
              <span className="phase-pill">
                <span className="pulse-dot" />
                {game.phase === 'finished'
                  ? 'Campanha encerrada'
                  : me.ready
                    ? 'Ordens confirmadas'
                    : 'Fase de ordens'}
              </span>
            </div>
            <div className="board-layout">
              <div className="board-center">
                <div className="map-frame">
                  <Atlas
                    provinces={game.provinces}
                    players={game.players}
                    selectedId={selectedId}
                    onSelect={select}
                    orders={game.myOrders}
                    moveTargets={
                      action === 'move' && selected?.ownerId === me.id ? selected.neighbors : []
                    }
                  />
                </div>
                <div className="map-legend">
                  {game.players.map((p) => (
                    <span key={p.id}>
                      <i style={{ background: p.color }} />
                      {p.nation}
                      {p.id === me.id ? ' (você)' : ''}
                    </span>
                  ))}
                  <span>
                    <i className="neutral-key" />
                    Forças locais
                  </span>
                </div>
                <div className="economy-strip">
                  <div>
                    <TrendingUp size={17} />
                    <span>
                      Receita prevista
                      <strong>
                        {eco.income} <small>ouro</small>
                      </strong>
                    </span>
                  </div>
                  <div>
                    <Tent size={17} />
                    <span>
                      Manutenção
                      <strong>
                        −{eco.upkeep} <small>ouro</small>
                      </strong>
                    </span>
                  </div>
                  <div>
                    <ScrollText size={17} />
                    <span>
                      Ordens reservadas
                      <strong>
                        {reserved} <small>ouro</small>
                      </strong>
                    </span>
                  </div>
                  <div>
                    <Leaf size={17} />
                    <span>
                      Paz consecutiva
                      <strong>
                        {me.peaceTurns} <small>rodadas</small>
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="turn-controls">
                  <div>
                    <div className="ready-avatars">
                      {game.players.map((p) => (
                        <span
                          key={p.id}
                          title={`${p.nation}: ${p.ready || p.bot ? 'pronto' : 'planejando'}`}
                          style={{ borderColor: p.color, color: p.color }}
                        >
                          {p.ready || p.bot ? <Check size={11} /> : p.name.slice(0, 1)}
                        </span>
                      ))}
                    </div>
                    <strong>
                      {readyCount} de {game.players.length} prontos
                    </strong>
                    <Countdown deadline={game.deadline} demo={game.demo} />
                  </div>
                  <button
                    className={`button ${me.ready ? 'secondary' : 'primary'}`}
                    disabled={game.phase !== 'planning' || !alive || status !== 'online'}
                    onClick={() => send({ type: 'ready', ready: !me.ready })}
                  >
                    {me.ready ? (
                      <>
                        <ScrollText size={17} />
                        Reabrir ordens
                      </>
                    ) : (
                      <>
                        <CheckCheck size={18} />
                        Confirmar ordens
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </div>
                {!alive && (
                  <div className="spectator-note">
                    <Flag size={16} />
                    Você perdeu seus territórios. Continue acompanhando a campanha e o conselho.
                  </div>
                )}
                <div className="latest-event">
                  <ScrollText size={14} />
                  <span>{game.log.at(-1)?.text}</span>
                  <button className="quiet tiny" onClick={() => setPage('chronicle')}>
                    Ver crônica
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
              <Inspector
                game={game}
                me={me}
                selected={selected}
                send={send}
                action={action}
                setAction={(a) => {
                  setAction(a);
                  setTarget('');
                }}
                target={target}
                setTarget={setTarget}
              />
            </div>
          </>
        ) : page === 'diplomacy' ? (
          <Diplomacy game={game} me={me} send={send} />
        ) : page === 'chronicle' ? (
          <Chronicle game={game} />
        ) : (
          <Rules game={game} />
        )}
        <footer className="game-footer">
          <span>CONCÓRDIA · PROTÓTIPO 0.1</span>
          <button className="quiet tiny" onClick={() => setPage('rules')}>
            <CircleHelp size={13} />
            As regras do jogo
          </button>
          <span>Ordens privadas · resolução no servidor</span>
        </footer>
      </main>
    </div>
  );
}
export default function App() {
  const { game, playerId, status, error, setError, send, leave } = useGame();
  const me = game?.players.find((p) => p.id === playerId);
  return (
    <>
      {game && me ? (
        game.phase === 'lobby' ? (
          <Lobby game={game} me={me} send={send} leave={leave} />
        ) : (
          <Game key={game.code} game={game} me={me} send={send} leave={leave} status={status} />
        )
      ) : (
        <Landing send={send} status={status} />
      )}
      <div className="toast-region" aria-live="polite">
        {error && (
          <div className="toast" role="alert">
            <Shield size={18} />
            <span>{error}</span>
            <button aria-label="Fechar aviso" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
