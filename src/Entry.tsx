import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  Clock3,
  Crown,
  Flag,
  LogOut,
  Plus,
  ScrollText,
  Shield,
  Users,
} from 'lucide-react';
import Atlas from './Atlas';
import { makeMap } from '../shared/map';
import { FACTIONS, OBJECTIVES } from '../shared/types';
import type { ClientMessage, GameMode, GameView, Objective, Player } from '../shared/types';
import { Brand, type Command } from './ui';

const preview = makeMap().map((p, i) => ({
  ...p,
  ownerId: i % 7 === 0 ? null : FACTIONS[Math.floor(p.col / 2)].nation,
  troops: 2 + ((i * 7) % 10),
  pacification: 100,
  capital: [16, 11, 3, 21].includes(i),
}));
const factions = FACTIONS.map((f) => ({ ...f, id: f.nation }));
export function Entry({ send, status }: { send: (m: ClientMessage) => void; status: string }) {
  const [intent, setIntent] = useState<'create' | 'join' | null>(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [objective, setObjective] = useState<Objective>('conquest'),
    [mode, setMode] = useState<GameMode>('quick');
  function enter(demo = false) {
    if (intent === 'join' && !demo)
      send({ type: 'join', code, name: name.trim() || 'Estrategista', objective });
    else send({ type: 'create', name: name.trim() || 'Estrategista', objective, mode, demo });
  }
  return (
    <div className="entry-screen">
      <Atlas provinces={preview} players={factions} mode="POLITICAL" preview />
      <div className="entry-vignette" />
      <header className="entry-top">
        <Brand />
        <span className="version-tag">
          <i className={status === 'online' ? 'connected' : ''} />
          {status === 'online' ? 'PROTÓTIPO 0.2' : 'CONECTANDO'}
        </span>
      </header>
      <section className="entry-content">
        <div className="eyebrow">EUROPA · ANNO DOMINI 1550</div>
        <h1>
          Governar é<br />
          <em>escolher o preço.</em>
        </h1>
        <p>
          Conquiste com cautela. Sustente seus exércitos.
          <br />A fé move fronteiras; os pactos decidem quem fica.
        </p>
        <div className="entry-specs">
          <span>
            <Users size={15} />
            3–8 jogadores
          </span>
          <span>
            <Clock3 size={15} />
            Ordens simultâneas
          </span>
          <span>
            <Shield size={15} />
            Quatro legados
          </span>
        </div>
        <button
          className="button primary large"
          disabled={status !== 'online'}
          onClick={() => enter(true)}
        >
          Jogar demonstração
          <ArrowRight size={17} />
        </button>
        <div className="entry-secondary">
          <button
            className="button outline"
            disabled={status !== 'online'}
            onClick={() => setIntent('create')}
          >
            Criar uma sala
          </button>
          <button
            className="button outline"
            disabled={status !== 'online'}
            onClick={() => setIntent('join')}
          >
            Entrar na campanha
          </button>
        </div>
        <small>
          Experimente contra três conselhos controlados por bots.
          <br />
          Rápido: até 20 rodadas · Campanha: até 40 rodadas
        </small>
      </section>
      <div className="entry-bottom">
        <span>UM TABULEIRO. MUITAS FORMAS DE VENCER.</span>
        <span>Mapa histórico esquemático · regras experimentais</span>
      </div>
      {intent && (
        <div className="modal-scrim">
          <form
            className="game-modal entry-modal"
            onSubmit={(e) => {
              e.preventDefault();
              enter();
            }}
          >
            <button
              type="button"
              className="window-close"
              aria-label="Fechar"
              onClick={() => setIntent(null)}
            >
              ×
            </button>
            <div className="eyebrow">O CONSELHO AGUARDA</div>
            <h2>{intent === 'join' ? 'Entre na campanha' : 'Uma nova era'}</h2>
            <label>
              Como devemos chamar você?
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder="Seu nome"
                required
              />
            </label>
            {intent === 'join' ? (
              <label>
                Código da sala
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="A3F021"
                  required
                />
              </label>
            ) : (
              <div className="mode-choice">
                <button
                  className={mode === 'quick' ? 'active' : ''}
                  type="button"
                  onClick={() => setMode('quick')}
                >
                  <Clock3 />
                  <strong>Rápido</strong>
                  <small>20 rodadas · 3 min/rodada</small>
                </button>
                <button
                  className={mode === 'campaign' ? 'active' : ''}
                  type="button"
                  onClick={() => setMode('campaign')}
                >
                  <ScrollText />
                  <strong>Campanha</strong>
                  <small>40 rodadas · 7,5 min/rodada</small>
                </button>
              </div>
            )}
            <label>
              Legado de preferência
              <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
                {Object.entries(OBJECTIVES).map(([id, o]) => (
                  <option key={id} value={id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              {OBJECTIVES[objective].description} Você pode vencer por qualquer um dos quatro
              caminhos.
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
export function Lobby({
  game,
  me,
  command,
  leave,
}: {
  game: GameView;
  me: Player;
  command: Command;
  leave: () => void;
}) {
  const host = game.hostId === me.id;
  return (
    <div className="lobby-screen">
      <Atlas provinces={preview} players={factions} mode="POLITICAL" preview />
      <div className="lobby-vignette" />
      <header className="entry-top">
        <Brand />
        <button className="button ghost" onClick={leave}>
          <LogOut size={15} />
          Voltar
        </button>
      </header>
      <main className="lobby-window glass">
        <header>
          <div>
            <div className="eyebrow">CONSELHO DE GUERRA</div>
            <h1>Reúna o conselho.</h1>
            <p>Todos acessam o mesmo servidor. Compartilhe o código da sala.</p>
          </div>
          <div className="room-invite">
            <small>CÓDIGO DA SALA</small>
            <strong>{game.code}</strong>
            <span>{game.players.length} / 8 participantes</span>
          </div>
        </header>
        <div className="lobby-body">
          <section>
            <h2>
              <Crown size={18} />
              Assentos do conselho
            </h2>
            <div className="lobby-players">
              {game.players.map((p) => (
                <div className="lobby-player" key={p.id}>
                  <span className="nation-shield" style={{ color: p.color, borderColor: p.color }}>
                    <Flag size={18} />
                  </span>
                  <div>
                    <strong>
                      {p.name}
                      {p.id === me.id && <small> VOCÊ</small>}
                    </strong>
                    <span>
                      {p.nation} · {OBJECTIVES[p.objective].name}
                    </span>
                  </div>
                  <small className="player-status">
                    {p.bot ? (
                      <Bot size={15} />
                    ) : p.online ? (
                      <Check size={15} />
                    ) : (
                      <Clock3 size={15} />
                    )}{' '}
                    {p.id === game.hostId
                      ? 'Anfitrião'
                      : p.bot
                        ? 'Bot'
                        : p.online
                          ? 'Pronto para entrar'
                          : 'Ausente'}
                  </small>
                  {host && !p.bot && !p.online && (
                    <button
                      className="icon-button"
                      aria-label={`Substituir ${p.name} por bot`}
                      onClick={() => command({ type: 'REPLACE_WITH_BOT', playerId: p.id })}
                    >
                      <Bot size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {host && game.players.length < 8 && (
              <button className="button outline full" onClick={() => command({ type: 'ADD_BOT' })}>
                <Plus size={16} />
                Adicionar bot
              </button>
            )}
            <p className="lobby-help">
              <Users size={16} />
              São necessários pelo menos 3 participantes. Bots completam os assentos livres.
            </p>
          </section>
          <aside>
            <label>
              Formato
              <select
                disabled={!host}
                value={game.mode}
                onChange={(e) => command({ type: 'SET_MODE', mode: e.target.value as GameMode })}
              >
                <option value="quick">Rápido · até 60 minutos</option>
                <option value="campaign">Campanha · alvo de 3–5 horas</option>
              </select>
            </label>
            <p className="small muted">
              {game.maxTurns} rodadas de até {game.turnSeconds / 60} minutos. O tempo de jogo
              depende das decisões do grupo.
            </p>
            <label>
              Legado de preferência
              <select
                value={me.objective}
                onChange={(e) =>
                  command({
                    type: 'SET_IDENTITY',
                    objective: e.target.value as Objective,
                    doctrine: me.doctrine,
                  })
                }
              >
                {Object.entries(OBJECTIVES).map(([id, o]) => (
                  <option value={id} key={id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Política religiosa
              <select
                value={me.doctrine}
                onChange={(e) =>
                  command({
                    type: 'SET_IDENTITY',
                    objective: me.objective,
                    doctrine: e.target.value as Player['doctrine'],
                  })
                }
              >
                <option value="tolerant">Tolerante</option>
                <option value="devout">Confessional</option>
              </select>
            </label>
            <p className="small muted">
              Religião estatal: {me.faith}. Política confessional gera influência adicional nas
              províncias da sua fé.
            </p>
            <button
              className="button primary full"
              disabled={!host || game.players.length < 3}
              onClick={() => command({ type: 'START_GAME' })}
            >
              <Flag size={16} />
              {host ? 'Iniciar campanha' : 'Aguardando anfitrião'}
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
