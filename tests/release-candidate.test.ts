import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { army, setup } from './fixtures';
import { createGame, addPlayer, startGame, resolveTurn, viewFor } from '../server/game';
import { prepareTutorial } from '../server/tutorial';
import { validGame, writeSnapshot, readSnapshot } from '../server/storage';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCampaignSeries,
  campaignMedals,
  realmTurnAnalytics,
} from '../shared/campaignAnalytics';
import {
  ArmyCrestToken,
  FleetShipToken,
  SeaZoneCompassNode,
  ProvinceStructuresVisual,
} from '../src/MapMiniatures';
const markup = <P extends object>(component: ComponentType<P>, props: P) =>
  renderToStaticMarkup(createElement(component, props));
test('miniaturas terrestres usam escudo, composição, líder, moral e estado sem retângulos', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'portugal', { infantry: 3, artillery: 2 });
  u.morale = 18;
  u.disorganized = true;
  u.entrenched = true;
  u.encircled = true;
  const html = markup(ArmyCrestToken, {
    army: u,
    color: a.color,
    commander: {
      id: 'general',
      name: 'General',
      ownerId: a.id,
      isAdmiral: false,
      stars: 3,
      xp: 100,
      trait: 'QUARTERMASTER',
      assignedBattalionId: u.id,
      lastStandUsed: false,
    },
    selected: true,
  });
  assert.doesNotMatch(html, /<rect/);
  assert.match(html, /data-composition="artillery"/);
  assert.match(html, /miniature-crown/);
  assert.match(html, /miniature-alert/);
  assert.match(html, /linearGradient/);
  assert.match(html, /stroke="#ef4444"/);
  u.artillery = 0;
  u.infantry = 1;
  u.cavalry = 4;
  assert.match(markup(ArmyCrestToken, { army: u, color: a.color }), /data-composition="cavalry"/);
  u.cavalry = 0;
  assert.match(markup(ArmyCrestToken, { army: u, color: a.color }), /data-composition="infantry"/);
});
test('galeão e rosa dos ventos são silhuetas detalhadas, com carga e receita', () => {
  const {
      g,
      players: [a],
    } = setup(),
    u = army(g, a.id, 'portugal');
  u.isFleet = true;
  u.infantry = 0;
  u.warships = 3;
  u.transports = 2;
  u.embarkedArmyId = 'cargo';
  const ship = markup(FleetShipToken, { army: u, color: a.color }),
    compass = markup(SeaZoneCompassNode, { value: 6, color: a.color, selected: true });
  assert.doesNotMatch(ship + compass, /<rect/);
  assert.match(ship, /3 \/ 2/);
  assert.match(ship, /ship-wake/);
  assert.match(compass, /\+6 ouro/);
  assert.ok((compass.match(/<path/g) ?? []).length >= 30);
});
test('seis prédios têm miniaturas e cerco mantém fogo apenas durante replay', () => {
  const { g } = setup(),
    p = g.provinces.find((p) => p.id === 'portugal')!;
  p.fortLevel = p.portLevel = p.barracksLevel = p.marketLevel = p.foundryLevel = p.templeLevel = 1;
  p.siege = {
    attackerOwnerId: g.players[1].id,
    progress: 2,
    required: 4,
    turnsUnderSiege: 1,
    startedTurn: 1,
    lastProgressTurn: 1,
  };
  const html = markup(ProvinceStructuresVisual, { province: p, scale: 1, expanded: true });
  for (const kind of ['FORT', 'PORT', 'BARRACKS', 'MARKET', 'FOUNDRY', 'TEMPLE'])
    assert.match(html, new RegExp(`data-structure="${kind}"`));
  assert.doesNotMatch(html, /siege-flame|siege-smoke/);
  assert.match(html, /Cerco 2\/4/);
  const playing = markup(ProvinceStructuresVisual, {
    province: p,
    scale: 1,
    expanded: true,
    isTurnReplayPlaying: true,
  });
  assert.match(playing, /siege-flame/);
  assert.match(playing, /siege-smoke/);
  assert.match(html, /stroke-dasharray="50 100"/);
  assert.doesNotMatch(html, /<rect/);
});
test('novas rodadas gravam total militar, fortificação e domínio marítimo sem importar DOM', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  army(g, a.id, 'portugal', { infantry: 4, cavalry: 1 });
  army(g, b.id, 'castile', { infantry: 3 });
  const before = realmTurnAnalytics(g);
  assert.equal(before.find((p) => p.playerId === a.id)!.landTroops, 5);
  resolveTurn(g);
  assert.equal(g.history[0].analytics?.length, 3);
  assert.equal(g.history[0].analytics?.find((p) => p.playerId === a.id)!.landTroops, 5);
  assert.ok(validGame(g));
});
test('estatísticas não revelam totais militares adversários antes do resultado', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  army(g, a.id, 'portugal');
  army(g, b.id, 'castile');
  resolveTurn(g);
  const view = viewFor(g, a.id);
  assert.equal(view.history[0].analytics?.find((p) => p.playerId === a.id)!.landTroops, 5);
  assert.equal(view.history[0].analytics?.find((p) => p.playerId === b.id)!.landTroops, undefined);
  assert.ok(
    buildCampaignSeries(view, a.id)
      .find((p) => p.id === b.id)!
      .points.every((p) => p.landTroops === null),
  );
  g.phase = 'finished';
  assert.equal(
    viewFor(g, a.id).history[0].analytics?.find((p) => p.playerId === b.id)!.landTroops,
    5,
  );
});
test('histórico anterior ao RC mantém lacunas militares, controle e economia reais', () => {
  const {
    g,
    players: [a],
  } = setup();
  army(g, a.id, 'portugal');
  resolveTurn(g);
  delete g.history[0].analytics;
  const series = buildCampaignSeries(viewFor(g, a.id), a.id).find((p) => p.id === a.id)!;
  assert.equal(series.points[0].landTroops, null);
  assert.equal(series.points[0].territory, 1);
  assert.equal(series.points[0].gold, g.history[0].economy.find((e) => e.playerId === a.id)!.gold);
  assert.equal(series.points.at(-1)!.landTroops, 5);
});
test('medalhas respeitam empate, economia acumulada e ausência de domínio naval', () => {
  const {
    g,
    players: [a, b],
  } = setup();
  a.wonBattles = b.wonBattles = 2;
  resolveTurn(g);
  const medals = campaignMedals(viewFor(g, a.id));
  assert.deepEqual(medals.find((m) => m.id === 'marshal')!.winners, [a.id, b.id]);
  assert.equal(medals.find((m) => m.id === 'oceans')!.winners.length, 0);
  const richest = medals.find((m) => m.id === 'magnate')!;
  assert.ok(richest.value > 0);
  assert.equal(medals.length, 4);
});
test('mesa de tutorial é privada, tem alvo acessível e não exige recrutar um líder pago', () => {
  const g = createGame('TUTOR9', 'campaign', true, 123);
  const a = addPlayer(g, 'Aprendiz', false, 'vespera');
  addPlayer(g, 'Norte', true, 'ferro_norte');
  addPlayer(g, 'Sul', true, 'kaldor');
  startGame(g);
  prepareTutorial(g, a.id);
  assert.ok(validGame(g));
  assert.equal(g.matchConfig.tutorial, true);
  assert.equal(g.isPublic, false);
  assert.equal(g.enableSecretObjectives, false);
  assert.equal(a.gold, 180);
  assert.ok(
    g.battalions.some((u) => u.ownerId === a.id && u.provinceId === 'portugal' && u.infantry === 8),
  );
  assert.ok(g.commanders.some((c) => c.ownerId === a.id && !c.assignedBattalionId));
  assert.equal(g.provinces.find((p) => p.id === 'maghreb')!.ownerId, null);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'concordia-rc-save-'));
  try {
    writeSnapshot(
      path.join(directory, 'rooms.json'),
      [{ game: g, sessions: [], touched: Date.now(), remainingMs: 60000 }],
      Date.now(),
    );
    assert.equal(
      readSnapshot(path.join(directory, 'rooms.json'))[0].game.matchConfig.tutorial,
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
