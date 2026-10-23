import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Clapperboard,
  Headphones,
  Play,
  Ship,
  SlidersHorizontal,
  Swords,
  X,
} from 'lucide-react';
import type { BattleReport, Composition } from '../../shared/types';
import { makeStaticMap } from '../../shared/map';
import { NATIONS } from '../../shared/rules';
import AudioSettingsModal from '../AudioSettingsModal';
import { audio } from '../audio';
import { CoatOfArms } from '../ui';
import BattleCinematic from './BattleCinematic';
import type { BattleSceneContext } from './battlePresentation';
import './gallery.css';

/** Self-contained stage examples. Opening this gallery never creates a room or submits commands. */
const PREVIEW_CONTEXT: BattleSceneContext = {
  players: NATIONS.map((nation) => ({
    id: `preview-${nation.id}`,
    name: 'Exército de demonstração',
    nation: nation.name,
    nationId: nation.id,
    color: nation.color,
  })),
  provinces: makeStaticMap().map(({ id, name, terrain }) => ({ id, name, terrain })),
};

const composition = (values: Partial<Composition>): Composition => ({
  infantry: 0,
  cavalry: 0,
  artillery: 0,
  warships: 0,
  transports: 0,
  ...values,
});

const LAND_PREVIEW: BattleReport = {
  id: 'cinema-preview-land',
  turn: 5,
  provinceId: 'france',
  attackerId: 'preview-aurelia',
  defenderId: 'preview-kaldor',
  attackerBattalionIds: ['preview-land-a'],
  defenderBattalionIds: ['preview-land-d'],
  winnerId: 'preview-aurelia',
  attackerTroops: 40,
  defenderTroops: 35,
  attackPower: 54.2,
  defensePower: 44.7,
  ratio: 54.2 / 44.7,
  attackerTraining: 1.15,
  defenderTraining: 1.05,
  terrainDefenseBonus: 1.15,
  fortLevel: 1,
  neutralizedFortLevels: 1,
  blockadeModifier: 1,
  infantryModifier: 1,
  cavalryModifier: 1,
  artilleryModifier: 1.1,
  attackerCompositionBefore: composition({ infantry: 24, cavalry: 10, artillery: 6 }),
  defenderCompositionBefore: composition({ infantry: 26, cavalry: 5, artillery: 4 }),
  attackerCasualties: 8,
  defenderCasualties: 18,
  attackerCompositionLosses: composition({ infantry: 5, cavalry: 2, artillery: 1 }),
  defenderCompositionLosses: composition({ infantry: 14, cavalry: 3, artillery: 1 }),
  casualtiesByRealm: { 'preview-aurelia': 8, 'preview-kaldor': 18 },
  attackerMoraleBefore: 94,
  attackerMoraleAfter: 78,
  defenderMoraleBefore: 88,
  defenderMoraleAfter: 31,
  retreatDestinationId: 'germany',
  stackwipe: false,
  outcome: 'attacker_victory',
  naval: false,
};

const NAVAL_PREVIEW: BattleReport = {
  id: 'cinema-preview-naval',
  turn: 8,
  provinceId: 'north-atlantic',
  attackerId: 'preview-vespera',
  defenderId: 'preview-ferro_norte',
  attackerBattalionIds: ['preview-naval-a'],
  defenderBattalionIds: ['preview-naval-d'],
  winnerId: 'preview-vespera',
  attackerTroops: 14,
  defenderTroops: 11,
  attackPower: 23.8,
  defensePower: 17.5,
  ratio: 23.8 / 17.5,
  attackerTraining: 1.1,
  defenderTraining: 1,
  terrainDefenseBonus: 1,
  fortLevel: 0,
  neutralizedFortLevels: 0,
  blockadeModifier: 1,
  infantryModifier: 1,
  cavalryModifier: 1,
  artilleryModifier: 1,
  attackerCompositionBefore: composition({ warships: 10, transports: 4 }),
  defenderCompositionBefore: composition({ warships: 8, transports: 3 }),
  attackerCasualties: 3,
  defenderCasualties: 7,
  attackerCompositionLosses: composition({ warships: 2, transports: 1 }),
  defenderCompositionLosses: composition({ warships: 5, transports: 2 }),
  casualtiesByRealm: { 'preview-vespera': 3, 'preview-ferro_norte': 7 },
  attackerMoraleBefore: 92,
  attackerMoraleAfter: 76,
  defenderMoraleBefore: 84,
  defenderMoraleAfter: 22,
  retreatDestinationId: 'north-sea',
  stackwipe: false,
  capturedShips: 2,
  outcome: 'attacker_victory',
  naval: true,
};

type PreviewKind = 'land' | 'naval';
const CLIPS = [
  {
    id: 'land' as const,
    number: '01',
    title: 'Quando a pólvora desperta',
    kind: 'Batalha terrestre',
    description: 'Artilharia no horizonte. Salvas cruzam o campo. A cavalaria rompe a fumaça.',
    tags: ['Artilharia', 'Infantaria', 'Cavalaria'],
    nations: ['aurelia', 'kaldor'] as const,
    image: '/assets/cinematics/land-battlefield.webp',
  },
  {
    id: 'naval' as const,
    number: '02',
    title: 'O mar guarda os nomes',
    kind: 'Batalha naval',
    description: 'Velas ao vento, baterias a postos. As frotas disputam as rotas do Atlântico.',
    tags: ['Bordadas', 'Galeões', 'Embarcações capturadas'],
    nations: ['vespera', 'ferro_norte'] as const,
    image: '/assets/cinematics/naval-battlefield.webp',
  },
];

