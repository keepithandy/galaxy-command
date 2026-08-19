import { assertStateInvariants, recordEvent } from './gameState.js';

export const FLEET_MOVEMENT_STATUSES = Object.freeze(['IDLE', 'MOVING', 'ARRIVED', 'RETREATING']);

function distance(left, right) {
  return Math.hypot(
    left.position[0] - right.position[0],
    left.position[1] - right.position[1],
    left.position[2] - right.position[2],
  );
}

export function buildSystemGraph(galaxy, neighborsPerSystem = 2) {
  const systems = galaxy.systems ?? [];
  const graph = Object.fromEntries(systems.map((system) => [system.id, []]));
  for (const system of systems) {
    const nearest = systems
      .filter((candidate) => candidate.id !== system.id)
      .sort((left, right) => distance(system, left) - distance(system, right))
      .slice(0, neighborsPerSystem);
    for (const candidate of nearest) {
      if (!graph[system.id].includes(candidate.id)) graph[system.id].push(candidate.id);
      if (!graph[candidate.id].includes(system.id)) graph[candidate.id].push(system.id);
    }
  }
  return graph;
}

export function getReachableSystemIds(galaxy, systemId) {
  return buildSystemGraph(galaxy)[systemId] ?? [];
}

export function assignFleetDestination(state, galaxy, fleetId, destinationSystemId) {
  assertStateInvariants(state);
  const fleet = state.fleets[fleetId];
  const destination = galaxy.systems?.find((system) => system.id === destinationSystemId);
  if (!fleet || !destination || fleet.systemId === destinationSystemId) return false;
  if (!getReachableSystemIds(galaxy, fleet.systemId).includes(destinationSystemId)) return false;

  fleet.destinationSystemId = destinationSystemId;
  fleet.movementStatus = 'MOVING';
  fleet.eta = 1;
  fleet.status = 'IN TRANSIT';
  fleet.lastMovementEvent = {
    type: 'FLEET_DEPARTED',
    turn: state.turn,
    fromSystemId: fleet.systemId,
    toSystemId: destinationSystemId,
  };
  recordEvent(state, 'FLEET_DEPARTED', {
    fleetId,
    fromSystemId: fleet.systemId,
    toSystemId: destinationSystemId,
    eta: fleet.eta,
  });
  return true;
}

export function advanceFleetMovement(state) {
  const moved = [];
  for (const fleet of Object.values(state.fleets).sort((left, right) => left.id.localeCompare(right.id))) {
    if (!fleet.destinationSystemId) continue;
    fleet.eta = Math.max(0, fleet.eta - 1);
    if (fleet.eta > 0) continue;

    const fromSystemId = fleet.systemId;
    fleet.systemId = fleet.destinationSystemId;
    fleet.destinationSystemId = null;
    fleet.movementStatus = 'ARRIVED';
    fleet.status = 'ARRIVED';
    fleet.lastMovementEvent = {
      type: 'FLEET_ARRIVED',
      turn: state.turn,
      fromSystemId,
      toSystemId: fleet.systemId,
    };
    const movement = { fleetId: fleet.id, fromSystemId, toSystemId: fleet.systemId };
    moved.push(movement);
    recordEvent(state, 'FLEET_ARRIVED', movement);
  }
  return moved;
}
