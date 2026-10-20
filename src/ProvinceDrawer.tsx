import { useState } from 'react';
import {
  ArrowRight,
  Castle,
  Coins,
  Crosshair,
  Flag,
  Handshake,
  Landmark,
  Leaf,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Tent,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { TERRAIN_LABELS } from '../shared/map';
import type { GameView, Player, PlayerOrder, Province } from '../shared/types';
import {
  attritionLoss,
  effectiveTax,
  orderCost,
  orderKey,
  reservedResources,
  supplyLimit,
} from '../shared/rules';
import { Meter, number, type Command } from './ui';
import { legalDestination } from './orders';

export function ProvinceDrawer({
  game,
  me,
  province: p,
  command,
  onMarch,
  onFocus,
  onDiplomacy,
}: {
  game: GameView;
  me: Player;
  province: Province;
  command: Command;
  onMarch: (p: Province) => void;
  onFocus: () => void;
  onDiplomacy: (id: string) => void;
}) {
  const [amount, setAmount] = useState(3),
    owner = game.players.find((x) => x.id === p.ownerId),
    mine = p.ownerId === me.id,
    army = mine
      ? p
      : game.stationedArmies.find((a) => a.ownerId === me.id && a.provinceId === p.id);
  const totalTroops =
      p.troops +
      game.stationedArmies.filter((a) => a.provinceId === p.id).reduce((n, a) => n + a.troops, 0),
    supply = supplyLimit(p),
    losses = attritionLoss(totalTroops, supply),
    locked = me.ready || game.phase !== 'planning';
  const budget = { orders: { [me.id]: game.plannedOrders }, provinces: game.provinces };
  const conversionRange =
    mine || game.provinces.some((q) => q.ownerId === me.id && q.neighbors.includes(p.id));
  function action(o: PlayerOrder) {
    command({ type: 'SUBMIT_ORDER', order: o });
  }
  const actions = [
    {
      label: 'Recrutar tropas',
      Icon: Users,
      order: { type: 'RECRUIT', provinceId: p.id, amount } as PlayerOrder,
      description: `${amount} recrutas, treinamento 1,00. Consome reservas de população.`,
      blocked: !mine ? 'Somente em província própria.' : '',
    },
    {
      label: 'Contratar mercenários',
      Icon: Coins,
      order: { type: 'RECRUIT', provinceId: p.id, amount, isMercenary: true } as PlayerOrder,
      description: 'Contratação imediata. Sem reservas, treinamento 1,00 e manutenção 2,2×.',
      blocked: !mine
        ? 'Somente em província própria.'
        : !p.capital && p.pacification < 80
          ? 'Exige capital ou pacificação ≥ 80.'
          : '',
    },
    {
      label: 'Treinar exército',
      Icon: Shield,
      order: { type: 'TRAIN', provinceId: p.id } as PlayerOrder,
      description: '+0,10 treinamento (máximo 1,50) e +8 moral.',
      blocked:
        !army || army.troops === 0
          ? 'Não há tropas suas nesta província.'
          : army.training >= 1.5
            ? 'Treinamento máximo.'
            : '',
    },
    {
      label: 'Pacificar província',
      Icon: Leaf,
      order: { type: 'PACIFY', provinceId: p.id } as PlayerOrder,
      description: '+35 pacificação e −25 revolta, além da guarnição parada.',
      blocked: !mine
        ? 'Somente em província própria.'
        : p.pacification === 100 && p.unrest === 0
          ? 'Já está pacificada.'
          : '',
    },
    {
      label: 'Converter fé',
      Icon: Sun,
      order: { type: 'CONVERT', targetProvinceId: p.id } as PlayerOrder,
      description:
        'Duas missões concluem a conversão. Em terra rival, gera +20 revolta e uma pretensão religiosa.',
      blocked:
        p.religion === me.faith
          ? 'A crença local já é a sua.'
          : !conversionRange
            ? 'Exige província própria adjacente.'
            : owner &&
                owner.id !== me.id &&
                game.relations.some(
                  (r) =>
                    r.allied &&
                    ((r.a === me.id && r.b === owner.id) || (r.b === me.id && r.a === owner.id)),
                )
              ? 'Missões hostis não podem visar um aliado.'
              : '',
    },
    {
      label: 'Construir forte',
      Icon: Castle,
      order: { type: 'BUILD_FORT', provinceId: p.id } as PlayerOrder,
      description: '+15% defesa e +3 suprimento por nível. Um cerco exige 3 tropas por nível.',
      blocked: !mine
        ? 'Somente em província própria.'
        : p.fortLevel >= 3
          ? 'Forte no nível máximo.'
          : '',
    },
    {
      label: 'Investir no comércio',
      Icon: Landmark,
      order: { type: 'DEVELOP', provinceId: p.id } as PlayerOrder,
      description: '+1,5 renda comercial por nível (máximo 3).',
      blocked: !mine
        ? 'Somente em província própria.'
        : p.development >= 3
          ? 'Desenvolvimento máximo.'
          : '',
    },
  ];
  const planned = game.plannedOrders.find((o) => orderKey(o) === p.id);
  return (
    <div className="province-inspector">
      <div className="region-heading">
        <span style={{ color: owner?.color }}>
          <Flag size={13} />
          {owner?.nation ?? 'Forças locais'}
        </span>
        <h1>{p.name}</h1>
        <div>
          <span>{TERRAIN_LABELS[p.terrain]}</span>
          <span>Defesa {number((p.terrainDefenseBonus - 1) * 100)}%</span>
          <button className="icon-button" onClick={onFocus} aria-label="Centralizar província">
            <Crosshair size={14} />
          </button>
        </div>
      </div>
      {army && !mine && (
        <div className="inline-notice">
          <Shield size={15} />
          <span>
            Seu destacamento: <strong>{army.troops} tropas</strong>. O território permanece sob
            controle de {owner?.nation}.
          </span>
        </div>
      )}
      <div className="province-ledger">
        <div>
          <Coins />
          <small>IMPOSTO EFETIVO / BASE</small>
          <strong>
            {number(effectiveTax(p, owner?.faith ?? p.religion), 2)} <span>/ {p.baseTax}</span>
          </strong>
        </div>
        <div className={losses ? 'danger-text' : ''}>
          <Tent />
          <small>EXÉRCITO / SUPRIMENTO</small>
          <strong>
            {totalTroops}
            <span> / {supply}</span>
          </strong>
        </div>
      </div>
      {losses > 0 && (
        <div className="inline-notice danger">
          <TriangleAlert size={15} />
          <span>
            Previsão de atrito: <strong>−{losses} tropas</strong> no fim da rodada. O excesso também
            aumenta a manutenção.
          </span>
        </div>
      )}
      <section className="inspector-section">
        <Meter label="Pacificação" value={p.pacification} tone="green" />
        <Meter label="Revolta" value={p.unrest} tone="red" />
        <Meter
          label={army && !mine ? 'Moral do seu destacamento' : 'Moral da guarnição'}
          value={army?.morale ?? p.morale}
          tone={(army?.morale ?? p.morale) >= 60 ? 'green' : 'gold'}
        />
        <Meter
          label="Treinamento"
          value={((army?.training ?? p.training) - 1) * 200}
          display={`${number(army?.training ?? p.training, 2)}×`}
        />
        <div className="province-religion">
          <Sun size={15} />
          <span>{p.religion}</span>
          {owner && owner.faith !== p.religion && <small>Divergência estatal</small>}
        </div>
        {p.conversion > 0 && (
          <p className="small muted">
            Missão de {p.conversionReligion}: {p.conversion}% concluída.
          </p>
        )}
        {p.conversionInstigatorId === me.id && p.ownerId !== me.id && (
          <p className="small gold-text">Pretensão religiosa: seu ataque recebe +15% de força.</p>
        )}
        <div className="fort-details">
          <Castle size={15} />
          <span>
            Forte {p.fortLevel}/3 · +{p.fortLevel * 15}% defesa
          </span>
          <small>Cerco: {p.fortLevel * 3} tropas</small>
        </div>
      </section>
      <section className="inspector-section orders-actions">
        <div className="section-title">
          <h3>Ordens da província</h3>
          {planned && <span className="badge gold">PLANEJADA</span>}
        </div>
        {army && (
          <button
            className="button outline full march-button"
            disabled={locked || army.troops < (mine ? 2 : 1)}
            onClick={() => onMarch(p)}
          >
            <Swords size={16} />
            Marchar / atacar
            <ArrowRight size={14} />
          </button>
        )}
        <div className="recruit-amount">
          <label htmlFor="recruit-amount">Quantidade de tropas</label>
          <input
            id="recruit-amount"
            type="number"
            min={1}
            max={50}
            value={amount}
            onChange={(e) =>
              setAmount(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))))
            }
          />
        </div>
        <div className="province-action-list">
          {actions.map(({ label, Icon, order, description, blocked }) => {
            const cost = orderCost(order, p),
              instant = order.type === 'RECRUIT' && order.isMercenary,
              reserved = reservedResources(budget, me.id, instant ? undefined : orderKey(order));
            const affordable =
              cost.gold + reserved.gold <= me.gold &&
              cost.manpower + reserved.manpower <= me.manpower &&
              cost.influence + reserved.influence <= me.influence;
            const reason = locked
              ? 'Reabra suas ordens para editar.'
              : blocked || (!affordable ? 'Recursos livres insuficientes.' : '');
            return (
              <button
                key={label}
                className={`province-action ${order.type === 'RECRUIT' && order.isMercenary ? 'mercenary-action' : ''}`}
                disabled={!!reason}
                title={`${description}${reason ? ` ${reason}` : ''}`}
                onClick={() => action(order)}
              >
                <Icon size={17} />
                <div>
                  <strong>{label}</strong>
                  <small>
                    {instant ? 'Instantâneo · ' : ''}
                    {cost.gold} ouro{cost.manpower ? ` · ${cost.manpower} reservas` : ''}
                    {cost.influence ? ` · ${cost.influence} influência` : ''}
                  </small>
                </div>
                <PlusGlyph />
              </button>
            );
          })}
        </div>
        <p className="tiny muted">
          Uma ordem planejada por província. Trocar a ordem libera a reserva anterior. Mercenários e
          diplomacia têm efeito imediato.
        </p>
      </section>
      {owner && owner.id !== me.id && (
        <button className="button ghost full" onClick={() => onDiplomacy(owner.id)}>
          <Handshake size={15} />
          Relações com {owner.nation}
        </button>
      )}
    </div>
  );
}
function PlusGlyph() {
  return <span className="action-plus">+</span>;
}

