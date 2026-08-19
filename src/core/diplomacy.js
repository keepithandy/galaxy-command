export const DIPLOMATIC_STANCES = Object.freeze(['FRIENDLY', 'NEUTRAL', 'WARY', 'HOSTILE', 'WAR']);

export const DIPLOMATIC_ACTIONS = Object.freeze({
  IMPROVE_RELATIONS: Object.freeze({
    label: 'Improve Relations',
    cost: 100,
    cooldown: 2,
    opinion: 12,
    trust: 7,
    threat: -3,
    allowedAtWar: false,
  }),
  SEND_AID: Object.freeze({
    label: 'Send Aid',
    cost: 200,
    cooldown: 3,
    opinion: 18,
    trust: 12,
    threat: -5,
    allowedAtWar: false,
  }),
  ISSUE_WARNING: Object.freeze({
    label: 'Issue Warning',
    cost: 0,
    cooldown: 2,
    opinion: -12,
    trust: -8,
    threat: 14,
    allowedAtWar: true,
  }),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function relationshipKey(factionA, factionB) {
  if (!factionA || !factionB || factionA === factionB) return null;
  return [factionA, factionB].sort().join('::');
}

export function deriveDiplomaticStance(relationship) {
  if (relationship.atWar) return 'WAR';
  if (relationship.opinion >= 45 && relationship.trust >= 55) return 'FRIENDLY';
  if (relationship.opinion <= -55 || relationship.threat >= 75) return 'HOSTILE';
  if (relationship.opinion <= -20 || relationship.threat >= 50) return 'WARY';
  return 'NEUTRAL';
}

function createRelationship(factions, factionA, factionB) {
  const pair = [factionA, factionB].sort();
  const reputationA = factions[factionA]?.reputation ?? 0;
  const reputationB = factions[factionB]?.reputation ?? 0;
  const opinion = clamp(reputationA + reputationB, -100, 100);
  const trust = clamp(50 + Math.round(opinion / 4), 0, 100);
  const threat = clamp(20 + Math.abs(reputationA - reputationB), 0, 100);
  const atWar = factions[factionA]?.atWar?.includes(factionB)
    || factions[factionB]?.atWar?.includes(factionA)
    || false;
  const relationship = {
    factions: pair,
    opinion: atWar ? Math.min(opinion, -60) : opinion,
    trust: atWar ? Math.min(trust, 15) : trust,
    threat: atWar ? Math.max(threat, 60) : threat,
    stance: 'NEUTRAL',
    atWar,
    lastActions: {},
    modifiers: [],
  };
  relationship.stance = deriveDiplomaticStance(relationship);
  return relationship;
}

export function createDiplomacyState(factions) {
  const result = {};
  const factionIds = Object.keys(factions).sort();
  for (let left = 0; left < factionIds.length; left += 1) {
    for (let right = left + 1; right < factionIds.length; right += 1) {
      const factionA = factionIds[left];
      const factionB = factionIds[right];
      result[relationshipKey(factionA, factionB)] = createRelationship(factions, factionA, factionB);
    }
  }
  return result;
}

function synchronizeWarLists(state, relationship) {
  const [factionA, factionB] = relationship.factions;
  const listA = new Set(state.factions[factionA].atWar ?? []);
  const listB = new Set(state.factions[factionB].atWar ?? []);
  if (relationship.atWar) {
    listA.add(factionB);
    listB.add(factionA);
  } else {
    listA.delete(factionB);
    listB.delete(factionA);
  }
  state.factions[factionA].atWar = [...listA].sort();
  state.factions[factionB].atWar = [...listB].sort();
}

export function ensureDiplomacyState(state) {
  state.diplomacy ??= {};
  const defaults = createDiplomacyState(state.factions);
  for (const [key, fallback] of Object.entries(defaults)) {
    const relationship = state.diplomacy[key] ?? structuredClone(fallback);
    relationship.factions ??= structuredClone(fallback.factions);
    relationship.opinion ??= fallback.opinion;
    relationship.trust ??= fallback.trust;
    relationship.threat ??= fallback.threat;
    relationship.atWar ??= fallback.atWar;
    relationship.lastActions ??= {};
    relationship.modifiers ??= [];
    relationship.stance = deriveDiplomaticStance(relationship);
    state.diplomacy[key] = relationship;
    synchronizeWarLists(state, relationship);
  }
  return state.diplomacy;
}

export function getRelationship(state, factionA, factionB) {
  const key = relationshipKey(factionA, factionB);
  return key ? state.diplomacy?.[key] ?? null : null;
}

function appendEvent(state, type, payload) {
  state.events.push({ turn: state.turn, type, payload });
  if (state.events.length > 100) state.events.shift();
}

export function canPerformDiplomaticAction(state, actorId, targetId, actionId) {
  const action = DIPLOMATIC_ACTIONS[actionId];
  const relationship = getRelationship(state, actorId, targetId);
  if (!state.factions[actorId] || !state.factions[targetId] || actorId === targetId || !relationship) {
    return { allowed: false, reason: 'INVALID_FACTION_PAIR' };
  }
  if (!action) return { allowed: false, reason: 'UNKNOWN_ACTION' };
  if (relationship.atWar && !action.allowedAtWar) return { allowed: false, reason: 'AT_WAR' };
  if (state.factions[actorId].credits < action.cost) return { allowed: false, reason: 'INSUFFICIENT_CREDITS' };

  const previous = relationship.lastActions[actorId];
  if (previous && state.turn - previous.turn < action.cooldown) {
    return {
      allowed: false,
      reason: 'COOLDOWN',
      turnsRemaining: action.cooldown - (state.turn - previous.turn),
    };
  }
  return { allowed: true, reason: null };
}

export function performDiplomaticAction(state, actorId, targetId, actionId) {
  const availability = canPerformDiplomaticAction(state, actorId, targetId, actionId);
  if (!availability.allowed) return { ok: false, ...availability };

  const action = DIPLOMATIC_ACTIONS[actionId];
  const relationship = getRelationship(state, actorId, targetId);
  state.factions[actorId].credits -= action.cost;
  relationship.opinion = clamp(relationship.opinion + action.opinion, -100, 100);
  relationship.trust = clamp(relationship.trust + action.trust, 0, 100);
  relationship.threat = clamp(relationship.threat + action.threat, 0, 100);
  relationship.lastActions[actorId] = { actionId, turn: state.turn };
  relationship.modifiers.push({
    turn: state.turn,
    actorId,
    actionId,
    opinion: action.opinion,
    trust: action.trust,
    threat: action.threat,
  });
  if (relationship.modifiers.length > 12) relationship.modifiers.shift();
  relationship.stance = deriveDiplomaticStance(relationship);

  const result = {
    ok: true,
    actionId,
    actorId,
    targetId,
    cost: action.cost,
    relationship: structuredClone(relationship),
  };
  appendEvent(state, 'DIPLOMATIC_ACTION', result);
  return result;
}

export function setWarState(state, factionA, factionB, active = true) {
  const relationship = getRelationship(state, factionA, factionB);
  if (!relationship || relationship.atWar === active) return false;

  relationship.atWar = active;
  if (active) {
    relationship.opinion = Math.min(relationship.opinion, -60);
    relationship.trust = Math.min(relationship.trust, 15);
    relationship.threat = Math.max(relationship.threat, 60);
  } else {
    relationship.opinion = Math.max(relationship.opinion, -45);
    relationship.trust = Math.max(relationship.trust, 20);
    relationship.threat = Math.max(relationship.threat, 45);
  }
  relationship.stance = deriveDiplomaticStance(relationship);
  synchronizeWarLists(state, relationship);
  appendEvent(state, active ? 'WAR_DECLARED' : 'PEACE_SIGNED', { factionA, factionB });
  return true;
}

export function advanceDiplomacy(state) {
  const updates = [];
  for (const [key, relationship] of Object.entries(state.diplomacy).sort(([left], [right]) => left.localeCompare(right))) {
    if (relationship.atWar) {
      relationship.opinion = clamp(relationship.opinion - 1, -100, 100);
      relationship.threat = clamp(relationship.threat + 1, 0, 100);
    } else {
      relationship.threat += Math.sign(20 - relationship.threat);
      if (state.turn % 4 === 0) relationship.opinion -= Math.sign(relationship.opinion);
      relationship.trust += Math.sign(50 - relationship.trust);
    }
    relationship.stance = deriveDiplomaticStance(relationship);
    updates.push({
      key,
      stance: relationship.stance,
      opinion: relationship.opinion,
      trust: relationship.trust,
      threat: relationship.threat,
    });
  }
  return updates;
}

function assertRange(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected a finite value between ${min} and ${max}`);
  }
}

export function assertDiplomacyInvariants(state) {
  if (!state.diplomacy || typeof state.diplomacy !== 'object' || Array.isArray(state.diplomacy)) {
    throw new Error('Invalid diplomacy state');
  }

  const expected = createDiplomacyState(state.factions);
  const actualKeys = Object.keys(state.diplomacy).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.join('|') !== expectedKeys.join('|')) throw new Error('Diplomacy state must contain exactly one record per faction pair');

  for (const key of expectedKeys) {
    const relationship = state.diplomacy[key];
    if (!Array.isArray(relationship.factions) || relationship.factions.length !== 2) {
      throw new Error(`Invalid diplomacy factions: ${key}`);
    }
    if (relationship.factions.join('::') !== key) throw new Error(`Invalid diplomacy pair: ${key}`);
    assertRange(relationship.opinion, `${key} opinion`, -100, 100);
    assertRange(relationship.trust, `${key} trust`, 0, 100);
    assertRange(relationship.threat, `${key} threat`, 0, 100);
    if (typeof relationship.atWar !== 'boolean') throw new Error(`Invalid ${key} war state`);
    if (!DIPLOMATIC_STANCES.includes(relationship.stance)) throw new Error(`Invalid ${key} stance`);
    if (relationship.stance !== deriveDiplomaticStance(relationship)) throw new Error(`Stale ${key} stance`);
    if (!relationship.lastActions || typeof relationship.lastActions !== 'object') throw new Error(`Invalid ${key} action history`);
    if (!Array.isArray(relationship.modifiers)) throw new Error(`Invalid ${key} modifiers`);

    const [factionA, factionB] = relationship.factions;
    const listA = state.factions[factionA].atWar;
    const listB = state.factions[factionB].atWar;
    if (listA.includes(factionB) !== relationship.atWar || listB.includes(factionA) !== relationship.atWar) {
      throw new Error(`Asymmetric war state for ${key}`);
    }
    for (const [actorId, action] of Object.entries(relationship.lastActions)) {
      if (!relationship.factions.includes(actorId) || !DIPLOMATIC_ACTIONS[action.actionId]) {
        throw new Error(`Invalid ${key} last action`);
      }
      if (!Number.isInteger(action.turn) || action.turn < 1 || action.turn > state.turn) {
        throw new Error(`Invalid ${key} action turn`);
      }
    }
    for (const modifier of relationship.modifiers) {
      if (!relationship.factions.includes(modifier.actorId) || !DIPLOMATIC_ACTIONS[modifier.actionId]) {
        throw new Error(`Invalid ${key} modifier source`);
      }
      if (!Number.isInteger(modifier.turn) || modifier.turn < 1 || modifier.turn > state.turn) {
        throw new Error(`Invalid ${key} modifier turn`);
      }
      for (const field of ['opinion', 'trust', 'threat']) {
        if (!Number.isFinite(modifier[field])) throw new Error(`Invalid ${key} modifier ${field}`);
      }
    }
  }

  for (const [factionId, faction] of Object.entries(state.factions)) {
    if (new Set(faction.atWar).size !== faction.atWar.length) throw new Error(`Duplicate war entry for ${factionId}`);
    for (const targetId of faction.atWar) {
      if (!state.factions[targetId] || targetId === factionId) throw new Error(`Invalid war target for ${factionId}`);
    }
  }
  return true;
}
