import PlayerNameForm from './PlayerNameForm';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Crown,
  Globe2,
  Handshake,
  Plus,
  Ship,
  Swords,
  Users,
} from 'lucide-react';
import type {
  ClientMessage,
  GameMode,
  GameView,
  NationId,
  Theater,
  PublicRoom,
} from '../shared/types';
import { CONTINENTS, makeMap, THEATERS } from '../shared/map';
import { NATIONS, RELIGIONS } from '../shared/rules';
import Atlas from './Atlas';
import { Brand, CoatOfArms, type Command } from './ui';
const world = makeMap();
export function NationCards({
  selected,
  onSelect,
  taken = [],
}: {
  selected: NationId;
  onSelect: (id: NationId) => void;
  taken?: NationId[];
}) {
  return (
    <div className="nation-grid">
      {NATIONS.map((n) => (
        <button
          type="button"
          key={n.id}
          className={`nation-card ${selected === n.id ? 'selected' : ''}`}
          disabled={taken.includes(n.id)}
          aria-pressed={selected === n.id}
          onClick={() => onSelect(n.id)}
          title={n.ideas.join(' · ')}
        >
          <CoatOfArms nationId={n.id} />
          <div>
            <strong>{n.name}</strong>
            <small>{RELIGIONS[n.religion].name}</small>
            <span>{n.ideas[0]}</span>
            <span>{n.ideas[1]}</span>
          </div>
          {selected === n.id && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}
export function Entry({
  send,
  online,
  onHelp,
  onTutorial,
}: {
  send: (message: ClientMessage) => void;
  online: boolean;
  onHelp: () => void;
  onTutorial: () => void;
}) {
  const [form, setForm] = useState<'create' | 'join' | null>(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [mode, setMode] = useState<GameMode>('quick'),
    [theater, setTheater] = useState<Theater>('EUROPE'),
    [nationId, setNation] = useState<NationId>('vespera'),
    [roomName, setRoomName] = useState(''),
    [isPublic, setPublic] = useState(true),
    [secrets, setSecrets] = useState(true),
    [botSecrets, setBotSecrets] = useState(false),
    [timer, setTimer] = useState(60),
    [rooms, setRooms] = useState<PublicRoom[]>([]),
    [browserError, setBrowserError] = useState('');
  const refresh = async () => {
    try {
      const r = await fetch('/api/rooms');
      if (!r.ok) throw new Error();
      setRooms((await r.json()) as PublicRoom[]);
      setBrowserError('');
    } catch {
      setBrowserError('Não foi possível carregar as salas.');
    }
  };
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <main className="entry-viewport">
      <Atlas provinces={world} players={[]} mode="POLITICAL" preview />
      <div className="entry-shade" />
      <header className="entry-header">
        <Brand />
        <span className="edition">
          PRÉVIA <i /> 0.95
        </span>
        <button className="quiet-button" onClick={onHelp}>
          Como jogar <ArrowRight size={14} />
        </button>
      </header>
      <div className={`entry-content ${form ? 'with-form' : ''}`}>
        <section className="hero-copy">
          <span className="eyebrow">NAÇÕES, CRISES & OBJETIVOS SECRETOS</span>
          <h1>
            O mundo é vasto.
            <br />
            <em>Seu legado,</em>
            <br />
            uma escolha.
          </h1>
          <p>
            Conduza uma nação entre pólvora e diplomacia. Comande exércitos, cruze oceanos e decida
            o futuro do conselho.
          </p>
          <div className="hero-facts">
            <span>
              <Users size={15} />
              3–8 estrategistas
            </span>
            <span>
              <Globe2 size={15} />
              Um mundo orgânico
            </span>
            <span>
              <Handshake size={15} />
              Ordens simultâneas
            </span>
          </div>
          {!form && (
            <div className="entry-actions">
              <button className="tutorial-entry-button" disabled={!online} onClick={onTutorial}>
                🎓 Tutorial Rápido (5 Passos)
              </button>
              <button className="primary" disabled={!online} onClick={() => setForm('create')}>
                Criar uma sala <ArrowRight size={17} />
              </button>
              <button onClick={() => setForm('join')} disabled={!online}>
                Entrar na campanha
              </button>
              <button
                className="text-button"
                disabled={!online}
                onClick={() =>
                  send({
                    type: 'create',
                    name: 'Estrategista',
                    mode: 'quick',
                    theater: 'EUROPE',
                    nationId: 'vespera',
                    demo: true,
                  })
                }
              >
                Jogar demonstração <span>VOCÊ + 3 BOTS</span>
              </button>
            </div>
          )}
          <div className="hero-victories">
            <div>
              <Swords size={19} />
              <span>
                Dominação Total<small>Subjugue os rivais ou governe 75% das terras.</small>
              </span>
            </div>
            <div>
              <Crown size={19} />
              <span>
                Objetivos Secretos<small>Escolha seu legado. Partidas sem limite de rodadas.</small>
              </span>
            </div>
          </div>
        </section>
        {form && (
          <form
            className="entry-form framed-panel"
            onSubmit={(event) => {
              event.preventDefault();
              send(
                form === 'create'
                  ? {
                      type: 'create',
                      name: name.trim() || 'Estrategista',
                      mode,
                      theater,
                      nationId,
                      roomName: roomName.trim() || `Campanha de ${name.trim() || 'Estrategista'}`,
                      isPublic,
                      enableSecretObjectives: secrets,
                      allowBotSecretVictory: botSecrets,
                      turnTimerSeconds: timer,
                    }
                  : {
                      type: 'join',
                      name: name.trim() || 'Convidado',
                      code: code.trim().toUpperCase(),
                    },
              );
            }}
          >
            <div className="section-heading">
              <span className="eyebrow">
                {form === 'create' ? 'FUNDE SEU CONSELHO' : 'O CONSELHO AGUARDA'}
              </span>
              <button type="button" className="text-button" onClick={() => setForm(null)}>
                Voltar
              </button>
            </div>
            <h2>{form === 'create' ? 'Uma nova campanha.' : 'Reivindique seu lugar.'}</h2>
            <label>
              Como devemos chamar você?
              <input
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="nickname"
              />
            </label>
            {form === 'join' ? (
              <>
                <label>
                  Código da sala
                  <input
                    required
                    value={code}
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="A3F021"
                    className="code-input"
                  />
                </label>
                <p className="muted">
                  A nação poderá ser escolhida no conselho, antes do início da campanha.
                </p>
              </>
            ) : (
              <>
                <label>
                  Nome da sala
                  <input
                    value={roomName}
                    maxLength={60}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Minha campanha"
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setPublic(e.target.checked)}
                  />
                  Sala pública (aparece na lista)
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={secrets}
                    onChange={(e) => setSecrets(e.target.checked)}
                  />
                  Ativar Objetivos Secretos (Estilo War)
                </label>
                <label>
                  Timer após o primeiro pronto (segundos)
                  <input
                    type="number"
                    min={15}
                    max={600}
                    value={timer}
                    onChange={(e) => setTimer(Number(e.target.value))}
                  />
                </label>
                <details>
                  <summary>Opções avançadas</summary>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={botSecrets}
                      onChange={(e) => setBotSecrets(e.target.checked)}
                    />
                    Permitir vitória secreta de bots
                  </label>
                  <p className="fine-print">
                    Desativado por padrão; bots continuam podendo vencer por dominação.
                  </p>
                </details>
                <div className="mode-choices">
                  <button
                    type="button"
                    aria-pressed={mode === 'quick'}
                    onClick={() => setMode('quick')}
                    className={mode === 'quick' ? 'selected' : ''}
                  >
                    <Swords size={18} />
                    <strong>Teatro continental</strong>
                    <small>16 terras · escala rápida</small>
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'campaign'}
                    onClick={() => setMode('campaign')}
                    className={mode === 'campaign' ? 'selected' : ''}
                  >
                    <Globe2 size={18} />
                    <strong>Campanha mundial</strong>
                    <small>56 terras · campanha extensa</small>
                  </button>
                </div>
                {mode === 'quick' && (
                  <label>
                    Teatro da partida
                    <select value={theater} onChange={(e) => setTheater(e.target.value as Theater)}>
                      {THEATERS.map((t) => (
                        <option key={t} value={t}>
                          {CONTINENTS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="field-heading">
                  Sua nação <span>8 estilos de jogo exclusivos</span>
                </div>
                <NationCards selected={nationId} onSelect={setNation} />
              </>
            )}
            <button type="submit" className="primary" disabled={!online}>
              {form === 'create' ? 'Reunir o conselho' : 'Entrar na sala'}
              <ArrowRight size={16} />
            </button>
          </form>
        )}
      </div>
      <section className="server-browser framed-panel">
        <div className="section-heading">
          <h2>🌐 Salas Abertas (Server Browser)</h2>
          <button onClick={() => void refresh()}>Atualizar salas</button>
        </div>
        {browserError && <p role="status">{browserError}</p>}
        {rooms.length === 0 ? (
          <p>Nenhuma sala pública aberta. Crie a primeira campanha.</p>
        ) : (
          rooms.map((r) => (
            <article key={r.roomId}>
              <div>
                <strong>{r.roomName}</strong>
                <small>
                  {r.hostName} · {r.theater} · {r.playersCount}/{r.maxPlayers} ·{' '}
                  {r.enableSecretObjectives ? '🎯 Objetivos secretos' : 'Dominação'} ·{' '}
                  {r.status === 'LOBBY' ? 'No lobby' : `Em jogo · rodada ${r.turn}`}
                </small>
              </div>
              <button
                disabled={!online || r.status !== 'LOBBY' || r.playersCount >= r.maxPlayers}
                onClick={() =>
                  send({ type: 'join', code: r.roomId, name: name.trim() || 'Convidado' })
                }
              >
                Entrar na Sala
              </button>
            </article>
          ))
        )}
      </section>
      <footer className="entry-footer">
        <span>
          <i className={online ? 'status-dot' : 'status-dot offline'} />
          {online ? 'Conselho disponível' : 'Conectando ao conselho…'}
        </span>
        <span>1550 · O ALVORECER DE UMA NOVA ORDEM</span>
        <span>Natural Earth · cartografia de domínio público</span>
      </footer>
    </main>
  );
}
export function Lobby({
  game,
  playerId,
  command,
  leave,
}: {
  game: GameView;
  playerId: string;
  command: Command;
  leave: () => void;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    host = game.hostId === playerId;
  const taken = game.players.filter((p) => p.id !== playerId).map((p) => p.nationId);
  const map = useMemo(() => game.provinces, [game.matchConfig.mapId]);
  return (
    <main className="lobby-viewport">
      <Atlas provinces={map} players={game.players} mode="POLITICAL" preview />
      <div className="entry-shade" />
      <header className="entry-header">
        <Brand />
        <button className="quiet-button" onClick={leave}>
          Sair do conselho
        </button>
      </header>
      <div className="lobby-panel framed-panel">
        <section className="lobby-council">
          <span className="eyebrow">SALA DE GUERRA</span>
          <h1>Reúna o conselho.</h1>
          <div className="room-invite">
            <small>CÓDIGO DA SALA</small>
            <strong>{game.code}</strong>
            <span>{game.players.length} / 8 lugares ocupados</span>
          </div>
          <PlayerNameForm name={me.name} command={command} />
          <div className="council-list">
            {game.players.map((p) => (
              <div className="council-seat" key={p.id} data-player-seat={p.id}>
                <CoatOfArms nationId={p.nationId} size={26} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === game.hostId && <Crown size={12} />}
                  </strong>
                  <small>
                    {p.nation} · {p.bot ? 'Conselho autônomo' : p.online ? 'Presente' : 'Ausente'}
                  </small>
                  {host && p.bot && (
                    <label className="bot-nation-label">
                      Nação do bot
                      <select
                        aria-label={`Nação de ${p.name}`}
                        value={p.nationId}
                        onChange={(e) =>
                          command({
                            type: 'SET_BOT_NATION',
                            playerId: p.id,
                            nationId: e.target.value as NationId,
                          })
                        }
                      >
                        {NATIONS.map((n) => {
                          const owner = game.players.find(
                            (q) => q.id !== p.id && q.nationId === n.id,
                          );
                          return (
                            <option key={n.id} value={n.id} disabled={!!owner && !owner.bot}>
                              {n.name}
                              {owner?.bot
                                ? ` (trocar com ${owner.name})`
                                : owner
                                  ? ' (ocupada)'
                                  : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )}
                </div>
                {host && !p.online && !p.bot && (
                  <button
                    title="Substituir ausente por bot"
                    onClick={() => command({ type: 'REPLACE_WITH_BOT', playerId: p.id })}
                  >
                    Bot
                  </button>
                )}
              </div>
            ))}
          </div>
          {host && (
            <button
              disabled={game.players.length >= 8}
              onClick={() => command({ type: 'ADD_BOT' })}
            >
              <Plus size={15} />
              Adicionar bot
            </button>
          )}
          <p className="muted">
            Todos usam o mesmo servidor. Compartilhe o código com os demais estrategistas. O
            anfitrião escolhe as nações dos bots; escolher a de outro bot troca as duas.
          </p>
        </section>
        <section className="lobby-selection">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UM LUGAR NA HISTÓRIA</span>
              <h2>Escolha sua nação.</h2>
            </div>
            <span className="tag">{host ? 'ANFITRIÃO' : 'CONVIDADO'}</span>
          </div>
          <NationCards
            selected={me.nationId}
            taken={taken}
            onSelect={(nationId) => command({ type: 'SET_IDENTITY', nationId })}
          />
          <div className="lobby-settings">
            <label>
              Nome da sala
              <input
                disabled={!host}
                value={game.roomName}
                maxLength={60}
                onChange={(e) =>
                  command({
                    type: 'SET_LOBBY_OPTIONS',
                    roomName: e.target.value || 'Campanha',
                    isPublic: game.isPublic,
                    enableSecretObjectives: game.enableSecretObjectives,
                    turnTimerSeconds: game.turnSeconds,
                  })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                disabled={!host}
                checked={game.isPublic}
                onChange={(e) =>
                  command({
                    type: 'SET_LOBBY_OPTIONS',
                    roomName: game.roomName,
                    isPublic: e.target.checked,
                    enableSecretObjectives: game.enableSecretObjectives,
                    turnTimerSeconds: game.turnSeconds,
                  })
                }
              />
              Sala pública
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                disabled={!host}
                checked={game.enableSecretObjectives}
                onChange={(e) =>
                  command({
                    type: 'SET_LOBBY_OPTIONS',
                    roomName: game.roomName,
                    isPublic: game.isPublic,
                    enableSecretObjectives: e.target.checked,
                    turnTimerSeconds: game.turnSeconds,
                  })
                }
              />
              Ativar Objetivos Secretos (Estilo War)
            </label>
            <details>
              <summary>Opções avançadas</summary>
              <label className="check-label">
                <input
                  type="checkbox"
                  disabled={!host}
                  checked={game.allowBotSecretVictory}
                  onChange={(e) =>
                    command({
                      type: 'SET_LOBBY_OPTIONS',
                      roomName: game.roomName,
                      isPublic: game.isPublic,
                      enableSecretObjectives: game.enableSecretObjectives,
                      allowBotSecretVictory: e.target.checked,
                      turnTimerSeconds: game.turnSeconds,
                    })
                  }
                />
                Permitir vitória secreta de bots
              </label>
            </details>
            <label>
              Timer First-Ready
              <select
                disabled={!host}
                value={game.turnSeconds}
                onChange={(e) =>
                  command({
                    type: 'SET_LOBBY_OPTIONS',
                    roomName: game.roomName,
                    isPublic: game.isPublic,
                    enableSecretObjectives: game.enableSecretObjectives,
                    turnTimerSeconds: Number(e.target.value),
                  })
                }
              >
                {[15, 30, 60, 90, 120, 180, 300, 600].map((n) => (
                  <option key={n} value={n}>
                    {n} segundos após o primeiro pronto
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cenário
              <select
                disabled={!host}
                value={game.mode}
                onChange={(e) => command({ type: 'SET_MODE', mode: e.target.value as GameMode })}
              >
                <option value="quick">Continental · sem limite de rodadas</option>
                <option value="campaign">Mundial · sem limite de rodadas</option>
              </select>
            </label>
            {game.mode === 'quick' && (
              <label>
                Continente
                <select
                  disabled={!host}
                  value={game.theater}
                  onChange={(e) =>
                    command({ type: 'SET_MODE', mode: 'quick', theater: e.target.value as Theater })
                  }
                >
                  {THEATERS.map((t) => (
                    <option key={t} value={t}>
                      {CONTINENTS[t]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Política religiosa
              <select
                value={me.religiousPolicy}
                onChange={(e) =>
                  command({
                    type: 'SET_IDENTITY',
                    nationId: me.nationId,
                    religiousPolicy: e.target.value as 'TOLERANCE' | 'INQUISITION',
                  })
                }
              >
                <option value="TOLERANCE">Édito de Tolerância · −10% imposto</option>
                <option value="INQUISITION">Inquisição · conversão rápida</option>
              </select>
            </label>
          </div>
          <div className="lobby-bottom">
            <span>
              <Ship size={16} />
              {game.provinces.filter((p) => p.kind === 'LAND').length} terras e rotas marítimas
            </span>
            {host ? (
              <button
                className="primary"
                disabled={game.players.length < 3}
                onClick={() => command({ type: 'START_GAME' })}
              >
                Iniciar campanha <ArrowRight size={16} />
              </button>
            ) : (
              <p className="muted">Aguardando o anfitrião iniciar a campanha.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