export function QuickMarch({
  game,
  me,
  source,
  targetId,
  command,
  close,
}: {
  game: GameView;
  me: Player;
  source: Province;
  targetId?: string;
  command: Command;
  close: () => void;
}) {
  const [target, setTarget] = useState(targetId ?? ''),
    army =
      source.ownerId === me.id
        ? source
        : game.stationedArmies.find((a) => a.ownerId === me.id && a.provinceId === source.id),
    [troops, setTroops] = useState(
      Math.max(1, Math.min(8, (army?.troops ?? 2) - (source.ownerId === me.id ? 1 : 0))),
    );
  const destination = game.provinces.find((p) => p.id === target),
    maxTroops = Math.max(0, (army?.troops ?? 0) - (source.ownerId === me.id ? 1 : 0)),
    relation = destination?.ownerId
      ? game.relations.find(
          (r) =>
            (r.a === me.id && r.b === destination.ownerId) ||
            (r.b === me.id && r.a === destination.ownerId),
        )
      : undefined;
  const friendly = destination?.ownerId === me.id || !!relation?.militaryAccess.includes(me.id),
    minimum = !friendly ? (destination?.fortLevel ?? 0) * 3 : 0;
  const valid =
    !!army &&
    !!destination &&
    source.neighbors.includes(target) &&
    legalDestination(game, me.id, destination) &&
    troops >= 1 &&
    troops <= maxTroops &&
    troops >= minimum &&
    !me.ready &&
    game.phase === 'planning';
  const holy = destination?.conversionInstigatorId === me.id ? 1.15 : 1,
    coalition =
      destination?.ownerId === game.hegemonyLeaderId && me.id !== game.hegemonyLeaderId ? 1.1 : 1;
  const attack =
    troops *
    (army?.training ?? 1) *
    (0.5 + (0.5 * Math.max(0, (army?.morale ?? 0) - 6)) / 100) *
    holy *
    coalition;
  const defense = destination
    ? destination.troops *
      destination.training *
      destination.terrainDefenseBonus *
      (1 + destination.fortLevel * 0.15) *
      (0.5 + (0.5 * destination.morale) / 100) *
      (game.hegemonyLeaderId === me.id && destination.ownerId !== me.id ? 1.1 : 1)
    : 0;
  return (
    <div className="modal-scrim">
      <form
        className="game-modal tactical-modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          command({
            type: 'SUBMIT_ORDER',
            order: { type: 'MOVE_ATTACK', fromProvinceId: source.id, toProvinceId: target, troops },
          });
          close();
        }}
      >
        <button type="button" className="window-close" aria-label="Fechar marcha" onClick={close}>
          <X size={18} />
        </button>
        <div className="eyebrow">ORDEM TÁTICA</div>
        <h2>Preparar marcha</h2>
        <div className="march-origin">
          <Flag size={15} />
          {source.name}
          <ArrowRight size={16} />
          {destination?.name ?? 'Escolha o destino'}
        </div>
        <label>
          Província vizinha
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Selecione um destino</option>
            {source.neighbors
              .map((id) => game.provinces.find((p) => p.id === id)!)
              .map((p) => (
                <option value={p.id} key={p.id} disabled={!legalDestination(game, me.id, p)}>
                  {p.name} · {p.troops} tropas
                  {!legalDestination(game, me.id, p) ? ' · tratado bloqueia' : ''}
                </option>
              ))}
          </select>
        </label>
        <label className="troop-slider">
          Tropas em marcha<strong>{troops}</strong>
          <input
            aria-label="Tropas em marcha"
            type="range"
            min={1}
            max={Math.max(1, maxTroops)}
            value={Math.min(troops, Math.max(1, maxTroops))}
            onChange={(e) => setTroops(Number(e.target.value))}
          />
        </label>
        <p className="small muted">
          {Math.max(0, (army?.troops ?? 0) - troops)} tropas permanecem na origem. Marchar reduz a
          moral em 6.
        </p>
        {destination && !friendly && (
          <div className="battle-estimate">
            <div>
              <small>SEU ATAQUE</small>
              <strong>{number(attack, 1)}</strong>
            </div>
            <Swords size={18} />
            <div>
              <small>GUARNIÇÃO LOCAL</small>
              <strong>{number(defense, 1)}</strong>
            </div>
          </div>
        )}
        {destination && !friendly && (
          <p className="small muted">
            Estimativa antes das outras ordens e de apoios aliados. Terreno{' '}
            {number((destination.terrainDefenseBonus - 1) * 100)}% · forte +
            {destination.fortLevel * 15}%{holy > 1 ? ' · fé +15%' : ''}
            {coalition > 1 ? ' · coalizão +10%' : ''}.
          </p>
        )}
        {minimum > troops && (
          <p className="small danger-text">O forte exige pelo menos {minimum} tropas para cerco.</p>
        )}
        <button className="button primary full" disabled={!valid}>
          <Swords size={16} />
          Preparar marcha
        </button>
      </form>
    </div>
  );
}