export default function CinematicGallery({ onClose }: { onClose: () => void }) {
  const [clip, setClip] = useState<PreviewKind | null>(null);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [muted, setMuted] = useState(audio.muted);
  const gallery = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => audio.subscribe(() => setMuted(audio.muted)), []);

  useEffect(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      audio.stopPreview();
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (clip) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [clip]);

  useEffect(() => {
    if (clip || mixerOpen) return;
    const frame = requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      } else if (event.key === 'Tab') {
        const buttons = [
          ...(gallery.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        const first = buttons[0],
          last = buttons.at(-1);
        if (!first || !last) return;
        if (
          event.shiftKey &&
          (document.activeElement === first || !gallery.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !gallery.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', key, true);
    };
  }, [clip, mixerOpen]);

  const start = (kind: PreviewKind) => {
    audio.stopPreview();
    audio.unlock();
    setClip(kind);
  };

  if (clip) {
    const battle = clip === 'land' ? LAND_PREVIEW : NAVAL_PREVIEW;
    return (
      <BattleCinematic
        game={PREVIEW_CONTEXT}
        battle={battle}
        playerId={battle.attackerId}
        preview
        autoAdvance={false}
        onSkip={() => setClip(null)}
        onComplete={() => setClip(null)}
      />
    );
  }

  return (
    <div className="cg-overlay">
      <section
        ref={gallery}
        className="cg-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cinema-gallery-title"
        aria-describedby="cinema-gallery-description"
        aria-hidden={mixerOpen || undefined}
        inert={mixerOpen}
      >
        <header className="cg-header">
          <span className="cg-brand">
            <Clapperboard size={21} strokeWidth={1.3} />
            <span>
              CONCÓRDIA<small>CRÔNICAS DE GUERRA</small>
            </span>
          </span>
          <button
            ref={closeButton}
            type="button"
            className="cg-close"
            onClick={onClose}
            aria-label="Fechar cinema e trilha"
          >
            <X size={20} />
          </button>
        </header>
        <div className="cg-intro">
          <span className="cg-eyebrow">UM CAMPO. DUAS BANDEIRAS. UMA HISTÓRIA.</span>
          <h2 id="cinema-gallery-title">
            Entre o estrondo <em>e o silêncio.</em>
          </h2>
          <p id="cinema-gallery-description">
            Conheça as cenas e os sons de Concórdia antes de conduzir sua própria campanha.
          </p>
          <span className="cg-example-label">Prévia encenada · dados de exemplo</span>
        </div>
        <div className="cg-clips">
          {CLIPS.map((entry) => (
            <article className={`cg-clip cg-clip--${entry.id}`} key={entry.id}>
              <img
                className="cg-clip-image"
                src={entry.image}
                alt=""
                loading="eager"
                decoding="async"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  void image
                    .decode()
                    .catch(() => {})
                    .then(() => image.classList.add('is-loaded'));
                }}
              />
              <div className="cg-clip-shade" aria-hidden="true" />
              <div className="cg-clip-heading">
                <span>{entry.number} / CENA</span>
                <span>
                  {entry.id === 'land' ? <Swords size={15} /> : <Ship size={15} />}
                  {entry.kind}
                </span>
              </div>
              <button
                type="button"
                className="cg-play-circle"
                onClick={() => start(entry.id)}
                aria-label={`Reproduzir prévia: ${entry.kind}`}
              >
                <Play size={26} fill="currentColor" strokeWidth={1} />
              </button>
              <div className="cg-clip-content">
                <span className="cg-heraldry">
                  {entry.nations.map((nation) => (
                    <CoatOfArms key={nation} nationId={nation} size={26} />
                  ))}
                </span>
                <h3>{entry.title}</h3>
                <p>{entry.description}</p>
                <div className="cg-tags">
                  {entry.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <button type="button" className="cg-play-button" onClick={() => start(entry.id)}>
                  <Play size={14} fill="currentColor" />
                  Assistir {entry.kind.toLocaleLowerCase('pt-BR')}
                  <ArrowRight size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <section className="cg-soundtrack" aria-labelledby="cinema-soundtrack-title">
          <span className="cg-soundtrack-mark" aria-hidden="true">
            <Headphones size={28} strokeWidth={1.2} />
          </span>
          <div>
            <small>A TRILHA DA SUA CAMPANHA</small>
            <h3 id="cinema-soundtrack-title">Dos conselhos ao campo de batalha.</h3>
            <p>Cinco temas originais e efeitos que acompanham cada fase do confronto.</p>
          </div>
          <div className="cg-soundtrack-actions">
            <button
              type="button"
              onClick={() => {
                if (audio.muted) audio.setMuted(false);
                audio.previewTrack('peace');
              }}
            >
              <Play size={14} />
              {muted ? 'Ativar som e escutar' : 'Escutar tema'}
            </button>
            <button
              type="button"
              onClick={() => {
                audio.stopPreview();
                setMixerOpen(true);
              }}
            >
              <SlidersHorizontal size={15} />
              Trilha e volumes
            </button>
            <button type="button" className="cg-stop-music" onClick={() => audio.stopPreview()}>
              Parar prévia
            </button>
          </div>
        </section>
        <footer className="cg-footer">
          <span>As cenas da campanha usam os relatórios reais do servidor.</span>
          <span>
            <kbd>Esc</kbd> Voltar à campanha
          </span>
        </footer>
      </section>
      {mixerOpen && (
        <div className="cg-audio-layer">
          <button
            type="button"
            className="cg-audio-scrim"
            onClick={() => setMixerOpen(false)}
            aria-label="Voltar à galeria"
          />
          <AudioSettingsModal onClose={() => setMixerOpen(false)} />
        </div>
      )}
    </div>
  );
}
