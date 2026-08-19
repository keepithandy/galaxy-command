import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDiplomacyInvariants,
  breakTreaty,
  canPerformDiplomaticAction,
  canProposeTreaty,
  getRelationship,
  hasTreaty,
  performDiplomaticAction,
  proposeTreaty,
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

test('non-aggression proposals resolve deterministically on the next turn', () => {
  const first = createGameState(31);
  const second = createGameState(31);

  assert.deepEqual(canProposeTreaty(first, 'aurora', 'independent', 'NON_AGGRESSION'), {
    allowed: true,
    reason: null,
  });
  const firstResult = proposeTreaty(first, 'aurora', 'independent', 'NON_AGGRESSION');
  const secondResult = proposeTreaty(second, 'aurora', 'independent', 'NON_AGGRESSION');

  assert.deepEqual(firstResult, secondResult);
  assert.equal(first.factions.aurora.credits, 950);
  assert.equal(getRelationship(first, 'aurora', 'independent').pendingOffer.type, 'NON_AGGRESSION');

  simulateTurn(first);
  simulateTurn(second);
  const relationship = getRelationship(first, 'aurora', 'independent');
  assert.deepEqual(first, second);
  assert.equal(relationship.pendingOffer, null);
  assert.equal(hasTreaty(relationship, 'NON_AGGRESSION'), true);
  assert.ok(first.events.some((event) => event.type === 'TREATY_SIGNED'));
  assertStateInvariants(first);
});

test('alliances require and preserve a non-aggression pact', () => {
  const state = createGameState(41);
  const relationship = getRelationship(state, 'aurora', 'independent');

  assert.equal(canProposeTreaty(state, 'aurora', 'independent', 'ALLIANCE').reason, 'REQUIRES_NON_AGGRESSION');
  proposeTreaty(state, 'aurora', 'independent', 'NON_AGGRESSION');
  simulateTurn(state);
  relationship.opinion = 60;
  relationship.trust = 70;
  relationship.threat = 30;
  relationship.stance = 'FRIENDLY';

  assert.equal(proposeTreaty(state, 'aurora', 'independent', 'ALLIANCE').ok, true);
  simulateTurn(state);

  const nonAggression = relationship.treaties.find((treaty) => treaty.type === 'NON_AGGRESSION');
  const alliance = relationship.treaties.find((treaty) => treaty.type === 'ALLIANCE');
  assert.ok(nonAggression);
  assert.ok(alliance);
  assert.equal(relationship.stance, 'ALLIED');
  assert.equal(nonAggression.expiresTurn, alliance.expiresTurn);
  assertStateInvariants(state);
});

test('treaty rejection, breaking, war, peace, and expiry preserve lifecycle invariants', () => {
  const rejected = createGameState(51);
  assert.equal(proposeTreaty(rejected, 'aurora', 'vanguard', 'NON_AGGRESSION').ok, true);
  simulateTurn(rejected);
  assert.equal(hasTreaty(getRelationship(rejected, 'aurora', 'vanguard'), 'NON_AGGRESSION'), false);
  assert.ok(rejected.events.some((event) => event.type === 'TREATY_REJECTED'));

  const state = createGameState(52);
  const relationship = getRelationship(state, 'aurora', 'independent');
  proposeTreaty(state, 'aurora', 'independent', 'NON_AGGRESSION');
  simulateTurn(state);
  assert.equal(breakTreaty(state, 'aurora', 'independent', 'NON_AGGRESSION'), true);
  assert.equal(relationship.treaties.length, 0);
  assert.ok(state.events.some((event) => event.type === 'TREATY_BROKEN'));

  relationship.opinion = 10;
  relationship.trust = 53;
  relationship.threat = 30;
  relationship.stance = 'NEUTRAL';
  proposeTreaty(state, 'aurora', 'independent', 'NON_AGGRESSION');
  simulateTurn(state);
  const expiryTurn = relationship.treaties[0].expiresTurn;
  while (state.turn < expiryTurn) simulateTurn(state);
  assert.equal(relationship.treaties.length, 0);
  assert.ok(state.events.some((event) => event.type === 'TREATY_EXPIRED'));

  relationship.opinion = 10;
  relationship.trust = 53;
  relationship.threat = 30;
  relationship.stance = 'NEUTRAL';
  proposeTreaty(state, 'aurora', 'independent', 'NON_AGGRESSION');
  simulateTurn(state);
  assert.equal(setWar(state, 'aurora', 'independent', true), true);
  assert.equal(relationship.treaties.length, 0);
  assert.equal(canProposeTreaty(state, 'aurora', 'independent', 'PEACE').allowed, true);

  simulateTurn(state);
  simulateTurn(state);
  simulateTurn(state);
  assert.equal(proposeTreaty(state, 'aurora', 'independent', 'PEACE').ok, true);
  simulateTurn(state);
  assert.equal(relationship.atWar, false);
  assert.equal(relationship.warStartedTurn, null);
  assert.ok(state.events.some((event) => event.type === 'PEACE_SIGNED'));
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

test('invariants reject an alliance without its required non-aggression pact', () => {
  const state = createGameState();
  const relationship = getRelationship(state, 'aurora', 'independent');
  relationship.treaties.push({
    type: 'ALLIANCE',
    startedTurn: state.turn,
    expiresTurn: state.turn + 12,
    proposedBy: 'aurora',
  });
  relationship.stance = 'ALLIED';

  assert.throws(() => assertStateInvariants(state), /Alliance requires non-aggression pact/);
});

test('invariants reject a peace offer outside a war', () => {
  const state = createGameState();
  const relationship = getRelationship(state, 'aurora', 'independent');
  relationship.pendingOffer = {
    type: 'PEACE',
    proposedBy: 'aurora',
    proposedTurn: state.turn,
    expiresTurn: state.turn + 3,
  };

  assert.throws(() => assertStateInvariants(state), /Peace offer requires war/);
});
