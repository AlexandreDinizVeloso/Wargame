import { ACHIEVEMENTS, type StrategistProfile } from '../shared/achievements';
import { NATIONS } from '../shared/rules';
import { TopBarModal } from './TopBarModal';
import { CoatOfArms } from './ui';
export default function StrategistProfileModal({
  profile,
  onChange,
  onClose,
}: {
  profile: StrategistProfile;
  onChange: (p: StrategistProfile) => void;
  onClose: () => void;
}) {
  return (
    <TopBarModal id="strategist-profile" title="🏅 Perfil do Estrategista" onClose={onClose}>
      <section className="strategist-profile">
        <div className="profile-emblem" style={{ color: profile.color }}>
          <CoatOfArms nationId={profile.favoriteNation} size={64} />
          <h2>{profile.name}</h2>
          <strong>{profile.title}</strong>
        </div>
        <div className="profile-settings">
          <label>
            Nome do estrategista
            <input
              maxLength={30}
              value={profile.name}
              onChange={(e) => onChange({ ...profile, name: e.target.value.slice(0, 30) })}
            />
          </label>
          <label>
            Título honorífico
            <select
              value={profile.title}
              onChange={(e) => onChange({ ...profile, title: e.target.value })}
            >
              <option>Aprendiz</option>
              {ACHIEVEMENTS.filter((a) => profile.unlocked[a.id]).map((a) => (
                <option key={a.id}>{a.title}</option>
              ))}
            </select>
          </label>
          <label>
            Cor favorita
            <input
              type="color"
              value={profile.color}
              onChange={(e) => onChange({ ...profile, color: e.target.value })}
            />
          </label>
          <label>
            Brasão favorito
            <select
              value={profile.favoriteNation}
              onChange={(e) =>
                onChange({
                  ...profile,
                  favoriteNation: e.target.value as StrategistProfile['favoriteNation'],
                })
              }
            >
              {NATIONS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="career-grid">
          {Object.entries({
            Partidas: profile.stats.games,
            Vitórias: profile.stats.wins,
            'Batalhas vencidas': profile.stats.battles,
            'Províncias conquistadas': profile.stats.conquests,
            'Ouro acumulado': profile.stats.gold.toFixed(1),
          }).map(([name, value]) => (
            <div key={name}>
              <small>{name}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <h3>Conquistas · {Object.keys(profile.unlocked).length}/12</h3>
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((a) => {
            const done = !!profile.unlocked[a.id],
              value = Math.min(a.target, profile.stats[a.metric]);
            return (
              <article key={a.id} data-achievement={a.id} className={done ? 'unlocked' : ''}>
                <strong>
                  {a.icon} {a.name}
                </strong>
                <p>{a.description}</p>
                <small>
                  {done ? 'Desbloqueada' : `${value.toFixed(value % 1 ? 1 : 0)} / ${a.target}`}
                </small>
                <progress value={value} max={a.target} />
              </article>
            );
          })}
        </div>
        <p className="fine-print">
          Perfil salvo neste navegador/dispositivo. Tutorial não conta. Conquistas locais não
          equivalem a conquistas oficiais da Steam.
        </p>
      </section>
    </TopBarModal>
  );
}
