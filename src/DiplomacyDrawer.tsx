import { useState } from 'react';
import {
  ArrowDownToLine,
  Ban,
  Bot,
  Coins,
  Flag,
  Handshake,
  MoveRight,
  Shield,
  Skull,
  Sparkles,
  Users,
} from 'lucide-react';
import { OBJECTIVES } from '../shared/types';
import type { DiplomaticOrder, GameView, Player } from '../shared/types';
import { reservedResources } from '../shared/rules';
import { number, ObjectiveIcon, type Command } from './ui';

export default function DiplomacyDrawer({
  game,
  me,
  selectedId,
  onSelect,
  command,
}: {
  game: GameView;
  me: Player;
  selectedId: string;
  onSelect: (id: string) => void;
  command: Command;
}) {
  const [money, setMoney] = useState(12),
    [tribute, setTribute] = useState(3),
    [provinceId, setProvinceId] = useState('');
  const target = game.players.find((p) => p.id === selectedId),
    relation = target
      ? game.relations.find(
          (r) => (r.a === me.id && r.b === target.id) || (r.b === me.id && r.a === target.id),
        )
      : undefined;
  const reserved = reservedResources(
      { orders: { [me.id]: game.plannedOrders }, provinces: game.provinces },
      me.id,
    ),
    free = me.gold - reserved.gold,
    locked = me.ready || game.phase !== 'planning';
  const owned = game.provinces.filter((p) => p.ownerId === target?.id),
    targetProvince = owned.some((p) => p.id === provinceId) ? provinceId : (owned[0]?.id ?? '');
  const pending = (kind: 'alliance' | 'military_access' | 'tribute') =>
    game.offers.some(
      (o) =>
        o.kind === kind &&
        ((o.from === me.id && o.to === target?.id) || (o.to === me.id && o.from === target?.id)),
    );
  const act = (action: DiplomaticOrder['action'], amount?: number, targetProvinceId?: string) => {
    if (!target) return;
    const order: DiplomaticOrder = { type: 'DIPLOMACY', action, targetRealmId: target.id };
    if (amount !== undefined) order.amount = amount;
    if (targetProvinceId) order.targetProvinceId = targetProvinceId;
    command({ type: 'SUBMIT_ORDER', order });
  };
  return (
    <div className="diplomacy-inspector">
      <div className="drawer-intro">
        <div className="eyebrow">PACTOS & INTERESSES</div>
        <h2>O conselho dos reinos</h2>
        <p>Cada tratado altera o tabuleiro. Escolha uma nação para ver suas relações no mapa.</p>
      </div>
      {game.offers
        .filter((o) => o.to === me.id)
        .map((o) => (
          <div className="diplomatic-offer" key={o.id}>
            <Handshake size={17} />
            <div>
              <strong>{game.players.find((p) => p.id === o.from)?.nation}</strong>
              <p>
                {o.kind === 'alliance'
                  ? 'Propõe uma aliança.'
                  : o.kind === 'military_access'
                    ? 'Solicita acesso ao seu território.'
                    : `Exige ${o.amount} ouro por rodada, por 5 rodadas.`}
              </p>
              <div>
                <button
                  className="button primary small-button"
                  disabled={game.phase !== 'planning'}
                  onClick={() => command({ type: 'ANSWER_OFFER', offerId: o.id, accept: true })}
                >
                  Aceitar
                </button>
                <button
                  className="button ghost small-button"
                  disabled={game.phase !== 'planning'}
                  onClick={() => command({ type: 'ANSWER_OFFER', offerId: o.id, accept: false })}
                >
                  Recusar
                </button>
              </div>
            </div>
          </div>
        ))}
      <div className="realm-list">
        {game.players.map((p) => {
          const r = game.relations.find(
              (r) => (r.a === me.id && r.b === p.id) || (r.b === me.id && r.a === p.id),
            ),
            progress = Math.max(...Object.values(p.victoryProgress));
          return (
            <button
              key={p.id}
              className={`realm-row ${selectedId === p.id ? 'active' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="nation-shield" style={{ color: p.color, borderColor: p.color }}>
                <Flag size={16} />
              </span>
              <div>
                <strong>
                  {p.nation}
                  {p.id === me.id ? ' · você' : ''}
                </strong>
                <small>
                  {p.bot ? <Bot size={10} /> : <Users size={10} />} {p.name}
                  {!p.online && !p.bot ? ' · ausente' : ''}
                </small>
                <div className="mini-progress">
                  <i style={{ width: `${progress}%`, background: p.color }} />
                </div>
              </div>
              <span className="realm-relation">
                {p.id === me.id ? '—' : `${(r?.trust ?? 0) > 0 ? '+' : ''}${r?.trust ?? 0}`}
                <small>{number(progress)}% legado</small>
              </span>
            </button>
          );
        })}
      </div>
      {target && (
        <section className="selected-realm">
          <div className="section-title">
            <h3 style={{ color: target.color }}>{target.nation}</h3>
            <span className={`badge ${relation?.atWar ? 'red' : relation?.allied ? 'blue' : ''}`}>
              {target.id === me.id
                ? 'SEU REINO'
                : relation?.allied
                  ? 'ALIADO'
                  : relation?.atWar
                    ? 'EM GUERRA'
                    : relation && relation.truceUntil >= game.turn
                      ? 'TRÉGUA'
                      : 'NEUTRO'}
            </span>
          </div>
          <div className="realm-progress">
            {Object.entries(OBJECTIVES).map(([id, o]) => (
              <div key={id}>
                <ObjectiveIcon objective={id as Player['objective']} size={13} />
                <span>{o.name}</span>
                <strong>{number(target.victoryProgress[id as Player['objective']], 1)}%</strong>
              </div>
            ))}
          </div>
          {target.id !== me.id && (
            <>
              <p className="tiny muted">
                Relações com seu reino: {relation?.trust ?? 0} / 100. Máximo de duas alianças.
                Tratados exigem consentimento.
              </p>
              {relation && relation.truceUntil >= game.turn && !relation.allied && (
                <p className="diplomacy-note">Trégua até o fim da rodada {relation.truceUntil}.</p>
              )}
              <div className="diplomatic-actions">
                <button
                  className="button outline full"
                  disabled={locked || pending('alliance') || !owned.length}
                  onClick={() => act(relation?.allied ? 'BREAK_ALLIANCE' : 'PROPOSE_ALLIANCE')}
                  title={
                    relation?.allied
                      ? game.hegemonyLeaderId === target.id
                        ? 'Sem penalidade de estabilidade nem trégua contra a hegemonia.'
                        : '−4 influência, −10 moral, −50 confiança; trégua nesta rodada e na próxima.'
                      : 'Aliança requer aceitação; impede ataques mútuos.'
                  }
                >
                  <Handshake size={16} />
                  {relation?.allied
                    ? 'Romper aliança'
                    : pending('alliance')
                      ? 'Proposta pendente'
                      : 'Propor aliança'}
                </button>
                <button
                  className="button outline full"
                  disabled={
                    locked ||
                    pending('military_access') ||
                    relation?.militaryAccess.includes(me.id) ||
                    relation?.atWar ||
                    !owned.length
                  }
                  onClick={() => act('MILITARY_ACCESS')}
                  title="Solicita trânsito para suas tropas. O território continua pertencendo ao reino anfitrião."
                >
                  <MoveRight size={16} />
                  {relation?.militaryAccess.includes(me.id)
                    ? 'Acesso militar concedido'
                    : 'Solicitar acesso militar'}
                </button>
                <button
                  className="button outline full"
                  disabled={locked || !owned.length}
                  onClick={() => act('EMBARGO')}
                  title="Renda comercial do alvo −15%, sua própria −5%. A imposição reduz confiança em 25."
                >
                  <Ban size={16} />
                  {relation?.embargoes.includes(me.id) ? 'Retirar embargo' : 'Embargo comercial'}
                </button>
              </div>
              <div className="diplo-finance">
                <label>
                  Tributo por rodada
                  <input
                    aria-label="Valor do tributo"
                    type="number"
                    min={1}
                    max={30}
                    value={tribute}
                    onChange={(e) =>
                      setTribute(Math.max(1, Math.min(30, Math.floor(Number(e.target.value) || 1))))
                    }
                  />
                </label>
                <button
                  className="button outline full"
                  disabled={locked || pending('tribute') || !owned.length}
                  onClick={() => act('DEMAND_TRIBUTE', tribute)}
                  title="O alvo deve aceitar. Dura 5 rodadas e cria uma trégua curta."
                >
                  <ArrowDownToLine size={15} />
                  Exigir tributo · {tribute} ouro/rod.
                </button>
                <label>
                  Ouro para subsídio / rebeldes
                  <input
                    aria-label="Ouro para ação diplomática"
                    type="number"
                    min={1}
                    value={money}
                    onChange={(e) => setMoney(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                </label>
                <button
                  className="button outline full"
                  disabled={locked || money > free || !owned.length}
                  onClick={() => act('SEND_SUBSIDY', money)}
                  title="Transferência imediata de ouro livre; melhora a confiança em 10."
                >
                  <Coins size={15} />
                  Enviar subsídio · {money} ouro
                </button>
                <label>
                  Província do reino alvo
                  <select value={targetProvince} onChange={(e) => setProvinceId(e.target.value)}>
                    {owned.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · revolta {p.unrest}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button danger full"
                  disabled={locked || money < 12 || money > free || !targetProvince}
                  onClick={() => act('FUND_REBELS', money, targetProvince)}
                  title="Efeito imediato: +30 de revolta. Custo mínimo 12 ouro. A autoria é ocultada dos demais nos relatórios."
                >
                  <Skull size={15} />
                  Financiar rebeldes · {money} ouro
                </button>
                <p className="tiny muted">
                  Ouro livre: {number(free, 2)}. Embargos, subsídios e financiamento têm efeito
                  imediato; não entram na fila de ordens.
                </p>
              </div>
              {game.hostId === me.id && !target.online && !target.bot && (
                <button
                  className="button ghost full"
                  disabled={game.phase !== 'planning'}
                  title="A substituição encerra a sessão desse jogador na campanha."
                  onClick={() => command({ type: 'REPLACE_WITH_BOT', playerId: target.id })}
                >
                  <Bot size={15} />
                  Substituir ausente por bot
                </button>
              )}
            </>
          )}
          {target.id === me.id && (
            <p className="small muted">
              Religião estatal: {me.faith}. Estabilidade: {number(me.stability)}%. Seus pactos e
              acordos aparecem ao selecionar outro reino.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
