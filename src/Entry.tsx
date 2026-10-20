import { useMemo, useState } from 'react';
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
import type { ClientMessage, GameMode, GameView, NationId, Theater } from '../shared/types';
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
}: {
  send: (message: ClientMessage) => void;
  online: boolean;
  onHelp: () => void;
}) {
  const [form, setForm] = useState<'create' | 'join' | null>(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [mode, setMode] = useState<GameMode>('quick'),
    [theater, setTheater] = useState<Theater>('EUROPE'),
    [nationId, setNation] = useState<NationId>('PORTUGAL');
  return (
    <main className="entry-viewport">
      <Atlas provinces={world} players={[]} mode="POLITICAL" preview />
      <div className="entry-shade" />
      <header className="entry-header">
        <Brand />
        <span className="edition">
          TERCEIRA EDIÇÃO <i /> 0.3
        </span>
        <button className="quiet-button" onClick={onHelp}>
          Como jogar <ArrowRight size={14} />
        </button>
      </header>
      <div className={`entry-content ${form ? 'with-form' : ''}`}>
        <section className="hero-copy">
          <span className="eyebrow">GUERRA, COMÉRCIO & PAZ IMPERIAL</span>
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
                    nationId: 'PORTUGAL',
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
                Pacificação Imperial<small>Una a Dieta e sustente cinco rodadas de paz.</small>
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
                  ? { type: 'create', name: name.trim() || 'Estrategista', mode, theater, nationId }
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
                <div className="mode-choices">
                  <button
                    type="button"
                    aria-pressed={mode === 'quick'}
                    onClick={() => setMode('quick')}
                    className={mode === 'quick' ? 'selected' : ''}
                  >
                    <Swords size={18} />
                    <strong>Teatro continental</strong>
                    <small>16 terras · até 60 minutos</small>
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'campaign'}
                    onClick={() => setMode('campaign')}
                    className={mode === 'campaign' ? 'selected' : ''}
                  >
                    <Globe2 size={18} />
                    <strong>Campanha mundial</strong>
                    <small>56 terras · até 5 horas</small>
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
                  Sua nação <span>8 histórias, 2 ideias cada</span>
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
          <div className="council-list">
            {game.players.map((p) => (
              <div className="council-seat" key={p.id}>
                <CoatOfArms nationId={p.nationId} size={26} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === game.hostId && <Crown size={12} />}
                  </strong>
                  <small>
                    {p.nation} · {p.bot ? 'Conselho autônomo' : p.online ? 'Presente' : 'Ausente'}
                  </small>
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
            Todos usam o mesmo servidor. Compartilhe o código com os demais estrategistas.
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
              Cenário
              <select
                disabled={!host}
                value={game.mode}
                onChange={(e) => command({ type: 'SET_MODE', mode: e.target.value as GameMode })}
              >
                <option value="quick">Rápido · 20 rodadas de 3 minutos</option>
                <option value="campaign">Mundial · 40 rodadas de 7,5 minutos</option>
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
