import MapTimeLapse from './MapTimeLapse';
import { useMemo, useState } from 'react';
import type { GameView } from '../shared/types';
import {
  buildCampaignSeries,
  campaignMedals,
  type CampaignMetric,
} from '../shared/campaignAnalytics';
import { number } from './ui';
const LABELS: Record<CampaignMetric, string> = {
  territory: 'Províncias controladas',
  grossIncome: 'Receita bruta por rodada',
  gold: 'Tesouro',
  landTroops: 'Tropas terrestres ativas',
  ships: 'Navios ativos',
  wins: 'Vitórias militares acumuladas',
};
const TABS = [
  { id: 'territory', label: 'Expansão Territorial', metrics: ['territory'] },
  { id: 'economy', label: 'Poderio Econômico', metrics: ['grossIncome', 'gold'] },
  { id: 'military', label: 'Força Militar & Batalhas', metrics: ['landTroops', 'ships', 'wins'] },
] as const;
export default function PostGameAnalytics({
  game,
  playerId,
}: {
  game: GameView;
  playerId: string;
}) {
  const [tab, setTab] = useState('territory'),
    [metric, setMetric] = useState<CampaignMetric>('territory'),
    [hidden, setHidden] = useState<string[]>([]),
    [inspection, setInspection] = useState<number | null>(null);
  const series = useMemo(() => buildCampaignSeries(game, playerId), [game, playerId]);
  const visible = series.filter((s) => !hidden.includes(s.id)),
    turns = [...new Set(series.flatMap((s) => s.points.map((p) => p.turn)))].sort((a, b) => a - b),
    minTurn = turns[0] ?? 1,
    maxTurn = turns.at(-1) ?? 1;
  const values = visible.flatMap((s) =>
      s.points.map((p) => p[metric]).filter((n): n is number => n !== null),
    ),
    minValue = Math.min(0, ...values),
    maxValue = Math.max(1, ...values),
    span = maxValue - minValue;
  const x = (turn: number) => 64 + ((turn - minTurn) / Math.max(1, maxTurn - minTurn)) * 700,
    y = (value: number) => 276 - ((value - minValue) / span) * 230;
  const selectedTurn =
    inspection === null
      ? maxTurn
      : turns.reduce(
          (a, b) => (Math.abs(b - inspection) < Math.abs(a - inspection) ? b : a),
          minTurn,
        );
  const medals = campaignMedals(game);
  return (
    <section className="postgame-analytics" aria-label="Estatísticas da campanha">
      <div className="analytics-heading">
        <div>
          <span className="eyebrow">UMA CAMPANHA, MUITAS HISTÓRIAS</span>
          <h2>Crônica dos Impérios</h2>
        </div>
        <span className="tag">{game.history.length} rodadas resolvidas</span>
      </div>
      <nav role="tablist" aria-label="Gráficos da campanha" className="analytics-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setMetric(t.metrics[0]);
            }}
          >
            {t.label}
          </button>
        ))}
        <button role="tab" aria-selected={tab === 'map'} onClick={() => setTab('map')}>
          🎬 Time-Lapse do Mapa
        </button>
      </nav>
      {tab === 'map' ? (
        <MapTimeLapse game={game} />
      ) : (
        <>
          <label className="analytics-metric">
            Medida
            <select
              aria-label="Medida do gráfico"
              value={metric}
              onChange={(e) => setMetric(e.target.value as CampaignMetric)}
            >
              {TABS.find((t) => t.id === tab)!.metrics.map((m) => (
                <option key={m} value={m}>
                  {LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <div className="analytics-chart">
            <svg
              viewBox="0 0 800 330"
              role="img"
              aria-label={`Linha do tempo: ${LABELS[metric]}`}
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const value = ((e.clientX - box.left) / box.width) * 800;
                setInspection(minTurn + ((value - 64) / 700) * (maxTurn - minTurn));
              }}
              onPointerLeave={() => setInspection(null)}
            >
              <title>
                {LABELS[metric]}, rodadas {minTurn} a {maxTurn}
              </title>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <path
                    d={`M64 ${y(minValue + span * f)}H764`}
                    stroke="#a5b8b5"
                    strokeOpacity=".18"
                  />
                  <text x="53" y={y(minValue + span * f) + 4} textAnchor="end">
                    {number(minValue + span * f, maxValue < 10 ? 1 : 0)}
                  </text>
                </g>
              ))}
              {[
                minTurn,
                ...(maxTurn > minTurn ? [Math.round((maxTurn + minTurn) / 2), maxTurn] : []),
              ]
                .filter((t, i, a) => a.indexOf(t) === i)
                .map((t) => (
                  <text key={t} x={x(t)} y="302" textAnchor="middle">
                    Rod. {t}
                  </text>
                ))}
              {visible.map((s) => {
                let pen = false;
                const d = s.points
                  .map((p) => {
                    const value = p[metric];
                    if (value === null) {
                      pen = false;
                      return '';
                    }
                    const out = `${pen ? 'L' : 'M'}${x(p.turn).toFixed(2)} ${y(value).toFixed(2)}`;
                    pen = true;
                    return out;
                  })
                  .join(' ');
                return (
                  <g key={s.id} data-chart-series={s.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {s.points.length === 1 && s.points[0][metric] !== null && (
                      <circle
                        cx={x(s.points[0].turn)}
                        cy={y(s.points[0][metric]!)}
                        r="4"
                        fill={s.color}
                      />
                    )}
                  </g>
                );
              })}
              <path
                d={`M${x(selectedTurn)} 36V276`}
                stroke="#dfc482"
                strokeDasharray="4 5"
                opacity=".6"
              />
              {!values.length && (
                <text x="400" y="155" textAnchor="middle">
                  Sem registros disponíveis para esta medida.
                </text>
              )}
            </svg>
          </div>
          <div className="chart-legends" aria-label="Nações no gráfico">
            {series.map((s) => (
              <button
                key={s.id}
                aria-pressed={!hidden.includes(s.id)}
                onClick={() =>
                  setHidden((v) =>
                    v.includes(s.id) ? v.filter((id) => id !== s.id) : [...v, s.id],
                  )
                }
              >
                <i style={{ background: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
          <label className="chart-scrubber">
            Inspecionar rodada {selectedTurn}
            <input
              type="range"
              aria-label="Inspecionar rodada"
              min={minTurn}
              max={maxTurn}
              step="1"
              value={selectedTurn}
              onChange={(e) => setInspection(Number(e.target.value))}
            />
          </label>
          <dl className="chart-values">
            {visible.map((s) => (
              <div key={s.id}>
                <dt style={{ color: s.color }}>{s.name}</dt>
                <dd>
                  {s.points.find((p) => p.turn === selectedTurn)?.[metric] === null
                    ? 'Sem registro'
                    : number(
                        s.points.find((p) => p.turn === selectedTurn)?.[metric] ?? 0,
                        metric === 'gold' || metric === 'grossIncome' ? 1 : 0,
                      )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="fine-print">
            Receitas e tesouro usam o fechamento das rodadas; o ponto atual mostra a previsão
            disponível. Lacunas indicam dados que campanhas antigas não registravam.
            {game.phase !== 'finished'
              ? ' Totais militares adversários são revelados ao encerrar; sua inteligência e cartas continuam privadas.'
              : ''}
          </p>
          <h3>Títulos da campanha</h3>
        </>
      )}
      <div className="campaign-medals">
        {medals.map((m) => (
          <article key={m.id} data-medal={m.id}>
            <span className="medal-symbol">{m.icon}</span>
            <h4>{m.title}</h4>
            <strong>
              {m.winners.length
                ? m.winners.map((id) => game.players.find((p) => p.id === id)?.nation).join(' · ')
                : 'Ainda em disputa'}
            </strong>
            <p>{m.description}</p>
            {m.value > 0 && (
              <small>
                {number(m.value, m.id === 'magnate' ? 1 : 0)}{' '}
                {m.winners.length > 1 ? '· título compartilhado' : ''}
              </small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
