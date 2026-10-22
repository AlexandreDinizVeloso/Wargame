import { MAP_LENSES } from '../shared/mapLenses';
import type { MapMode } from '../shared/types';
export default function MapLensSelector({
  mode,
  onChange,
}: {
  mode: MapMode;
  onChange: (mode: MapMode) => void;
}) {
  const lens = MAP_LENSES.find((l) => l.id === mode) ?? MAP_LENSES[0];
  return (
    <aside
      className="map-lens-selector framed-panel"
      aria-label="Lentes cartográficas"
      data-hud-surface
    >
      <nav>
        {MAP_LENSES.map((l) => (
          <button
            key={l.id}
            aria-label={`Mapa ${l.name}`}
            aria-pressed={mode === l.id}
            className={mode === l.id ? 'selected' : ''}
            title={`${l.key} · ${l.description}`}
            onClick={() => onChange(l.id)}
          >
            <kbd>{l.key}</kbd> {l.name}
          </button>
        ))}
      </nav>
      <small data-map-legend={mode}>{lens.legend}</small>
    </aside>
  );
}
