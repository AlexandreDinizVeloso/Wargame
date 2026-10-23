import { BALANCE } from '../shared/balance';
import type { GameState } from '../shared/types';
import { createBattalion } from './state';
import { compositionOf } from '../shared/rules';
import { realmLimits } from '../shared/economy';
export function prepareTutorial(g: GameState, playerId: string) {
  const player = g.players.find((p) => p.id === playerId);
  if (!player || g.phase !== 'planning') throw new Error('Tutorial exige uma campanha iniciada.');
  g.matchConfig.tutorial = true;
  g.isPublic = false;
  g.enableSecretObjectives = false;
  g.matchConfig.enableSecretObjectives = false;
  player.gold = BALANCE.tutorialGold;
  player.influence = 35;
  for (const c of g.commanders.filter((c) => c.ownerId === playerId)) c.assignedBattalionId = null;
  const target = g.provinces.find((p) => p.id === 'maghreb')!;
  target.ownerId = null;
  target.occupierId = null;
  target.fortLevel = 0;
  target.siege = null;
  target.neutralDevelopmentLevel = 0;
  g.battalions = g.battalions.filter((a) => a.provinceId !== target.id && a.ownerId !== playerId);
  createBattalion(g, playerId, 'castile', compositionOf({ infantry: 8, cavalry: 1 }), {
    name: 'Estandarte do Aprendiz',
    morale: 90,
    training: 1.3,
  });
  createBattalion(g, 'NEUTRAL', target.id, compositionOf({ infantry: 2 }), {
    name: 'Guarda de treino',
    morale: 50,
    training: 1,
  });
  for (const p of g.players) {
    const limits = realmLimits(g, p.id);
    p.armyCap = limits.armyCap;
    p.manpowerCap = limits.manpowerCap;
    p.manpower = Math.min(p.manpower, limits.manpowerCap);
  }
}
