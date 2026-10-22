import { useState } from 'react';
import type { Battalion, GameView, Province } from '../shared/types';
import {
  bombardmentBlock,
  BOMBARDMENT_COST,
  MARITIME_CAP,
  seaTradeNodes,
} from '../shared/maritime';
import { reservedResources } from '../shared/rules';
import type { Command } from './ui';
export function SeaTradeCard({ game, sea }: { game: GameView; sea: Province }) {
  const node = seaTradeNodes(game).find((n) => n.seaId === sea.id);
  if (!node) return null;
  return (
    <section className="sea-trade-card">
      <h3>⚓ Nó comercial · {node.value} ouro/rodada</h3>
      <p>
        {node.contested
          ? 'Disputado: nenhuma receita enquanto houver empate ou bloqueio hostil.'
          : node.ownerId
            ? `Controle: ${game.players.find((p) => p.id === node.ownerId)?.nation}`
            : 'Sem controlador.'}
      </p>
      <p className="fine-print">
        Exige navio de guerra e transporte livres, com moral ≥25. Maior presença naval sem empate;
        teto nacional de {MARITIME_CAP} ouro.
      </p>
      {node.contenders.map((c) => (
        <small key={c.ownerId}>
          {game.players.find((p) => p.id === c.ownerId)?.nation}: {c.warships} navios de guerra,{' '}
          {c.transports} transportes · presença {c.power}
        </small>
      ))}
    </section>
  );
}
export function FleetOperations({
  game,
  army,
  playerId,
  command,
}: {
  game: GameView;
  army: Battalion;
  playerId: string;
  command: Command;
}) {
  const [targetId, setTarget] = useState('');
  const targets = game.provinces.filter(
    (p) =>
      p.kind === 'LAND' &&
      p.isCoastal &&
      game.provinces.find((s) => s.id === army.provinceId)?.neighbors.includes(p.id),
  );
  const target = targets.find((p) => p.id === targetId) ?? targets[0],
    reason = target
      ? bombardmentBlock(game, army, target)
      : 'Posicione a frota numa zona marítima adjacente à costa.';
  const actor = game.players.find((p) => p.id === playerId)!,
    reserved = reservedResources(
      { ...game, orders: { [playerId]: game.plannedOrders } },
      playerId,
      `army:${army.id}`,
    );
  return (
    <section className="fleet-operations">
      <h3>Operações navais</h3>
      <p className="fine-print">
        Guerra + transporte permitem disputar nós comerciais. Três navios de guerra permitem
        bombardeio pago.
      </p>
      <label>
        Costa para bombardear
        <select value={target?.id ?? ''} onChange={(e) => setTarget(e.target.value)}>
          {!targets.length && <option value="">Nenhuma costa alcançável</option>}
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · forte {p.fortLevel}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={
          game.phase !== 'planning' ||
          actor.ready ||
          !!reason ||
          actor.gold - reserved.gold < BOMBARDMENT_COST
        }
        title={
          reason ??
          'Uma ordem naval: remove um nível de forte e enfraquece a defesa contra sua nação até a próxima rodada.'
        }
        onClick={() => {
          if (target)
            command({
              type: 'SUBMIT_ORDER',
              order: { type: 'BOMBARD_COAST', battalionId: army.id, targetProvinceId: target.id },
            });
        }}
      >
        💥 Bombardear costa · {BOMBARDMENT_COST} ouro
      </button>
      {reason && <p className="fine-print">{reason}</p>}
    </section>
  );
}
