import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Coins,
  Handshake,
  MessageCircle,
  ScrollText,
  Send,
  Shield,
  Swords,
  Tent,
  X,
} from 'lucide-react';
import type { BattleReport, GameView, Player } from '../shared/types';
import { orderCost, orderKey, orderProvinceId } from '../shared/rules';
import { orderName } from './orders';
import { number, type Command } from './ui';
export type TurnTab = 'orders' | 'reports' | 'chat';

function Battle({ battle: b, game }: { battle: BattleReport; game: GameView }) {
  const realm = (id: string | null) =>
      game.players.find((p) => p.id === id)?.nation ?? 'Forças locais',
    province = (id: string | null) => game.provinces.find((p) => p.id === id)?.name ?? 'sem rota';
  return (
    <details className="battle-report">
      <summary>
        <Swords size={15} />
        <span>
          <strong>{province(b.provinceId)}</strong>
          <small>
            {b.outcome === 'siege_blocked'
              ? 'Cerco sem tropas suficientes'
              : `${realm(b.winnerId)} venceu`}
          </small>
        </span>
        <span className={`badge ${b.stackwipe ? 'red' : ''}`}>
          {b.stackwipe ? 'ANIQUILAÇÃO' : b.outcome === 'attacker_victory' ? 'OCUPAÇÃO' : 'DEFESA'}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="battle-report-body">
        <div className="battle-sides">
          <div>
            <small>ATACANTE</small>
            <strong>{realm(b.attackerId)}</strong>
            <span>
              {b.attackerTroops} tropas · −{b.attackerCasualties} baixas
            </span>
            <span>
              Moral {b.attackerMoraleBefore} → {b.attackerMoraleAfter}
            </span>
            <span>Treinamento {number(b.attackerTraining, 2)}×</span>
          </div>
          <div>
            <small>DEFENSOR</small>
            <strong>{realm(b.defenderId)}</strong>
            <span>
              {b.defenderTroops} tropas · −{b.defenderCasualties} baixas
            </span>
            <span>
              Moral {b.defenderMoraleBefore} → {b.defenderMoraleAfter}
            </span>
            <span>Treinamento {number(b.defenderTraining, 2)}×</span>
          </div>
        </div>
        <div className="battle-modifiers">
          <span>
            Força {number(b.attackPower, 2)} × {number(b.defensePower, 2)}
          </span>
          <span>Razão ataque/defesa: {number(b.ratio, 2)}</span>
          <span>
            Terreno {number(b.terrainDefenseBonus, 2)}× · Forte {b.fortLevel} (
            {number(b.fortDefenseMultiplier, 2)}×)
          </span>
          <span>
            Fé {number(b.holyWarBonus, 2)}× · Coalizão A/D: {number(b.coalitionAttackBonus, 2)}× /{' '}
            {number(b.coalitionDefenseBonus, 2)}×
          </span>
          <span>Destino de recuo: {province(b.retreatDestinationId)}</span>
        </div>
      </div>
    </details>
  );
}
export default function TurnPanel({
  game,
  me,
  command,
  tab,
  setTab,
  expanded,
  setExpanded,
  onProvince,
}: {
  game: GameView;
  me: Player;
  command: Command;
  tab: TurnTab;
  setTab: (tab: TurnTab) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onProvince: (id: string) => void;
}) {
  const [message, setMessage] = useState(''),
    [reportTurn, setReportTurn] = useState(game.lastReport?.turn ?? 0);
  useEffect(() => {
    setReportTurn(game.lastReport?.turn ?? 0);
  }, [game.lastReport?.turn]);
  const report = game.reports.find((r) => r.turn === reportTurn) ?? game.lastReport;
  const reserved = game.plannedOrders.reduce(
    (n, o) =>
      n +
      orderCost(
        o,
        game.provinces.find((p) => p.id === orderProvinceId(o)),
      ).gold,
    0,
  );
  const realm = (id: string | null) =>
      game.players.find((p) => p.id === id)?.nation ?? 'Forças locais',
    province = (id: string | null) => game.provinces.find((p) => p.id === id)?.name ?? 'sem rota';
  return (
    <section
      className={`turn-panel glass ${expanded ? 'expanded' : ''}`}
      aria-label="Ordens e relatórios"
    >
      <header>
        <div className="turn-panel-tabs">
          {(
            [
              { id: 'orders', label: 'Ordens', Icon: ScrollText, count: game.plannedOrders.length },
              {
                id: 'reports',
                label: 'Relatórios',
                Icon: Swords,
                count: game.lastReport?.battles.length ?? 0,
              },
              { id: 'chat', label: 'Conselho', Icon: MessageCircle, count: game.chat.length },
            ] as const
          ).map(({ id, label, Icon, count }) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id);
                setExpanded(tab === id ? !expanded : true);
              }}
            >
              <Icon size={14} />
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label={expanded ? 'Recolher painel' : 'Expandir painel'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </header>
      {expanded && (
        <div className={`turn-panel-body ${tab === 'chat' ? 'chat-body' : ''}`}>
          {tab === 'orders' ? (
            <>
              <div className="orders-summary">
                <span>{game.plannedOrders.length} ordens planejadas</span>
                <span>
                  <Coins size={12} />
                  {number(reserved, 2)} ouro reservado
                </span>
              </div>
              {game.plannedOrders.length === 0 ? (
                <div className="panel-empty">
                  <ScrollText size={25} />
                  <p>
                    Selecione uma província e prepare suas ordens.
                    <br />A resolução acontece quando todos confirmam ou o tempo acaba.
                  </p>
                </div>
              ) : (
                game.plannedOrders.map((o) => {
                  const id = orderProvinceId(o),
                    cost = orderCost(
                      o,
                      game.provinces.find((p) => p.id === id),
                    );
                  return (
                    <div className="planned-order" key={orderKey(o)}>
                      <ScrollText size={15} />
                      <button className="order-link" onClick={() => id && onProvince(id)}>
                        <strong>{id ? province(id) : 'Diplomacia'}</strong>
                        <small>
                          {orderName(o)}
                          {o.type === 'MOVE_ATTACK'
                            ? ` · ${o.troops} → ${province(o.toProvinceId)}`
                            : ''}
                        </small>
                      </button>
                      <span>{cost.gold > 0 ? `${cost.gold} ouro` : '—'}</span>
                      <button
                        className="icon-button"
                        disabled={me.ready || game.phase !== 'planning'}
                        aria-label={`Cancelar ordem em ${province(id)}`}
                        title="Cancelar e liberar a reserva de recursos."
                        onClick={() => command({ type: 'CANCEL_ORDER', key: orderKey(o) })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </>
          ) : tab === 'reports' ? (
            <>
              {report ? (
                <>
                  <div className="report-top">
                    <strong>Resolução da rodada {report.turn}</strong>
                    <select
                      aria-label="Rodada do relatório"
                      value={reportTurn}
                      onChange={(e) => setReportTurn(Number(e.target.value))}
                    >
                      {[...game.reports].reverse().map((r) => (
                        <option key={r.turn} value={r.turn}>
                          Rodada {r.turn}
                        </option>
                      ))}
                    </select>
                  </div>
                  {report.battles.map((b) => (
                    <Battle key={b.id} battle={b} game={game} />
                  ))}
                  {report.retreats.map((r, i) => (
                    <p className="report-event" key={`${r.armyId}-${i}`}>
                      <ArrowRight size={13} />
                      {realm(r.ownerId)}: {r.regrouped} tropas{' '}
                      {r.stranded ? 'isoladas em' : 'recuaram de'} {province(r.fromProvinceId)}
                      {r.toProvinceId ? ` para ${province(r.toProvinceId)}` : ''}. Moral {r.morale};{' '}
                      {r.dispersed} dispersas.
                    </p>
                  ))}
                  {report.stackwipes.map((s, i) => (
                    <p className="report-event danger-text" key={`${s.armyId}-${i}`}>
                      <Swords size={13} />
                      {realm(s.ownerId)} perdeu {s.troops} tropas por aniquilação em{' '}
                      {province(s.provinceId)} (
                      {s.reason === 'overwhelming_force' ? 'força ≥ 2,5×' : 'moral zero e sem fuga'}
                      ).
                    </p>
                  ))}
                  {report.attritionLosses.map((a, i) => (
                    <p className="report-event" key={`${a.armyId}-${i}`}>
                      <Tent size={13} />
                      {province(a.provinceId)}: −{a.losses} tropas de {realm(a.ownerId)} por
                      suprimento.
                    </p>
                  ))}
                  {report.conversions.map((c, i) => (
                    <p className="report-event" key={i}>
                      <Shield size={13} />
                      {province(c.provinceId)}: {c.from} → {c.to}
                      {c.crossBorder ? ' · missão transfronteiriça' : ''}.
                    </p>
                  ))}
                  {report.rebellions.map((r) => (
                    <p className="report-event danger-text" key={r.provinceId}>
                      <Shield size={13} />
                      {province(r.provinceId)} se rebelou com {r.rebelTroops} tropas locais.
                    </p>
                  ))}
                  {report.diplomaticChanges.map((d, i) => (
                    <p className="report-event" key={i}>
                      <Handshake size={13} />
                      {d.text}
                    </p>
                  ))}
                  {report.battles.length === 0 &&
                    report.retreats.length === 0 &&
                    report.attritionLosses.length === 0 && (
                      <p className="small muted">
                        Nenhuma batalha, recuo ou perda de suprimento nesta rodada.
                      </p>
                    )}
                </>
              ) : (
                <div className="panel-empty">
                  <Swords size={26} />
                  <p>Os resultados aparecerão após a primeira resolução.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="chat-messages">
                {game.chat.length === 0 ? (
                  <p className="small muted">
                    Conselho público: todos leem as mensagens. Bots respondem a propostas formais,
                    mas não ao chat.
                  </p>
                ) : (
                  game.chat.map((m) => (
                    <div className="chat-message" key={m.id}>
                      <strong
                        style={{ color: game.players.find((p) => p.id === m.playerId)?.color }}
                      >
                        {game.players.find((p) => p.id === m.playerId)?.name}
                      </strong>
                      <p>{m.text}</p>
                    </div>
                  ))
                )}
              </div>
              <form
                className="chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!message.trim()) return;
                  command({ type: 'CHAT', text: message });
                  setMessage('');
                }}
              >
                <input
                  aria-label="Mensagem ao conselho"
                  placeholder="Uma proposta ao conselho…"
                  value={message}
                  maxLength={280}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button
                  className="icon-button"
                  aria-label="Enviar mensagem"
                  disabled={!message.trim()}
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
}
