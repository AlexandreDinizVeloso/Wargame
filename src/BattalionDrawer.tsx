import { useMemo, useState } from 'react';
import { Anchor, ArrowUpRight, Merge, Shield, Split, Swords, Target } from 'lucide-react';
import type { Battalion, Composition, GameView, PlayerOrder } from '../shared/types';
import { canTransit, compositionOf, UNIT_KEYS, unitCount, unitPath } from '../shared/rules';
import { Empty, Meter, number, type Command } from './ui';
export default function BattalionDrawer({
  game,
  army,
  playerId,
  command,
  onFocus,
  onSelect,
}: {
  game: GameView;
  army: Battalion;
  playerId: string;
  command: Command;
  onFocus: () => void;
  onSelect: (id: string) => void;
}) {
  const own = army.ownerId === playerId,
    active = own && game.phase === 'planning',
    location = game.provinces.find((p) => p.id === army.provinceId)!;
  const [destination, setDestination] = useState(''),
    [mergeId, setMerge] = useState(''),
    [fleetId, setFleet] = useState(''),
    [landingId, setLanding] = useState(''),
    [split, setSplit] = useState<Composition>(
      compositionOf({ [UNIT_KEYS.find((k) => army[k] > 0) ?? 'infantry']: 1 }),
    );
  const targets = useMemo(
    () =>
      game.provinces
        .filter((p) => p.id !== army.provinceId)
        .map((p) => ({ p, path: unitPath(game, army, p.id) }))
        .filter((v) => v.path && v.path.length > 0)
        .sort((a, b) => a.path!.length - b.path!.length),
    [game, army],
  );
  const compatible = game.battalions.filter(
    (a) =>
      a.id !== army.id &&
      a.ownerId === playerId &&
      a.provinceId === army.provinceId &&
      a.isFleet === army.isFleet &&
      a.isMercenary === army.isMercenary &&
      !a.embarkedOnId &&
      !a.embarkedArmyId,
  );
  const fleets = game.battalions.filter(
    (a) =>
      a.ownerId === playerId &&
      a.isFleet &&
      !a.stranded &&
      !a.embarkedArmyId &&
      a.transports * 4 >= unitCount(army) &&
      (a.provinceId === army.provinceId || location.neighbors.includes(a.provinceId)),
  );
  const carriedBy = army.embarkedOnId
    ? game.battalions.find((a) => a.id === army.embarkedOnId)
    : null;
  const landings = carriedBy
    ? game.provinces.filter(
        (p) =>
          p.kind === 'LAND' &&
          p.isCoastal &&
          (p.id === carriedBy.provinceId ||
            game.provinces.find((q) => q.id === carriedBy.provinceId)!.neighbors.includes(p.id)) &&
          canTransit(game, playerId, p),
      )
    : [];
  const send = (order: PlayerOrder) => command({ type: 'SUBMIT_ORDER', order });
  const fields = army.isFleet
    ? (['warships', 'transports'] as const)
    : (['infantry', 'cavalry', 'artillery'] as const);
  return (
    <div className="battalion-ledger">
      <div className="region-heading">
        <div>
          <span className="eyebrow">{army.isFleet ? 'COMANDO NAVAL' : 'COMANDO TERRESTRE'}</span>
          <h2>{army.name}</h2>
          <span>
            {location.name} ·{' '}
            {game.players.find((p) => p.id === army.ownerId)?.nation ?? 'Forças locais'}
          </span>
        </div>
        <button className="icon-button" title="Centralizar batalhão" onClick={onFocus}>
          <ArrowUpRight size={18} />
        </button>
      </div>
      {own && (
        <label>
          Suas formações
          <select value={army.id} onChange={(e) => onSelect(e.target.value)}>
            {game.battalions
              .filter((a) => a.ownerId === playerId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {game.provinces.find((p) => p.id === a.provinceId)?.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="composition-summary">
        {fields.map((key) => (
          <div key={key}>
            <small>
              {
                {
                  infantry: 'INFANTARIA',
                  cavalry: 'CAVALARIA',
                  artillery: 'ARTILHARIA',
                  warships: 'GUERRA',
                  transports: 'TRANSPORTES',
                }[key]
              }
            </small>
            <strong>{army[key]}</strong>
          </div>
        ))}
      </div>
      <Meter label="Moral" value={army.morale} tone={army.morale > 50 ? 'green' : 'red'} />
      <Meter
        label="Treinamento"
        value={(army.training - 1) * 200}
        display={`${number(army.training, 2)}×`}
      />
      {army.entrenched && (
        <p className="success-box">
          <Shield size={15} />
          Entrincheirado · +15% defesa.
        </p>
      )}
      {army.isMercenary && <p className="muted">Mercenários · manutenção 2,2×.</p>}
      {army.stranded && (
        <p className="warning-box">Formação isolada. Tentará se reagrupar na próxima rodada.</p>
      )}
      {army.embarkedOnId && (
        <p className="success-box">
          <Anchor size={15} />
          Embarcado em {carriedBy?.name}.
        </p>
      )}
      {army.embarkedArmyId && (
        <p className="success-box">
          Transportando {game.battalions.find((a) => a.id === army.embarkedArmyId)?.name} ·
          capacidade {army.transports * 4}.
        </p>
      )}
      {!army.isFleet && army.infantry < army.artillery && (
        <p className="warning-box">Artilharia exposta: +75% de baixas nos canhões.</p>
      )}
      {army.pathQueue.length > 0 && (
        <div className="route-summary">
          <span className="eyebrow">ROTA EM CURSO</span>
          <p>
            {army.pathQueue.map((id) => game.provinces.find((p) => p.id === id)?.name).join(' → ')}
          </p>
          {active && (
            <button onClick={() => command({ type: 'CANCEL_ORDER', key: `army:${army.id}` })}>
              Interromper rota
            </button>
          )}
        </div>
      )}
      {own && !army.embarkedOnId && (
        <>
          <div className="field-heading">Ordens de formação</div>
          <p className="fine-print">
            Clique direito no mapa para calcular uma rota. Cada rodada percorre uma ligação.
          </p>
          <label>
            Destino
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Escolha uma região acessível</option>
              {targets.map(({ p, path }) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {path!.length} rodada(s)
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={!active || !destination || army.stranded}
            onClick={() =>
              send({ type: 'MOVE_BATTALION', battalionId: army.id, targetProvinceId: destination })
            }
          >
            <Target size={15} />
            Preparar rota
          </button>
          <div className="button-pair">
            <button
              disabled={!active || army.isFleet || army.stranded}
              onClick={() => send({ type: 'ENTRENCH_BATTALION', battalionId: army.id })}
            >
              <Shield size={15} />
              Entrincheirar
            </button>
            <button
              disabled={!active || army.training >= 1.5 || army.stranded}
              title="6 ouro; +0,10 treinamento e +8 moral."
              onClick={() => send({ type: 'TRAIN_BATTALION', battalionId: army.id })}
            >
              <Swords size={15} />
              Treinar · 6 ouro
            </button>
          </div>
          <details className="command-details">
            <summary>
              <Split size={15} />
              Dividir batalhão
            </summary>
            <div className="composition-inputs">
              {fields.map((k) => (
                <label key={k}>
                  {
                    {
                      infantry: 'Infantaria',
                      cavalry: 'Cavalaria',
                      artillery: 'Artilharia',
                      warships: 'Navios de guerra',
                      transports: 'Transportes',
                    }[k]
                  }
                  <input
                    aria-label={`Dividir ${{ infantry: 'infantaria', cavalry: 'cavalaria', artillery: 'artilharia', warships: 'navios de guerra', transports: 'transportes' }[k]}`}
                    type="number"
                    min={0}
                    max={army[k]}
                    value={split[k]}
                    onChange={(e) =>
                      setSplit((c) => ({
                        ...c,
                        [k]: Math.max(0, Math.min(army[k], Number(e.target.value) || 0)),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              disabled={
                !active ||
                !!army.embarkedArmyId ||
                unitCount(split) < 1 ||
                unitCount(split) >= unitCount(army)
              }
              onClick={() =>
                send({ type: 'SPLIT_BATTALION', battalionId: army.id, composition: split })
              }
            >
              Confirmar divisão
            </button>
          </details>
          <details className="command-details">
            <summary>
              <Merge size={15} />
              Fundir formações
            </summary>
            {compatible.length ? (
              <>
                <label>
                  Formação de destino
                  <select
                    value={mergeId || compatible[0].id}
                    onChange={(e) => setMerge(e.target.value)}
                  >
                    {compatible.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!active || !!army.embarkedArmyId}
                  onClick={() =>
                    send({
                      type: 'MERGE_BATTALIONS',
                      battalionId: army.id,
                      targetBattalionId: mergeId || compatible[0].id,
                    })
                  }
                >
                  Confirmar fusão
                </button>
              </>
            ) : (
              <Empty>É necessário outro batalhão compatível na mesma província.</Empty>
            )}
          </details>
        </>
      )}
      {own && !army.isFleet && (
        <details className="command-details" open={!!army.embarkedOnId}>
          <summary>
            <Anchor size={15} />
            Transporte marítimo
          </summary>
          {army.embarkedOnId ? (
            <>
              <label>
                Costa de desembarque
                <select
                  value={landingId || landings[0]?.id || ''}
                  onChange={(e) => setLanding(e.target.value)}
                >
                  {landings.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!active || landings.length === 0}
                onClick={() =>
                  send({
                    type: 'EMBARK_BATTALION',
                    battalionId: army.id,
                    disembarkProvinceId: landingId || landings[0].id,
                  })
                }
              >
                Desembarcar batalhão
              </button>
            </>
          ) : fleets.length && location.portLevel >= 1 ? (
            <>
              <label>
                Frota de transporte
                <select value={fleetId || fleets[0].id} onChange={(e) => setFleet(e.target.value)}>
                  {fleets.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · capacidade {f.transports * 4}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!active}
                onClick={() =>
                  send({
                    type: 'EMBARK_BATTALION',
                    battalionId: army.id,
                    fleetId: fleetId || fleets[0].id,
                  })
                }
              >
                Embarcar batalhão
              </button>
            </>
          ) : (
            <Empty>
              Reúna uma frota com capacidade suficiente em um porto ou zona marítima adjacente.
            </Empty>
          )}
        </details>
      )}
    </div>
  );
}
