import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDiplomacyInvariants,
  canPerformDiplomaticAction,
  getRelationship,
  performDiplomaticAction,
} from '../src/core/diplomacy.js';
import { assertStateInvariants, createGameState } from '../src/core/gameState.js';
import { setWar, simulateTurn } from '../src/core/simulation.js';

test('creates exactly one canonical relationship for each faction pair', () => {
  const state = createGameState();

  assert.deepEqual(Object.keys(state.diplomacy).sort(), [
    'aurora::independent',
    'aurora::vanguard',
    'independent::vanguard',
  ]);
  assert.equal(getRelationship(state, 'aurora', 'independent'), getRelationship(state, 'independent', 'aurora'));
  assert.equal(assertDiplomacyInvariants(state), true);
});

test('diplomatic actions are deterministic, cost credits, emit events, and enforce cooldowns', () => {
  const first = createGameState(101);
  const second = createGameState(101);
  const before = structuredClone(getRelationship(first, 'aurora', 'independent'));

  const firstResult = performDiplomaticAction(first, 'aurora', 'independent', 'IMPROVE_RELATIONS');
  const secondResult = performDiplomaticAction(second, 'aurora', 'independent', 'IMPROVE_RELATIONS');

  assert.deepEqual(first, second);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.ok, true);
  assert.equal(first.factions.aurora.credits, 900);
  assert.equal(firstResult.relationship.opinion, before.opinion + 12);
  assert.equal(firstResult.relationship.trust, before.trust + 7);
  assert.ok(first.events.some((event) => event.type === 'DIPLOMATIC_ACTION'));
  assert.deepEqual(canPerformDiplomaticAction(first, 'aurora', 'independent', 'ISSUE_WARNING'), {
    allowed: false,
    reason: 'COOLDOWN',
    turnsRemaining: 2,
  });
  assertStateInvariants(first);
});

test('war state remains symmetric and blocks conciliatory actions', () => {
  const state = createGameState();

  assert.equal(setWar(state, 'aurora', 'vanguard', true), true);
  const relationship = getRelationship(state, 'aurora', 'vanguard');
  assert.equal(relationship.atWar, true);
  assert.equal(relationship.stance, 'WAR');
  assert.ok(state.factions.aurora.atWar.includes('vanguard'));
  assert.ok(state.factions.vanguard.atWar.includes('aurora'));
  assert.equal(canPerformDiplomaticAction(state, 'aurora', 'vanguard', 'SEND_AID').reason, 'AT_WAR');
  assert.equal(setWar(state, 'vanguard', 'aurora', true), false);

  assert.equal(setWar(state, 'aurora', 'vanguard', false), true);
  assert.equal(relationship.atWar, false);
  assert.ok(!state.factions.aurora.atWar.includes('vanguard'));
  assertStateInvariants(state);
});

test('diplomatic drift is deterministic and invalid relationship state is rejected', () => {
  const first = createGameState(77);
  const second = createGameState(77);
  performDiplomaticAction(first, 'aurora', 'independent', 'ISSUE_WARNING');
  performDiplomaticAction(second, 'aurora', 'independent', 'ISSUE_WARNING');

  for (let turn = 0; turn < 6; turn += 1) {
    simulateTurn(first);
    simulateTurn(second);
  }
  assert.deepEqual(first, second);
  assert.equal(first.lastTurnReport.diplomacyUpdated.length, 3);

  getRelationship(first, 'aurora', 'independent').stance = 'FRIENDLY';
  assert.throws(() => assertStateInvariants(first), /Stale .* stance/);
});

test('invariants reject malformed diplomatic modifier history', () => {
  const state = createGameState();
  const relationship = getRelationship(state, 'aurora', 'independent');
  relationship.modifiers.push({
    turn: 1,
    actorId: 'missing-faction',
    actionId: 'IMPROVE_RELATIONS',
    opinion: 12,
    trust: 7,
    threat: -3,
  });

  assert.throws(() => assertStateInvariants(state), /modifier source/);
});
