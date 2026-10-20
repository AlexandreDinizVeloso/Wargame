import { useState } from 'react';
import { ArrowRight, Coins, Flag, Handshake, ScrollText, Swords, Users } from 'lucide-react';
import type { CasusBelli, DiplomacyAction, GameView, PeaceTerm } from '../shared/types';
import {
  CASUS_LABELS,
  peaceDescription,
  controller,
  getRelation,
  peaceTermCost,
} from '../shared/rules';
import { CoatOfArms, Empty, Meter, number, type Command } from './ui';
export default function DiplomacyDrawer({
  game,
  playerId,
  command,
}: {
  game: GameView;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    [targetId, setTarget] = useState(game.players.find((p) => p.id !== playerId)?.id ?? ''),
    [casusBelli, setCB] = useState<CasusBelli>('CONQUEST'),
    [allies, setAllies] = useState<string[]>([]),
    [money, setMoney] = useState(12),
    [provinceId, setProvince] = useState('');
  const target =
      game.players.find((p) => p.id === targetId) ?? game.players.find((p) => p.id !== playerId)!,
    r = getRelation(game, playerId, target.id)!;
  const [selectedWarId, setWarId] = useState(''),
    [selectedProvinces, setProvinces] = useState<string[]>([]),
    [reparations, setReparations] = useState(false),
    [humiliate, setHumiliate] = useState(false),
    [force, setForce] = useState<'NONE' | 'EMPIRE' | 'RELIGION'>('NONE'),
    [subjugate, setSubjugate] = useState(false),
    [tribute, setTribute] = useState(0);
  const active = game.phase === 'planning',
    wars = game.wars.filter((w) => w.active),
    mine = wars.filter((w) => [...w.attackerIds, ...w.defenderIds].includes(playerId)),
    war = mine.find((w) => w.id === selectedWarId) ?? mine[0];
  const score = war ? war.warScore * (war.attackerIds.includes(playerId) ? 1 : -1) : 0;
  const enemies = war
    ? war.attackerIds.includes(playerId)
      ? war.defenderIds
      : war.attackerIds
    : [];
  const occupied = game.provinces.filter(
    (p) =>
      p.ownerId &&
      enemies.includes(p.ownerId) &&
      p.occupierId &&
      !!war &&
      (war.attackerIds.includes(playerId) ? war.attackerIds : war.defenderIds).includes(
        p.occupierId,
      ),
  );
  const terms: PeaceTerm[] = [
    ...(selectedProvinces.filter((id) => occupied.some((p) => p.id === id)).length
      ? [
          {
            type: 'CEDE_PROVINCES' as const,
            provinceIds: selectedProvinces.filter((id) => occupied.some((p) => p.id === id)),
          },
        ]
      : []),
    ...(reparations ? [{ type: 'WAR_REPARATIONS' as const, immediateTribute: tribute }] : []),
    ...(humiliate ? [{ type: 'HUMILIATE_DISARM' as const }] : []),
    ...(force !== 'NONE' ? [{ type: 'FORCE_EMPIRE_OR_RELIGION' as const, choice: force }] : []),
    ...(subjugate ? [{ type: 'SUBJUGATE' as const }] : []),
  ];
  const cost = peaceTermCost(game.provinces, terms);
  const action = (type: DiplomacyAction, amount?: number, targetProvinceId?: string) =>
    command({
      type: 'SUBMIT_ORDER',
      order: {
        type: 'DIPLOMACY',
        action: type,
        targetRealmId: target.id,
        ...(amount !== undefined ? { amount } : {}),
        ...(targetProvinceId ? { targetProvinceId } : {}),
      },
    });
  const rivalProvinces = game.provinces.filter(
    (p) => controller(p) === target.id && p.kind === 'LAND',
  );
  const availableAllies = game.players.filter(
    (p) => p.id !== playerId && p.id !== target.id && getRelation(game, playerId, p.id)?.allied,
  );
  return (
    <div className="diplomacy-ledger">
      <div className="section-heading">
        <div>
          <span className="eyebrow">O CONSELHO DAS NAÇÕES</span>
          <h2>Diplomacia & guerras</h2>
        </div>
        <span className="tag">{wars.length} GUERRA(S)</span>
      </div>
      <div className="realm-list">
        {game.players.map((p) => {
          const rel = p.id === playerId ? null : getRelation(game, playerId, p.id);
          return (
            <button
              key={p.id}
              className={`realm-row ${p.id === target.id ? 'selected' : ''}`}
              disabled={p.id === playerId}
              onClick={() => {
                setTarget(p.id);
                setProvince('');
              }}
            >
              <CoatOfArms nationId={p.nationId} size={26} />
              <span>
                <strong>{p.nation}</strong>
                <small>
                  {p.name} ·{' '}
                  {p.subjectOfId
                    ? 'Subjugado'
                    : p.id === playerId
                      ? 'Seu reino'
                      : rel?.atWar
                        ? 'Em guerra'
                        : rel?.allied
                          ? 'Aliado'
                          : rel && rel.truceUntil >= game.turn
                            ? 'Trégua'
                            : 'Em paz'}
                </small>
              </span>
              <b className={rel && rel.trust < 0 ? 'danger' : ''}>
                {p.id === playerId
                  ? '—'
                  : `${(rel?.trust ?? 0) > 0 ? '+' : ''}${number(rel?.trust ?? 0)}`}
              </b>
            </button>
          );
        })}
      </div>
      <div className="realm-detail">
        <div className="section-heading">
          <h3>{target.nation}</h3>
          <span className="tag">CONFIANÇA {number(r.trust)}</span>
        </div>
        <div className="ledger-grid">
          <div>
            <small>PRESTÍGIO</small>
            <strong>{number(target.prestige)}</strong>
          </div>
          <div>
            <small>DESGASTE</small>
            <strong>{number(target.warExhaustion)}%</strong>
          </div>
        </div>
        {r.truceUntil >= game.turn && (
          <p className="warning-box">Trégua até o fim da rodada {r.truceUntil}.</p>
        )}
        {r.atWar ? (
          <p className="warning-box">
            <Swords size={15} />A guerra exige um tratado para ser encerrada.
          </p>
        ) : (
          <>
            <div className="button-pair">
              <button
                disabled={!active}
                onClick={() => action(r.allied ? 'BREAK_ALLIANCE' : 'PROPOSE_ALLIANCE')}
              >
                <Handshake size={15} />
                {r.allied ? 'Romper aliança' : 'Propor aliança'}
              </button>
              <button
                disabled={!active || r.militaryAccess.includes(playerId)}
                onClick={() => action('MILITARY_ACCESS')}
              >
                <Flag size={15} />
                {r.militaryAccess.includes(playerId) ? 'Acesso concedido' : 'Acesso militar'}
              </button>
            </div>
            <details className="command-details">
              <summary>
                <Swords size={15} />
                Declaração formal de guerra
              </summary>
              <label>
                Casus belli
                <select value={casusBelli} onChange={(e) => setCB(e.target.value as CasusBelli)}>
                  <option value="CONQUEST">Conquista</option>
                  <option value="IMPERIAL_BAN">Banimento imperial</option>
                  <option value="HOLY_WAR">Guerra Santa</option>
                  <option value="HUMILIATION">Humilhação</option>
                </select>
              </label>
              {availableAllies.length > 0 && (
                <fieldset>
                  <legend>Convocar aliados ofensivos</legend>
                  {availableAllies.map((p) => (
                    <label className="check-label" key={p.id}>
                      <input
                        type="checkbox"
                        checked={allies.includes(p.id)}
                        onChange={(e) =>
                          setAllies((v) =>
                            e.target.checked ? [...v, p.id] : v.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.nation}
                    </label>
                  ))}
                </fieldset>
              )}
              {game.diet.retaliationEdictActive && (
                <p className="warning-box">
                  Édito ativo: toda a Dieta defenderá o alvo e você sofrerá banimento.
                </p>
              )}
              <button
                className="danger-button"
                disabled={!active || r.allied || r.truceUntil >= game.turn || !!me.subjectOfId}
                onClick={() =>
                  command({
                    type: 'DECLARE_WAR',
                    targetRealmId: target.id,
                    casusBelli,
                    offensiveAllyIds: allies,
                  })
                }
              >
                Declarar guerra <Swords size={15} />
              </button>
            </details>
          </>
        )}
        <div className="button-pair">
          <button disabled={!active} onClick={() => action('EMBARGO')}>
            {r.embargoes.includes(playerId) ? 'Retirar embargo' : 'Embargo comercial'}
          </button>
          <button
            disabled={!active || r.atWar}
            onClick={() => action('DEMAND_TRIBUTE', Math.min(30, Math.max(1, money)))}
          >
            Exigir tributo
          </button>
        </div>
        <label>
          Ouro para ação diplomática
          <input
            type="number"
            min={1}
            max={1000}
            value={money}
            onChange={(e) => setMoney(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
          />
        </label>
        <button
          className="action-row"
          disabled={!active}
          onClick={() => action('SEND_SUBSIDY', money)}
        >
          <Coins size={16} />
          <span>
            Enviar subsídio<small>Transfere ouro e melhora confiança.</small>
          </span>
          <b>{money} ouro</b>
        </button>
        <label>
          Província para rebeldes
          <select
            value={provinceId || rivalProvinces[0]?.id || ''}
            onChange={(e) => setProvince(e.target.value)}
          >
            {rivalProvinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · revolta {number(p.unrest)}%
              </option>
            ))}
          </select>
        </label>
        <button
          className="action-row"
          disabled={!active || money < 12 || !rivalProvinces.length}
          onClick={() => action('FUND_REBELS', money, provinceId || rivalProvinces[0]?.id)}
        >
          <Users size={16} />
          <span>
            Financiar rebeldes<small>+30 revolta; mínimo 12 ouro; autoria encoberta.</small>
          </span>
          <b>{money} ouro</b>
        </button>
        {game.hostId === playerId && !target.online && !target.bot && (
          <button
            disabled={!active}
            onClick={() => command({ type: 'REPLACE_WITH_BOT', playerId: target.id })}
          >
            Substituir ausente por bot
          </button>
        )}
      </div>
      <div className="field-heading">
        Tratados & chamados <span>{game.offers.filter((o) => o.to === playerId).length}</span>
      </div>
      {game.offers
        .filter((o) => o.to === playerId)
        .map((o) => (
          <div className="offer-card" key={o.id}>
            <strong>
              {
                {
                  alliance: 'Proposta de aliança',
                  military_access: 'Pedido de acesso militar',
                  tribute: 'Exigência de tributo',
                  call_to_arms: o.defensive ? 'Chamado defensivo' : 'Chamado ofensivo',
                  peace: 'Tratado de paz',
                }[o.kind]
              }
            </strong>
            <small>
              {game.players.find((p) => p.id === o.from)?.nation}
              {o.kind === 'tribute' ? ` · ${o.amount} ouro por rodada` : ''}
            </small>
            {o.kind === 'call_to_arms' && o.defensive && (
              <p className="fine-print">
                Recusar rompe a aliança e custa 15 prestígio e 5 autoridade imperial.
              </p>
            )}
            {o.terms && (
              <p className="fine-print">
                {o.terms.map((t) => peaceDescription(t, game.provinces)).join(' · ') ||
                  'Paz sem exigências'}
              </p>
            )}
            <div className="button-pair">
              <button
                disabled={!active}
                onClick={() => command({ type: 'ANSWER_OFFER', offerId: o.id, accept: true })}
              >
                Aceitar
              </button>
              <button
                disabled={!active}
                onClick={() => command({ type: 'ANSWER_OFFER', offerId: o.id, accept: false })}
              >
                Recusar
              </button>
            </div>
          </div>
        ))}
      <div className="field-heading">Guerras do mundo</div>
      {wars.length === 0 ? (
        <Empty>Os tratados preservam a paz no mundo.</Empty>
      ) : (
        wars.map((w) => (
          <div className="war-card" key={w.id}>
            <strong>
              <Swords size={14} />
              {w.name}
            </strong>
            <small>
              {CASUS_LABELS[w.casusBelli]} · desde a rodada {w.startedTurn}
            </small>
            <Meter
              label="Pontuação do atacante"
              value={(w.warScore + 100) / 2}
              display={`${w.warScore > 0 ? '+' : ''}${number(w.warScore)}`}
            />
            <p className="fine-print">
              Ataque:{' '}
              {w.attackerIds.map((id) => game.players.find((p) => p.id === id)?.nation).join(', ')}
              <br />
              Defesa:{' '}
              {w.defenderIds.map((id) => game.players.find((p) => p.id === id)?.nation).join(', ')}
            </p>
          </div>
        ))
      )}
      {war && (
        <details className="command-details peace-builder" open>
          <summary>
            <ScrollText size={16} />
            Negociar paz
          </summary>
          <label>
            Guerra
            <select
              value={war.id}
              onChange={(e) => {
                setWarId(e.target.value);
                setProvinces([]);
              }}
            >
              {mine.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <p className="fine-print">
            Pontuação disponível: {number(Math.max(0, score))}. Com 100, os termos podem ser
            impostos. Sem termos, a paz depende de aceite.
          </p>
          <fieldset>
            <legend>Ceder províncias ocupadas</legend>
            {occupied.length ? (
              occupied.map((p) => (
                <label className="check-label" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selectedProvinces.includes(p.id)}
                    onChange={(e) =>
                      setProvinces((v) =>
                        e.target.checked ? [...v, p.id] : v.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                  <small>{12 + p.baseTax} pontos</small>
                </label>
              ))
            ) : (
              <p className="muted">Nenhuma ocupação disponível para cessão.</p>
            )}
          </fieldset>
          <label className="check-label">
            <input
              type="checkbox"
              checked={reparations}
              onChange={(e) => setReparations(e.target.checked)}
            />
            Reparações de guerra <small>20 pontos</small>
          </label>
          {reparations && (
            <label>
              Tributo imediato
              <input
                type="number"
                min={0}
                max={100}
                value={tribute}
                onChange={(e) =>
                  setTribute(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
              />
              <small>Mais 25% da renda bruta por cinco rodadas.</small>
            </label>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              checked={humiliate}
              onChange={(e) => setHumiliate(e.target.checked)}
            />
            Humilhar e desarmar <small>25 pontos</small>
          </label>
          <label>
            Exigência de Estado
            <select value={force} onChange={(e) => setForce(e.target.value as typeof force)}>
              <option value="NONE">Nenhuma</option>
              <option value="EMPIRE">Forçar ingresso na Dieta · 30 pontos</option>
              <option value="RELIGION">Impor religião estatal · 30 pontos</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={subjugate}
              onChange={(e) => setSubjugate(e.target.checked)}
            />
            Subjugar reino <small>70 pontos</small>
          </label>
          <p className={cost > score && terms.length ? 'danger' : 'muted'}>
            Custo do tratado: {cost} / {number(Math.max(0, score))}
          </p>
          <button
            className="primary"
            disabled={
              !active ||
              ![war.attackerLeaderId, war.defenderLeaderId].includes(playerId) ||
              (terms.length > 0 && cost > score)
            }
            onClick={() => command({ type: 'OFFER_PEACE', warId: war.id, terms })}
          >
            {score >= 100 && terms.length ? 'Impor tratado' : 'Oferecer paz'}
            <ArrowRight size={15} />
          </button>
          {availableAllies
            .filter((p) => ![...war.attackerIds, ...war.defenderIds].includes(p.id))
            .map((p) => (
              <button
                key={p.id}
                disabled={!active}
                onClick={() => command({ type: 'CALL_TO_ARMS', warId: war.id, allyId: p.id })}
              >
                Convocar {p.nation}
              </button>
            ))}
        </details>
      )}
    </div>
  );
}
