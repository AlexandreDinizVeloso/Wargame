import { ECONOMY_BALANCE } from '../shared/balance';
import { useState } from 'react';
import type { GameView, PeaceTerm } from '../shared/types';
import { treatyCost, treatyPerspective } from '../shared/treaties';
import type { Command } from './ui';
export default function PeaceTreatyTable({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const wars = game.wars.filter(
    (w) => w.active && [w.attackerLeaderId, w.defenderLeaderId].includes(playerId),
  );
  const [warId, setWar] = useState(''),
    [concession, setConcession] = useState(false),
    [provinces, setProvinces] = useState<string[]>([]),
    [reparations, setReparations] = useState(false),
    [humiliate, setHumiliate] = useState(false),
    [vassal, setVassal] = useState(false);
  const war = wars.find((w) => w.id === warId) ?? wars[0];
  if (!war) return <p className="muted">Você precisa liderar uma guerra para negociar tratados.</p>;
  const side = treatyPerspective(war, playerId, concession),
    occupied = game.provinces.filter(
      (p) =>
        p.ownerId &&
        side.loserIds.includes(p.ownerId) &&
        p.occupierId &&
        side.winnerIds.includes(p.occupierId),
    );
  const selected = provinces.filter((id) => occupied.some((p) => p.id === id));
  const terms: PeaceTerm[] = [
    ...(selected.length ? [{ type: 'CEDE_PROVINCES' as const, provinceIds: selected }] : []),
    ...(reparations ? [{ type: 'WAR_REPARATIONS' as const, immediateTribute: 0 }] : []),
    ...(humiliate ? [{ type: 'HUMILIATE_DEMILITARIZE' as const }] : []),
    ...(vassal ? [{ type: 'SUBJUGATE_VASSAL' as const }] : []),
  ];
  if (!terms.length) terms.push({ type: 'WHITE_PEACE' });
  const cost = treatyCost(terms),
    budget = Math.max(0, side.score),
    active = game.phase === 'planning';
  return (
    <section className="peace-treaty-table" role="region" aria-label="Mesa de Tratados de Paz">
      <h3>🕊️ Mesa de Negociação</h3>
      <label>
        Guerra
        <select
          value={war.id}
          onChange={(e) => {
            setWar(e.target.value);
            setProvinces([]);
          }}
        >
          {wars.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <meter
        min={-100}
        max={100}
        value={war.warScore * (war.attackerLeaderId === playerId ? 1 : -1)}
        aria-label="Seu War Score"
      />
      <p>
        Seu War Score:{' '}
        <strong>{war.warScore * (war.attackerLeaderId === playerId ? 1 : -1)}</strong> · orçamento:{' '}
        {budget}
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={concession}
          onChange={(e) => {
            setConcession(e.target.checked);
            setProvinces([]);
          }}
        />
        Oferecer concessões ao adversário
      </label>
      <p className="fine-print">
        {concession
          ? 'Você paga/cede as cláusulas ao adversário.'
          : 'Você exige as cláusulas do adversário.'}{' '}
        Paz Branca restitui ocupações, sem transferir terras. Acordos dependem de aceite; com 100
        pontos, o vencedor pode impor termos.
      </p>
      <fieldset>
        <legend>Províncias ocupadas · 20 pontos cada</legend>
        {occupied.map((p) => (
          <label className="check-label" key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setProvinces((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))
              }
            />
            {p.name}
          </label>
        ))}
        {!occupied.length && <small>Nenhuma província elegível.</small>}
      </fieldset>
      <label className="check-label">
        <input
          type="checkbox"
          checked={reparations}
          onChange={(e) => setReparations(e.target.checked)}
        />
        Reparações de Guerra · 25 pontos — 25% da receita bruta por cinco rodadas
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={humiliate}
          onChange={(e) => setHumiliate(e.target.checked)}
        />
        Desmilitarização & Humilhação · 30 pontos — {ECONOMY_BALANCE.authorityFromGoldHumiliation}{' '}
        Autoridade, quatro rodadas desarmado e seis de trégua
      </label>
      <label className="check-label">
        <input type="checkbox" checked={vassal} onChange={(e) => setVassal(e.target.checked)} />
        Subjugação / Vassalagem · 75 pontos
      </label>
      <strong className={cost > budget ? 'danger' : 'positive'}>
        Custo das cláusulas: {cost}/{budget}
        {cost === 0 ? ' · Paz Branca' : ''}
      </strong>
      <button
        className="primary"
        disabled={
          !active ||
          cost > budget ||
          game.offers.some((o) => o.kind === 'peace' && o.warId === war.id && o.from === playerId)
        }
        onClick={() => command({ type: 'OFFER_PEACE', warId: war.id, terms, concession })}
      >
        {!concession && side.score >= 100 ? 'Impor tratado' : 'Enviar proposta de paz'}
      </button>
    </section>
  );
}
