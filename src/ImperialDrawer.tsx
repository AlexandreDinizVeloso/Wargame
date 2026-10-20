import { Crown, Gavel, Handshake, Shield } from 'lucide-react';
import type { GameView } from '../shared/types';
import { livingPlayers } from '../shared/rules';
import { CoatOfArms, Empty, Meter, number, type Command } from './ui';
export default function ImperialDrawer({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const diet = game.diet,
    me = game.players.find((p) => p.id === playerId)!,
    emperor = game.players.find((p) => p.id === diet.emperorId),
    member = diet.memberRealmIds.includes(playerId),
    alive = livingPlayers(game),
    members = diet.memberRealmIds.filter((id) => alive.some((p) => p.id === id)),
    share = members.length / Math.max(1, alive.length),
    active = game.phase === 'planning';
  return (
    <div className="imperial-ledger">
      <div className="imperial-seal">
        <Crown size={38} />
        <span className="eyebrow">SACRO CONSELHO DOS REINOS</span>
        <h2>Dieta Imperial</h2>
        <p>
          Uma autoridade. Muitas nações.
          <br />
          Cinco rodadas para fazer a paz durar.
        </p>
      </div>
      {emperor ? (
        <div className="emperor-card">
          <CoatOfArms nationId={emperor.nationId} size={44} />
          <div>
            <small>IMPERADOR ELEITO</small>
            <strong>{emperor.nation}</strong>
            <span>{emperor.name}</span>
          </div>
        </div>
      ) : (
        <Empty>O trono está vago. Ingresse para formar o conselho.</Empty>
      )}
      <Meter label="Autoridade imperial" value={diet.imperialAuthority} />
      <Meter
        label="Nações vivas na Dieta"
        value={share * 100}
        display={`${members.length}/${alive.length} · ${number(share * 100)}%`}
      />
      <div className="peace-counter">
        <span>PAZ MUNDIAL</span>
        <div>
          {[1, 2, 3, 4, 5].map((n) => (
            <i key={n} className={n <= diet.peaceTurnsCounter ? 'complete' : ''}>
              {n <= diet.peaceTurnsCounter ? '✓' : n}
            </i>
          ))}
        </div>
        <small>
          {diet.peaceTurnsCounter}/5 rodadas consecutivas ·{' '}
          {game.wars.filter((w) => w.active).length} guerra(s) ativa(s)
        </small>
      </div>
      <p className="fine-print">
        A vitória exige Imperador ativo, ao menos 60% das nações vivas na Dieta e nenhuma guerra no
        mundo por cinco rodadas.
      </p>
      <button
        className={member ? '' : 'primary'}
        disabled={!active || (!member && diet.bannedRealmIds.includes(playerId))}
        onClick={() => command({ type: member ? 'LEAVE_DIET' : 'JOIN_DIET' })}
      >
        <Handshake size={16} />
        {member ? 'Deixar a Dieta' : 'Ingressar na Dieta'}
      </button>
      <div className="field-heading">Votos do conselho</div>
      {members.map((id) => {
        const p = game.players.find((p) => p.id === id)!;
        return (
          <div className="vote-row" key={id}>
            <CoatOfArms nationId={p.nationId} size={22} />
            <span>
              <strong>{p.nation}</strong>
              <small>
                Vota em {game.players.find((p) => p.id === diet.votes[id])?.nation ?? 'ninguém'} ·
                prestígio {p.prestige}
              </small>
            </span>
            <button
              aria-label={`${diet.votes[playerId] === id ? 'Seu voto em' : 'Votar em'} ${p.nation}`}
              disabled={!active || !member}
              aria-pressed={diet.votes[playerId] === id}
              onClick={() => command({ type: 'VOTE_EMPEROR', candidateId: id })}
            >
              {diet.votes[playerId] === id ? 'Seu voto' : 'Votar'}
            </button>
          </div>
        );
      })}
      <div className={`edict-card ${diet.retaliationEdictActive ? 'active' : ''}`}>
        <Shield size={26} />
        <h3>Édito de Paz Imperial</h3>
        <p>
          Quem declarar uma nova guerra enfrentará todos os membros da Dieta. A defesa recebe +20%
          moral e −25% manutenção.
        </p>
        <button
          disabled={
            !active ||
            diet.emperorId !== playerId ||
            diet.retaliationEdictActive ||
            diet.imperialAuthority < 25 ||
            me.gold < 25
          }
          onClick={() => command({ type: 'ISSUE_IMPERIAL_EDICT' })}
        >
          <Gavel size={15} />
          {diet.retaliationEdictActive
            ? 'Édito em vigor'
            : 'Emitir Édito · 25 ouro + 25 autoridade'}
        </button>
      </div>
      {diet.bannedRealmIds.length > 0 && (
        <p className="warning-box">
          Sob banimento:{' '}
          {diet.bannedRealmIds
            .map((id) => game.players.find((p) => p.id === id)?.nation)
            .join(', ')}
          .
        </p>
      )}
    </div>
  );
}
