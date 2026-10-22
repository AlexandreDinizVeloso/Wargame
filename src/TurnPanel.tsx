import { NotificationCard } from './Notifications';
import { useEffect, useState } from 'react';
import { ArrowRight, Coins, Play, ScrollText, Swords, X } from 'lucide-react';
import type { GameView, TurnResolutionReport } from '../shared/types';
import { RETREAT_LABELS, orderCost, orderKey, orderProvinceId } from '../shared/rules';
import { orderName } from './orders';
import { Empty, number, type Command } from './ui';
export type ReportTab = 'personal' | 'world' | 'orders' | 'reports' | 'chat';
export default function TurnPanel({
  game,
  playerId,
  command,
  tab,
  onReplay,
  onFocus,
}: {
  game: GameView;
  playerId: string;
  command: Command;
  tab: ReportTab;
  onReplay: (r: TurnResolutionReport) => void;
  onFocus: (id: string) => void;
}) {
  const [turn, setTurn] = useState(game.lastReport?.turn ?? 0),
    [message, setMessage] = useState('');
  useEffect(() => setTurn(game.lastReport?.turn ?? 0), [game.lastReport?.turn]);
  const report = game.history.find((r) => r.turn === turn) ?? game.lastReport;
  const me = game.players.find((p) => p.id === playerId)!;
  return (
    <div className="turn-panel">
      {tab === 'personal' && (
        <section className="personal-inbox">
          {game.notifications
            .filter((n) => n.type !== 'WORLD' && n.involvesPlayerIds.includes(playerId))
            .slice()
            .reverse()
            .map((n) => (
              <NotificationCard
                key={n.id}
                notice={n}
                game={game}
                playerId={playerId}
                command={command}
                onFocus={onFocus}
              />
            ))}
          {!game.notifications.some(
            (n) => n.type !== 'WORLD' && n.involvesPlayerIds.includes(playerId),
          ) && (
            <Empty>
              Alertas de guerra, cercos, propostas e batalhas da sua nação aparecerão aqui.
            </Empty>
          )}
        </section>
      )}
      {tab === 'world' && (
        <section className="world-newspaper">
          <h3>🌍 Jornal do Mundo</h3>
          {game.log
            .slice()
            .reverse()
            .map((n) => (
              <p className="chronicle-line" key={n.id}>
                <b>Rodada {n.turn}</b> · {n.text}
              </p>
            ))}
        </section>
      )}
      {tab === 'orders' && (
        <div className="orders-content">
          <div className="section-heading">
            <h3>Ordens da rodada {game.turn}</h3>
            <span className="tag">{me.ready ? 'PRONTO' : 'EM PLANEJAMENTO'}</span>
          </div>
          {game.plannedOrders.length === 0 && (
            <Empty>Nenhuma ordem preparada. Cidades e batalhões têm filas independentes.</Empty>
          )}
          {game.plannedOrders.map((o) => {
            const key = orderKey(o),
              p = game.provinces.find((p) => p.id === orderProvinceId(o, game)),
              cost = orderCost(o, p, me),
              a = 'battalionId' in o ? game.battalions.find((a) => a.id === o.battalionId) : null;
            return (
              <div className="order-row" key={key}>
                <ScrollText size={15} />
                <span>
                  <strong>{a?.name ?? p?.name ?? 'Diplomacia'}</strong>
                  <small>
                    {orderName(o)}
                    {o.type === 'MOVE_BATTALION' ? ` · ${o.path?.length ?? 1} ligação(ões)` : ''}
                  </small>
                </span>
                <b>{cost.gold > 0 ? `${number(cost.gold)} ouro` : '—'}</b>
                <button
                  aria-label={`Cancelar ${orderName(o)} em ${a?.name ?? p?.name}`}
                  disabled={game.phase !== 'planning'}
                  title="Cancelar e liberar recursos reservados"
                  onClick={() => command({ type: 'CANCEL_ORDER', key })}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {game.battalions
            .filter(
              (a) =>
                a.ownerId === playerId &&
                a.pathQueue.length &&
                !game.plannedOrders.some(
                  (o) => o.type === 'MOVE_BATTALION' && o.battalionId === a.id,
                ),
            )
            .map((a) => (
              <div className="order-row" key={a.id}>
                <ArrowRight size={15} />
                <span>
                  <strong>{a.name}</strong>
                  <small>Rota contínua · {a.pathQueue.length} rodada(s) restante(s)</small>
                </span>
                <button
                  disabled={game.phase !== 'planning'}
                  onClick={() => command({ type: 'CANCEL_ORDER', key: `army:${a.id}` })}
                >
                  Parar
                </button>
              </div>
            ))}
          <p className="fine-print">
            Ouro reservado é liberado ao cancelar. Mercenários e diplomacia são imediatos.
          </p>
        </div>
      )}
      {tab === 'reports' && (
        <div className="reports-content">
          {!report ? (
            <Empty>O primeiro relatório chegará após a resolução da rodada.</Empty>
          ) : (
            <>
              <div className="report-toolbar">
                <label>
                  Rodada
                  <select value={report.turn} onChange={(e) => setTurn(Number(e.target.value))}>
                    {game.history.map((h) => (
                      <option key={h.turn} value={h.turn}>
                        Rodada {h.turn} · {h.battles.length} batalha(s)
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => onReplay(report)}>
                  <Play size={14} />
                  Rever Animação do Turno
                </button>
              </div>
              <div className="report-counts">
                <span>{report.movements.length} movimentos</span>
                <span>{report.retreats.length} recuos</span>
                <span>{report.stackwipes.length} aniquilações</span>
                <span>{report.rebellions.length} revoltas</span>
              </div>
              {report.battles.map((b) => (
                <details className="battle-report" key={b.id}>
                  <summary>
                    <Swords size={15} />
                    <span>
                      {game.provinces.find((p) => p.id === b.provinceId)?.name}
                      <small>
                        {game.players.find((p) => p.id === b.winnerId)?.nation ?? 'Forças locais'} ·{' '}
                        {b.outcome === 'siege_blocked'
                          ? 'cerco interrompido'
                          : b.stackwipe
                            ? 'aniquilação'
                            : b.outcome === 'attacker_victory'
                              ? 'vitória ofensiva'
                              : 'defesa preservada'}
                      </small>
                    </span>
                    <b>−{b.attackerCasualties + b.defenderCasualties}</b>
                  </summary>
                  <div className="battle-detail">
                    <div className="ledger-grid">
                      <div>
                        <small>PODER OFENSIVO</small>
                        <strong>{number(b.attackPower, 2)}</strong>
                      </div>
                      <div>
                        <small>PODER DEFENSIVO</small>
                        <strong>{number(b.defensePower, 2)}</strong>
                      </div>
                    </div>
                    <p>
                      Baixas: {b.attackerCasualties} no ataque / {b.defenderCasualties} na defesa.
                    </p>
                    <p>
                      Moral: {number(b.attackerMoraleBefore)} → {number(b.attackerMoraleAfter)} /{' '}
                      {number(b.defenderMoraleBefore)} → {number(b.defenderMoraleAfter)}.
                    </p>
                    <p>
                      Terreno {number(b.terrainDefenseBonus, 2)}× · fortes {b.fortLevel},
                      neutralizados {b.neutralizedFortLevels} · bloqueio{' '}
                      {number(b.blockadeModifier, 2)}×.
                    </p>
                    <p>
                      Treinamento {number(b.attackerTraining, 2)}× / {number(b.defenderTraining, 2)}
                      ×. Cavalaria {number(b.cavalryModifier, 2)}×; artilharia{' '}
                      {number(b.artilleryModifier, 2)}×.
                    </p>
                    {b.retreatDestinationId && (
                      <p>
                        Recuo para{' '}
                        {game.provinces.find((p) => p.id === b.retreatDestinationId)?.name}.
                      </p>
                    )}
                    <button onClick={() => onFocus(b.provinceId)}>Ver região no mapa</button>
                  </div>
                </details>
              ))}
              {report.battles.length === 0 && (
                <p className="muted">Nenhuma batalha nesta rodada.</p>
              )}
              {report.retreats.length > 0 && (
                <details className="command-details">
                  <summary>Recuos e repatriações</summary>
                  {report.retreats.map((r, i) => (
                    <p key={`${r.armyId}-${i}`} className="fine-print">
                      {game.players.find((p) => p.id === r.ownerId)?.nation ?? 'Milícia local'}:{' '}
                      {r.regrouped}/{r.survivors} tropas para{' '}
                      {game.provinces.find((p) => p.id === r.toProvinceId)?.name ??
                        'posição isolada'}{' '}
                      · {RETREAT_LABELS[r.reason]}.
                    </p>
                  ))}
                </details>
              )}
              <details className="command-details">
                <summary>
                  <Coins size={15} />
                  Economia e mundo
                </summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Nação</th>
                        <th>Renda bruta</th>
                        <th>Manutenção</th>
                        <th>Ouro final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.economy.map((e) => (
                        <tr key={e.playerId}>
                          <td>{game.players.find((p) => p.id === e.playerId)?.nation}</td>
                          <td>{number(e.grossIncome, 1)}</td>
                          <td>{number(e.upkeep, 1)}</td>
                          <td>{number(e.gold, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="fine-print">
                  Estações e crises alteram suprimento, moral e renda. Coalizões contêm a expansão
                  agressiva.
                </p>
              </details>
              <details className="command-details">
                <summary>Crônica da rodada</summary>
                {[
                  ...new Set([...report.events, ...report.diplomaticChanges.map((c) => c.text)]),
                ].map((text, i) => (
                  <p className="chronicle-line" key={i}>
                    {text}
                  </p>
                ))}
              </details>
            </>
          )}
        </div>
      )}
      {tab === 'chat' && (
        <div className="chat-content">
          <div className="chat-messages">
            {game.chat.length === 0 && (
              <Empty>Uma proposta pode mudar o destino de uma guerra.</Empty>
            )}
            {game.chat.map((m) => (
              <p key={m.id}>
                <strong style={{ color: game.players.find((p) => p.id === m.playerId)?.color }}>
                  {game.players.find((p) => p.id === m.playerId)?.name}
                </strong>
                {m.text}
              </p>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!message.trim()) return;
              command({ type: 'CHAT', text: message.trim() });
              setMessage('');
            }}
          >
            <input
              aria-label="Mensagem ao conselho"
              maxLength={280}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Uma proposta ao conselho…"
            />
            <button type="submit" aria-label="Enviar mensagem" disabled={!message.trim()}>
              <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
