import { useEffect, useState } from 'react';
import {
  ACHIEVEMENTS,
  emptyProfile,
  updateProfile,
  type StrategistProfile,
} from '../shared/achievements';
import { NATIONS } from '../shared/rules';
import type { GameView } from '../shared/types';
const KEY = 'concordia-strategist-v1';
function read(): StrategistProfile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null'),
      base = emptyProfile();
    if (
      p?.version === 1 &&
      typeof p.name === 'string' &&
      typeof p.title === 'string' &&
      /^#[0-9a-f]{6}$/i.test(p.color) &&
      NATIONS.some((n) => n.id === p.favoriteNation) &&
      p.stats &&
      Object.keys(base.stats).every((k) => Number.isFinite(p.stats[k]) && p.stats[k] >= 0) &&
      p.unlocked &&
      typeof p.unlocked === 'object' &&
      p.matches &&
      typeof p.matches === 'object'
    )
      return p;
  } catch {}
  return emptyProfile();
}
export function useStrategistProfile(game: GameView | null, id: string) {
  const [profile, setProfile] = useState(read),
    [toast, setToast] = useState<string[]>([]);
  useEffect(() => {
    if (!game) return;
    setProfile((p) => {
      const next = updateProfile(p, game, id, new Date().toISOString());
      const fresh = ACHIEVEMENTS.filter((a) => next.unlocked[a.id] && !p.unlocked[a.id]);
      if (fresh.length) setToast(fresh.map((a) => `${a.icon} ${a.name}`));
      return JSON.stringify(next) === JSON.stringify(p) ? p : next;
    });
  }, [game, id]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);
  useEffect(() => {
    if (!toast.length) return;
    const t = setTimeout(() => setToast([]), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  return { profile, setProfile, toast };
}
