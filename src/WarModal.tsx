import { useState } from 'react';
import type { CasusBelli, GameView } from '../shared/types';
import { getRelation } from '../shared/rules';
import { hegemonicThreat } from '../shared/strategy';
import type { Command } from './ui';
export default function WarModal({
  game,
  playerId,
  targetId,
  armyId,
  provinceId,
  bridgeFleetId,
  command,
  close,
}: {
  game: GameView;
  playerId: string;
  targetId: string;
  armyId?: string;
  provinceId?: string;
  bridgeFleetId?: string;
  command: Command;
  close: () => void;
}) {
  const [cb, setCB] = useState<CasusBelli>('CONQUEST'),
    [allies, setAllies] = useState<string[]>([]);
  const target = game.players.find((p) => p.id === targetId)!,
    me = game.players.find((p) => p.id === playerId)!,
    r = getRelation(game, playerId, targetId)!;
  const available = game.players.filter(
    (p) => p.id !== targetId && p.id !== playerId && getRelation(game, playerId, p.id)?.allied,
  );
  const coalition = game.coalitions.find(
    (c) => c.targetId === targetId && c.memberIds.includes(playerId),
  );
  const blocked =
    r.allied || r.truceUntil >= game.turn || !!me.subjectOfId || game.phase !== 'planning';
  return (
    <div className="modal-backdrop">
      <section
        className="game-modal war-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Ato de Guerra contra ${target.nation}`}
      >
        <h2>⚔️ Ato de Guerra contra {target.nation}</h2>
        <p>
          {provinceId
            ? `Marchar sobre ${game.provinces.find((p) => p.id === provinceId)?.name} exige uma Declaração Formal de Guerra.`
            : 'Escolha a justificativa e os aliados para esta campanha.'}
        </p>
        <label>
          Casus Belli
          <select value={cb} onChange={(e) => setCB(e.target.value as CasusBelli)}>
            <option value="CONQUEST">Conquista · +20 ameaça</option>
            <option value="HOLY_WAR" disabled={me.faith === target.faith}>
              Guerra Santa
            </option>
            <option value="HUMILIATION">Humilhação · +10 ameaça</option>
            <option value="COALITION" disabled={!coalition || !hegemonicThreat(game, targetId)}>
              Coalizão
            </option>
          </select>
        </label>
        {available.length > 0 && cb !== 'COALITION' && (
          <fieldset>
            <legend>Convocar aliados</legend>
            {available.map((p) => (
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
        {blocked && (
          <p className="warning-box">
            Rompa a aliança, aguarde a trégua ou obtenha independência antes de declarar guerra.
          </p>
        )}
        <div className="button-pair">
          <button
            className="danger-button"
            disabled={blocked}
            onClick={() => {
              command(
                armyId && provinceId
                  ? {
                      type: 'DECLARE_WAR_AND_MOVE',
                      targetRealmId: targetId,
                      casusBelli: cb,
                      offensiveAllyIds: allies,
                      battalionId: armyId,
                      targetProvinceId: provinceId,
                      bridgeFleetId,
                    }
                  : {
                      type: 'DECLARE_WAR',
                      targetRealmId: targetId,
                      casusBelli: cb,
                      offensiveAllyIds: allies,
                    },
              );
              close();
            }}
          >
            {armyId ? '⚔️ Declarar Guerra e Marchar!' : '⚔️ Declarar Guerra'}
          </button>
          <button onClick={close}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}
