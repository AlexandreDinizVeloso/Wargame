import SupremeCommandButtons from './SupremeCommandButtons';
import {
  buildingLevel,
  buildingLimit,
  BUILDINGS,
  buildingSlots,
  canBuild,
  imperialInflation,
  usedSlots,
} from '../shared/development';
import type { BuildingType } from '../shared/types';

import { getNationAuthority } from '../shared/economy';
import { levyReason } from '../shared/emergency';
import { goldRules } from '../shared/factions';
import { computeVisibleProvinces, verticalRules } from '../shared/fogOfWar';
import { independentCity, neutralTarget, nextNeutralTurn } from '../shared/neutral';
import { SeaTradeCard } from './MaritimePanel';

import {
  Anchor,
  ArrowUpRight,
  Castle,
  Church,
  Coins,
  Flag,
  Landmark,
  Swords,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { provinceRecruitLimit, recruitedCount, recruitmentBlock } from '../shared/economy';
import { TERRAIN_LABELS } from '../shared/map';
import {
  compositionOf,
  controller,
  effectiveTax,
  getRelation,
  holyCityId,
  isBlockaded,
  orderCost,
  orderKey,
  RELIGIONS,
  reservedResources,
  unitCount,
} from '../shared/rules';
import { effectiveSupply, RESOURCES } from '../shared/strategy';
import type { Battalion, Composition, GameView, PlayerOrder, Province } from '../shared/types';
import { Empty, Meter, number, type Command } from './ui';
export function budgetFor(game: GameView, id: string, order: PlayerOrder) {
  const actor = game.players.find((p) => p.id === id)!;
  const p = game.provinces.find(
    (p) =>
      p.id ===
      ('provinceId' in order
        ? order.provinceId
        : order.type === 'CONVERT'
          ? order.targetProvinceId
          : ''),
  );
  const cost = orderCost(order, p, actor, game),
    reserved = reservedResources(
      { ...game, orders: { [id]: game.plannedOrders } },
      id,
      order.type === 'RECRUIT_BATTALION' && order.isMercenary ? undefined : orderKey(order),
    );
  return {
    cost,
    affordable:
      actor.gold - reserved.gold >= cost.gold &&
      actor.manpower - reserved.manpower >= cost.manpower &&
      getNationAuthority(actor) - reserved.influence >= cost.influence,
  };
}
export default function ProvinceDrawer({
  game,
  playerId,
  province,
  compact = false,
  initialTab = 'build',
  command,
  onSelectArmy,
  onFocus,
  onDiplomacy,
  onDeclareWar,
  onPing,
}: {
  game: GameView;
  playerId: string;
  province: Province;
  compact?: boolean;
  initialTab?: 'build' | 'recruit' | 'diplomacy';
  command: Command;
  onSelectArmy: (a: Battalion) => void;
  onFocus: () => void;
  onDiplomacy: (id: string) => void;
  onDeclareWar: (id: string) => void;
  onPing?: (note: string) => void;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    owner = game.players.find((p) => p.id === province.ownerId),
    ruler = game.players.find((p) => p.id === controller(province));
  const own = controller(province) === playerId,
    legalOwn = own && province.ownerId === playerId,
    active = game.phase === 'planning' && !me.ready;
  const armies = game.battalions.filter((a) => a.provinceId === province.id && !a.embarkedOnId),
    total = armies.reduce((n, a) => n + unitCount(a), 0),
    limit = effectiveSupply(game, playerId, province);
  const [tab, setTab] = useState(initialTab),
    [pingNote, setPingNote] = useState('');
  useEffect(() => setTab(initialTab), [province.id, initialTab]);
  const [kind, setKind] = useState<'regular' | 'mercenary' | 'fleet'>('regular'),
    [values, setValues] = useState<Composition>({
      infantry: 2,
      cavalry: 0,
      artillery: 0,
      warships: 1,
      transports: 1,
    }),
    [reinforce, setReinforce] = useState(''),
    [name, setName] = useState('');
  const isFleet = kind === 'fleet',
    isMercenary = kind === 'mercenary';
  const composition = compositionOf(
    isFleet
      ? { warships: values.warships, transports: values.transports }
      : { infantry: values.infantry, cavalry: values.cavalry, artillery: values.artillery },
  );
  const recruit: PlayerOrder = {
    type: 'RECRUIT_BATTALION',
    provinceId: province.id,
    ...composition,
    isFleet,
    isMercenary,
    ...(reinforce ? { battalionId: reinforce } : {}),
    ...(name.trim() ? { name: name.trim() } : {}),
  };
  const price = budgetFor(game, playerId, recruit);
  const recruitReason = recruitmentBlock(province, recruit, game.turn, me, game);
  const queued = game.plannedOrders.find(
    (o) => o.type === 'RECRUIT_BATTALION' && o.provinceId === province.id,
  );
  const localCount =
    recruitedCount(province, game.turn) + (queued ? unitCount(queued as Partial<Composition>) : 0);
  useEffect(() => {
    if (!province.barracksLevel && !province.foundryLevel)
      setValues((v) => ({
        ...v,
        infantry: Math.min(v.infantry, 2),
        cavalry: goldRules(game) && me.nationId === 'turan' ? Math.min(v.cavalry, 2) : 0,
        artillery: 0,
      }));
  }, [province.id, province.barracksLevel, province.foundryLevel]);
  const build = (
    type: 'BUILD_FORT' | 'BUILD_PORT' | 'BUILD_MARKET' | 'PACIFY',
    label: string,
    description: string,
    disabled: boolean,
    icon: React.ReactNode,
  ) => {
    const order: PlayerOrder = { type, provinceId: province.id },
      budget = budgetFor(game, playerId, order);
    return (
      <button
        className="action-row"
        disabled={!active || disabled || !budget.affordable}
        onClick={() => command({ type: 'SUBMIT_ORDER', order })}
        title={description}
        data-sound="coins"
      >
        {icon}
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <b>
          {number(budget.cost.gold)}
          <Coins size={11} />
        </b>
      </button>
    );
  };
  const convert: PlayerOrder = { type: 'CONVERT', targetProvinceId: province.id },
    conversionBudget = budgetFor(game, playerId, convert);
  const adjacent = game.provinces.some(
    (p) => controller(p) === playerId && p.neighbors.includes(province.id),
  );
  const canConvert =
    province.kind === 'LAND' &&
    province.religion !== me.faith &&
    (own || adjacent) &&
    (!ruler || ruler.id === me.id || !getRelation(game, me.id, ruler.id)?.allied);
  return (
    <div className="province-ledger">
      <SupremeCommandButtons
        game={game}
        playerId={playerId}
        command={command}
        provinceId={province.id}
      />
      {verticalRules(game) && !computeVisibleProvinces(game, playerId).has(province.id) && (
        <p className="warning-box">
          Território sem reconhecimento. Tropas inimigas e cercos não revelados permanecem
          desconhecidos.
        </p>
      )}
      <div className="region-heading">
        <div>
          <span className="eyebrow" style={{ color: ruler?.color }}>
            {ruler?.nation ??
              (province.kind === 'SEA_ZONE' ? 'ROTA MARÍTIMA' : 'TERRA INDEPENDENTE')}
          </span>
          <h2>{province.name}</h2>
          <span>
            {province.kind === 'SEA_ZONE'
              ? 'Zona marítima'
              : `${TERRAIN_LABELS[province.terrain]} · defesa +${number((province.terrainDefenseBonus - 1) * 100)}%`}
          </span>
        </div>
        <button className="icon-button" title="Centralizar província" onClick={onFocus}>
          <ArrowUpRight size={17} />
        </button>
      </div>

      {compact && province.kind === 'LAND' && (
        <div className="province-overview" aria-label="Resumo da província">
          <div>
            <small>IMPOSTO</small>
            <strong>
              {number(
                effectiveTax(
                  province,
                  ruler?.faith ?? province.religion,
                  isBlockaded(game, province),
                  ruler?.religiousPolicy ?? 'TOLERANCE',
                ),
                1,
              )}
            </strong>
          </div>
          <div>
            <small>SUPRIMENTO</small>
            <strong>
              {total}/{limit}
            </strong>
          </div>
          <div>
            <small>PACIFICAÇÃO</small>
            <strong>{Math.round(province.pacification)}%</strong>
          </div>
          <div>
            <small>CONSTRUÇÕES</small>
            <strong>
              {usedSlots(province)}/{buildingSlots(province)} slots
            </strong>
          </div>
          <div>
            <small>RECRUTAMENTO</small>
            <strong>
              {localCount}/{provinceRecruitLimit(province, me, game, recruit)}
            </strong>
          </div>
        </div>
      )}
      {onPing && (
        <form
          className="province-ping"
          onSubmit={(e) => {
            e.preventDefault();
            onPing(pingNote);
            setPingNote('');
          }}
        >
          <input
            aria-label="Nota do sinal para aliados"
            value={pingNote}
            maxLength={80}
            placeholder="Nota para aliados (opcional)"
            onChange={(e) => setPingNote(e.target.value)}
          />
          <button type="submit" title="Visível somente para você e seus aliados">
            📍 Sinalizar no Mapa
          </button>
        </form>
      )}
      {province.kind === 'SEA_ZONE' && <SeaTradeCard game={game} sea={province} />}
      {independentCity(province) && (
        <p className="neutral-city-card">
          🏛️ Cidade independente · desenvolvimento {province.neutralDevelopmentLevel}/5 ·
          guarnição-alvo {neutralTarget(province)}. Próximo reforço: rodada{' '}
          {nextNeutralTurn(game.turn)}; crescimento suspenso sob invasão ou cerco.
        </p>
      )}
      {province.coastalBombardment && province.coastalBombardment.untilTurn >= game.turn && (
        <p className="warning-box">
          💥 Costa bombardeada: −15% defesa contra{' '}
          {game.players.find((p) => p.id === province.coastalBombardment?.ownerId)?.nation} até a
          rodada {province.coastalBombardment.untilTurn}.
        </p>
      )}
      {!compact && province.strategicResource && (
        <p className="success-box">
          {RESOURCES[province.strategicResource].icon} {RESOURCES[province.strategicResource].name}{' '}
          · {RESOURCES[province.strategicResource].effect}
        </p>
      )}
      {province.siege && (
        <section className="siege-card">
          <h3>
            🔥 Cerco {province.siege.progress}/{province.siege.required}
          </h3>
          <Meter
            label="Progresso do cerco"
            value={(province.siege.progress / province.siege.required) * 100}
          />
          <p>
            {game.players.find((p) => p.id === province.siege!.attackerOwnerId)?.nation} ·{' '}
            {province.siege.turnsUnderSiege} rodada(s). O controle muda apenas ao concluir.
          </p>
        </section>
      )}
      {compact && (
        <div className="context-tabs" role="tablist" aria-label="Ações da província">
          {(
            [
              ['build', '🏛️ Cidade & Economia'],
              ['recruit', '⚔️ Recrutamento & Guarnição'],
              ['diplomacy', '📜 Diplomacia do Reino'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <section hidden={compact && tab !== 'diplomacy'}>
        {owner && owner.id !== playerId && (
          <section className="foreign-realm-card">
            <h3>{owner.nation}</h3>
            {getRelation(game, playerId, owner.id)?.atWar ? (
              <button className="primary" onClick={() => onDiplomacy(owner.id)}>
                🕊️ Propor Tratado de Paz (Warscore:{' '}
                {game.wars.find(
                  (w) =>
                    w.active &&
                    [...w.attackerIds, ...w.defenderIds].includes(playerId) &&
                    [...w.attackerIds, ...w.defenderIds].includes(owner.id),
                )?.warScore ?? 0}
                %)
              </button>
            ) : (
              <>
                <button className="danger-button" onClick={() => onDeclareWar(owner.id)}>
                  ⚔️ Declarar Guerra a {owner.nation}
                </button>
                <button
                  onClick={() =>
                    command({
                      type: 'SUBMIT_ORDER',
                      order: {
                        type: 'DIPLOMACY',
                        action: 'PROPOSE_ALLIANCE',
                        targetRealmId: owner.id,
                      },
                    })
                  }
                >
                  🤝 Propor Aliança
                </button>
                <button onClick={() => onDiplomacy(owner.id)}>🕵️ Ações Encobertas / Suborno</button>
              </>
            )}
          </section>
        )}

        {compact && (!owner || owner.id === playerId) && (
          <p className="fine-print">
            {owner
              ? 'Esta província pertence à sua nação.'
              : 'Terra independente: selecione uma formação para preparar uma invasão.'}
          </p>
        )}
        {compact && (
          <button onClick={() => onDiplomacy(owner?.id ?? playerId)}>
            Abrir conselho diplomático
          </button>
        )}
      </section>
      {province.occupierId && (
        <p className="warning-box">
          Ocupação de {ruler?.nation}. Propriedade de {owner?.nation}; a cessão definitiva exige
          tratado.
        </p>
      )}
      <details className="province-facts" open={!compact} hidden={compact && tab !== 'build'}>
        <summary>Terreno, fé e suprimento</summary>
        <div className="ledger-grid">
          <div>
            <small>IMPOSTO EFETIVO / BASE</small>
            <strong>
              {number(
                effectiveTax(
                  province,
                  ruler?.faith ?? province.religion,
                  isBlockaded(game, province),
                  ruler?.religiousPolicy ?? 'TOLERANCE',
                ),
                1,
              )}{' '}
              <span>/ {province.baseTax}</span>
            </strong>
          </div>
          <div className={total > limit ? 'danger' : ''}>
            <small>TROPAS / SUPRIMENTO</small>
            <strong>
              {total} <span>/ {limit}</span>
            </strong>
          </div>
        </div>
        {total > limit && (
          <p className="warning-box">
            Atrito previsto: {Math.ceil((total - limit) * 0.25)} unidades. O atrito reduz a formação
            enquanto houver excesso, com −20 moral por formação vulnerável.
          </p>
        )}
        {isBlockaded(game, province) && (
          <p className="warning-box">
            <Anchor size={14} />
            Bloqueio naval: −50% imposto e −20% defesa de cerco.
          </p>
        )}
        {province.kind === 'LAND' && (
          <>
            <Meter label="Pacificação" value={province.pacification} tone="green" />
            <Meter
              label="Revolta"
              value={province.unrest}
              tone={province.unrest >= 70 ? 'red' : 'gold'}
            />
            <div className="religion-summary">
              <Church size={17} />
              <div>
                <strong>{RELIGIONS[province.religion].name}</strong>
                <small>{RELIGIONS[province.religion].tenet}</small>
              </div>
            </div>
            {Object.entries(RELIGIONS)
              .filter(
                ([id]) => holyCityId(id as keyof typeof RELIGIONS, game.provinces) === province.id,
              )
              .map(([id, faith]) => (
                <p className="holy-city" key={id}>
                  <Church size={15} />
                  Cidade Sagrada · {faith.name}
                  <small>
                    +0,5 por província de nação ativa desta fé; teto 6, ou 12 com templo. Neutros
                    não pagam dízimo.
                  </small>
                </p>
              ))}
            <div className="building-levels">
              <span>
                <Castle size={14} />
                Forte{' '}
                <b>
                  {province.fortLevel}/{ruler?.nationId === 'kaldor' ? 3 : 2}
                </b>
              </span>
              <span>
                <Anchor size={14} />
                Porto <b>{province.portLevel}/2</b>
              </span>
              <span>
                <Landmark size={14} />
                Mercado <b>{province.marketLevel}/2</b>
              </span>
            </div>
          </>
        )}
      </details>
      <section hidden={compact && tab !== 'recruit'}>
        <div className="field-heading">
          Formações presentes <span>{armies.length}</span>
        </div>
        {armies.length === 0 ? (
          <Empty>Nenhuma formação nesta região.</Empty>
        ) : (
          <div className="unit-list">
            {armies.map((a) => (
              <button key={a.id} onClick={() => onSelectArmy(a)}>
                <span
                  className="unit-dot"
                  style={{
                    background: game.players.find((p) => p.id === a.ownerId)?.color ?? '#a4ada4',
                  }}
                />
                {a.isFleet ? <Anchor size={14} /> : <Swords size={14} />}
                <span>
                  {a.name}
                  <small>
                    {a.isFleet
                      ? `${a.warships} navios de guerra · ${a.transports} transportes`
                      : `${a.infantry} infantaria · ${a.cavalry} cavalaria · ${a.artillery} artilharia`}
                  </small>
                </span>
                <b>{unitCount(a)}</b>
              </button>
            ))}
          </div>
        )}
      </section>
      {province.kind === 'LAND' && (
        <>
          <section hidden={compact && tab !== 'build'}>
            {province.strategicResource && (
              <p className="strategic-resource-summary">
                {RESOURCES[province.strategicResource].icon}{' '}
                {RESOURCES[province.strategicResource].name} ·{' '}
                {RESOURCES[province.strategicResource].effect}
              </p>
            )}
            <div className="field-heading">Administração da cidade</div>
            {build(
              'PACIFY',
              'Pacificar província',
              '+35 integração, −25 revolta; doutrinas podem ampliar.',
              !own,
              <Flag size={17} />,
            )}
            {renderCityDevelopment({ game, province, playerId, command })}

            <button
              className="action-row"
              disabled={!active || !canConvert || !conversionBudget.affordable}
              title="Inquisição avança 100; tolerância avança 50. Missão estrangeira concluída gera +20 revolta."
              onClick={() => command({ type: 'SUBMIT_ORDER', order: convert })}
            >
              <Church size={17} />
              <span>
                <strong>Converter fé</strong>
                <small>
                  Progresso {province.conversion}/100 · {RELIGIONS[me.faith].name}
                </small>
              </span>
              <b>
                8<Coins size={11} /> +2 Autoridade
              </b>
            </button>
          </section>
          <section hidden={compact && tab !== 'recruit'}>
            {legalOwn && (
              <div className="recruit-section">
                <button
                  className="emergency-levy"
                  disabled={!!levyReason(game, playerId)}
                  title={levyReason(game, playerId) ?? '50 ouro e 15 Autoridade'}
                  onClick={() => command({ type: 'EMERGENCY_LEVY' })}
                >
                  🛡️ Convocar Defesa da Pátria
                </button>
                <div className="field-heading">
                  Recrutamento <span>ORDEM DE CIDADE</span>
                </div>
                <Meter
                  label="Capacidade de recrutamento"
                  value={(100 * localCount) / provinceRecruitLimit(province, me, game, recruit)}
                />
                <p className="recruit-capacity">
                  Capacidade de Recrutamento Local: {localCount}/
                  {provinceRecruitLimit(province, me, game, recruit)} neste turno
                </p>
                {!province.barracksLevel && !province.foundryLevel && (
                  <p className="fine-print">
                    Construa um Quartel para recrutar Cavalaria/Artilharia e ampliar o limite.
                  </p>
                )}
                {recruitReason && <p className="warning-box">{recruitReason}</p>}
                <div className="quick-recruit-actions" aria-label="Recrutamento rápido">
                  {(
                    [
                      { label: '1 Infantaria', composition: { infantry: 1 } },
                      { label: '1 Cavalaria', composition: { cavalry: 1 } },
                      { label: '1 Artilharia', composition: { artillery: 1 } },
                      {
                        label: 'Frota mista',
                        composition: { warships: 1, transports: 1 },
                        fleet: true,
                      },
                    ] as const
                  ).map((quick) => {
                    const fleet = 'fleet' in quick;
                    const order: PlayerOrder = {
                      type: 'RECRUIT_BATTALION',
                      provinceId: province.id,
                      ...compositionOf(quick.composition),
                      isFleet: fleet,
                    };
                    const budget = budgetFor(game, playerId, order),
                      reason = recruitmentBlock(province, order, game.turn, me, game);
                    return (
                      <button
                        key={quick.label}
                        disabled={
                          !active ||
                          !budget.affordable ||
                          !!reason ||
                          (fleet && province.portLevel < 1)
                        }
                        title={
                          reason ??
                          'Prepara esta composição; substitui outra ação da cidade na fila.'
                        }
                        onClick={() => command({ type: 'SUBMIT_ORDER', order })}
                      >
                        {quick.label}
                      </button>
                    );
                  })}
                </div>
                <div className="segmented-control">
                  <button
                    className={kind === 'regular' ? 'selected' : ''}
                    onClick={() => {
                      setKind('regular');
                      setReinforce('');
                    }}
                  >
                    Regulares
                  </button>
                  <button
                    className={kind === 'mercenary' ? 'selected' : ''}
                    onClick={() => {
                      setKind('mercenary');
                      setReinforce('');
                    }}
                  >
                    Mercenários
                  </button>
                  <button
                    className={kind === 'fleet' ? 'selected' : ''}
                    disabled={province.portLevel < 1}
                    onClick={() => {
                      setKind('fleet');
                      setReinforce('');
                    }}
                  >
                    Frota
                  </button>
                </div>
                <div className="composition-inputs">
                  {(isFleet
                    ? (['warships', 'transports'] as const)
                    : (['infantry', 'cavalry', 'artillery'] as const)
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          infantry: 'Infantaria',
                          cavalry: 'Cavalaria',
                          artillery: 'Artilharia',
                          warships: 'Navios de guerra',
                          transports: 'Transportes',
                        }[key]
                      }
                      <input
                        type="number"
                        min="0"
                        max={provinceRecruitLimit(province, me, game, recruit)}
                        disabled={
                          !province.barracksLevel &&
                          !province.foundryLevel &&
                          (key === 'artillery' ||
                            (key === 'cavalry' && !(goldRules(game) && me.nationId === 'turan')))
                        }
                        value={values[key]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [key]: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                {!isFleet && composition.infantry < composition.artillery && (
                  <p className="warning-box">
                    Artilharia exposta: infantaria insuficiente, +75% de baixas nos canhões.
                  </p>
                )}
                <label>
                  Formação
                  <select value={reinforce} onChange={(e) => setReinforce(e.target.value)}>
                    <option value="">Criar nova formação</option>
                    {armies
                      .filter(
                        (a) =>
                          a.ownerId === playerId &&
                          a.isFleet === isFleet &&
                          a.isMercenary === isMercenary &&
                          !a.embarkedOnId &&
                          !a.stranded,
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          Reforçar {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                {!reinforce && (
                  <label>
                    Nome da formação
                    <input
                      value={name}
                      maxLength={40}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isFleet ? 'Armada do Atlântico' : 'Batalhão da Coroa'}
                    />
                  </label>
                )}
                <button
                  className="primary"
                  data-sound="coins"
                  disabled={
                    !active ||
                    !price.affordable ||
                    !!recruitReason ||
                    unitCount(composition) < 1 ||
                    unitCount(composition) > 50 ||
                    (isMercenary &&
                      (me.nationId === 'vespera'
                        ? province.portLevel < 1 && province.marketLevel < 1
                        : province.capitalOf !== playerId && province.pacification < 80))
                  }
                  onClick={() => command({ type: 'SUBMIT_ORDER', order: recruit })}
                >
                  {isFleet ? <Anchor size={16} /> : <Users size={16} />}{' '}
                  {isFleet
                    ? 'Construir frota'
                    : isMercenary
                      ? 'Contratar mercenários'
                      : 'Recrutar batalhão'}{' '}
                  <span>{number(price.cost.gold)} ouro</span>
                </button>
                <p className="fine-print">
                  {isMercenary
                    ? 'Contratação imediata · sem reservas · manutenção 2,2×.'
                    : isFleet
                      ? 'Cada transporte embarca até 4 unidades.'
                      : `Recrutamento na resolução; consome reservas e começa com treinamento ${me.nationId === 'sapiencia' ? '1,20' : '1,00'}.`}
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function renderCityDevelopment({
  game,
  province,
  playerId,
  command,
}: {
  game: GameView;
  province: Province;
  playerId: string;
  command: Command;
}) {
  const me = game.players.find((p) => p.id === playerId)!,
    active =
      !me.ready &&
      game.phase === 'planning' &&
      province.ownerId === playerId &&
      !province.occupierId;
  const reserved = reservedResources(
    { ...game, orders: { [playerId]: game.plannedOrders } },
    playerId,
    `city:${province.id}`,
  );
  return (
    <section className="city-development">
      <h3>🏙️ Especialização da cidade</h3>
      <div
        className="building-slots"
        aria-label={`${usedSlots(province)} de ${buildingSlots(province)} slots ocupados`}
      >
        {Array.from({ length: buildingSlots(province) }, (_, i) => (
          <span className={i < usedSlots(province) ? 'filled' : ''} key={i}>
            {i < usedSlots(province) ? '▣' : '□'}
          </span>
        ))}
        <b>
          {usedSlots(province)}/{buildingSlots(province)} slots
        </b>
      </div>
      <p className="fine-print">
        Níveis compartilham o slot. Administração: +
        {Math.round((imperialInflation(game, playerId) - 1) * 100)}% no custo de construção.
      </p>
      <div className="building-grid">
        {(Object.keys(BUILDINGS) as BuildingType[]).map((b) => {
          const data = BUILDINGS[b],
            level = buildingLevel(province, b),
            order = { type: 'BUILD_BUILDING' as const, provinceId: province.id, building: b },
            cost = orderCost(order, province, me, game);
          return (
            <article className="building-card" key={b}>
              <header>
                <strong>{data.name}</strong>
                <small>
                  Nível {level}/{buildingLimit(b, me)}
                </small>
              </header>
              <p>{data.description}</p>
              <div className="button-pair">
                <button
                  disabled={
                    !active || !canBuild(province, b, me) || me.gold - reserved.gold < cost.gold
                  }
                  onClick={() => command({ type: 'SUBMIT_ORDER', order })}
                >
                  {level ? 'Melhorar' : 'Construir'} {data.name.split(' / ')[0]} ·{' '}
                  {Math.round(cost.gold)} ouro
                </button>
                {level > 0 && (
                  <button
                    disabled={!active}
                    onClick={() =>
                      command({
                        type: 'SUBMIT_ORDER',
                        order: { type: 'DEMOLISH_BUILDING', provinceId: province.id, building: b },
                      })
                    }
                  >
                    Demolir {data.name.split(' / ')[0]}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
