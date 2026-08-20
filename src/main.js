import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { createGameState, hydrateGalaxyState } from './core/gameState.js';
import { generateGalaxy } from './core/galaxyGeneration.js';
import { simulateTurn } from './core/simulation.js';
import { assignFleetDestination, getReachableSystemIds } from './core/fleetMovement.js';
import {
  breakTreaty,
  canDeclareIndependence,
  canPerformDiplomaticAction,
  canProposeTreaty,
  canReleaseVassal,
  canSetWarState,
  declareIndependence,
  DIPLOMATIC_ACTIONS,
  getRelationship,
  performDiplomaticAction,
  proposeTreaty,
  releaseVassal,
  setWarState,
  TREATY_DEFINITIONS,
} from './core/diplomacy.js';
import { exportSave, importSave, loadGame, SaveError, saveGame } from './core/save.js';
import { GAME_VERSION, VERSION_CACHE_KEY } from './config/buildInfo.js';
import galaxyData from './data/galaxy.json';
import {
  createLabel,
  createStrategicMap,
  factionColor,
  setLabelState,
  systemFaction,
} from './navigation/index.js';
import { createGalaxyBackdrop, createSystemHalo } from './visuals/galaxyBackdrop.js';
import './styles/main.css';
import './styles/strategic-map.css';

const requestedSeed = Number(new URLSearchParams(location.search).get('seed'));
const proceduralSeed = Number.isSafeInteger(requestedSeed) ? requestedSeed : null;
const galaxy = proceduralSeed === null ? galaxyData.galaxy : generateGalaxy({ seed: proceduralSeed });
const gameState = hydrateGalaxyState(createGameState(proceduralSeed ?? 1337), galaxy);
const factions = new Map(galaxy.factions.map((faction) => [faction.id, faction]));

const app = document.querySelector('#app');
const canvas = document.querySelector('#galaxy-canvas');
const loading = document.querySelector('#loading');
const panel = document.querySelector('.planet-panel');
const content = document.querySelector('#planet-content');
const selectionReadout = document.querySelector('#selection-readout');
const navigationStatus = document.querySelector('#navigation-status');
const zoomHint = document.querySelector('#zoom-hint');
const closePanel = document.querySelector('#close-panel');
const panelHeading = document.querySelector('#panel-heading');
const galaxyViewButton = document.querySelector('#galaxy-view');
const advanceTurnButton = document.querySelector('#advance-turn');
const diplomacyViewButton = document.querySelector('#diplomacy-view');
const saveGameButton = document.querySelector('#save-game');
const loadGameButton = document.querySelector('#load-game');
const exportGameButton = document.querySelector('#export-game');
const importGameButton = document.querySelector('#import-game');
const importFile = document.querySelector('#import-file');
const factionFilters = document.querySelector('#faction-filters');
const gameVersion = document.querySelector('#game-version');
const fatalError = document.querySelector('#fatal-error');
const fatalErrorTitle = document.querySelector('#fatal-error-title');
const fatalErrorMessage = document.querySelector('#fatal-error-message');
const fatalErrorRetry = document.querySelector('#fatal-error-retry');

let fatalErrorShown = false;
let lastFocusedElement = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showFatalError(title, message) {
  fatalErrorShown = true;
  loading.classList.add('hidden');
  fatalErrorTitle.textContent = title;
  fatalErrorMessage.textContent = message;
  fatalError.hidden = false;
  fatalErrorRetry.focus({ preventScroll: true });
}

function describeInitializationError(error) {
  if (error instanceof Error && error.message) return error.message;
  return 'The browser could not create the 3D command view.';
}

function assertWebGLSupport() {
  const probe = document.createElement('canvas');
  const context = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!context) {
    throw new Error('WebGL is unavailable. Enable hardware acceleration or use a browser with WebGL support.');
  }
}

function installRuntimeErrorBoundary() {
  addEventListener('error', (event) => {
    if (!fatalErrorShown) showFatalError('Galaxy Command stopped unexpectedly', describeInitializationError(event.error));
  });
  addEventListener('unhandledrejection', (event) => {
    if (!fatalErrorShown) showFatalError('Galaxy Command stopped unexpectedly', describeInitializationError(event.reason));
  });
}

installRuntimeErrorBoundary();

document.title = `Galaxy Command · ${GAME_VERSION}`;
document.documentElement.dataset.gameVersion = GAME_VERSION;
gameVersion.textContent = `v${GAME_VERSION}`;

try {
  localStorage.setItem(VERSION_CACHE_KEY, GAME_VERSION);
} catch {
  // The game does not require storage access to run.
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050a);
scene.fog = new THREE.FogExp2(0x03050a, 0.0022);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 40, 64);

let renderer;
try {
  assertWebGLSupport();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  showFatalError(
    '3D graphics are unavailable',
    describeInitializationError(error)
  );
}

if (!renderer) {
  fatalErrorRetry.addEventListener('click', () => window.location.reload());
} else {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

const interactionElement = renderer?.domElement ?? canvas;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'label-layer';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, interactionElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 115;
controls.zoomToCursor = true;
controls.target.set(0, 0, 0);

const ZOOM_THRESHOLDS = Object.freeze({
  systems: Object.freeze({ enter: 68, exit: 72 }),
  planets: Object.freeze({ enter: 44, exit: 48 }),
});
const zoomVisibility = { systems: false, planets: false };
let hasRevealedSystems = false;

const strategicMap = createStrategicMap({ camera, controls, scene });
controls.addEventListener('start', () => strategicMap.cancelTransition());

scene.add(new THREE.AmbientLight(0x667799, 0.7));
const keyLight = new THREE.PointLight(0xffffff, 2.4, 80);
scene.add(keyLight);

const selectable = [];
const systemRecords = new Map();
const planetVisuals = new Map();
const fleetMarkers = new Map();
let selected = null;

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const random = createSeededRandom(gameState.seed);
const galaxyBackdrop = createGalaxyBackdrop(random);
scene.add(galaxyBackdrop.group);

function createOrbit(radius) {
  const points = [];
  for (let i = 0; i <= 96; i += 1) {
    const angle = (i / 96) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x43506a, transparent: true, opacity: 0.38 });
  return new THREE.LineLoop(geometry, material);
}

function createPlanet(planet, system) {
  const statePlanet = gameState.planets[planet.id];
  const geometry = new THREE.SphereGeometry(planet.size, 20, 20);
  const material = new THREE.MeshStandardMaterial({
    color: factionColor(statePlanet.faction, galaxy.factions),
    roughness: 0.75,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const orbitAngle = random() * Math.PI * 2;
  mesh.position.set(Math.cos(orbitAngle) * planet.orbit, 0, Math.sin(orbitAngle) * planet.orbit);
  mesh.userData = {
    type: 'planet',
    planetId: planet.id,
    systemId: system.id,
    orbit: planet.orbit,
    orbitAngle,
    orbitSpeed: 0.035 / Math.sqrt(planet.orbit),
  };
  selectable.push(mesh);
  return mesh;
}

function createTerritoryRing(system) {
  const owner = systemFaction(system, gameState.planets);
  const geometry = new THREE.RingGeometry(6.7, 7.15, 64);
  const material = new THREE.MeshBasicMaterial({
    color: factionColor(owner, galaxy.factions),
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.08;
  return ring;
}

function createSystem(system) {
  const group = new THREE.Group();
  group.position.fromArray(system.position);
  group.userData.systemId = system.id;

  const star = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, 24, 24),
    new THREE.MeshBasicMaterial({ color: system.starColor, toneMapped: false })
  );
  star.userData = { type: 'system', systemId: system.id };
  selectable.push(star);
  group.add(star);

  const halo = createSystemHalo(galaxyBackdrop.glowTexture, system.starColor);
  group.add(halo);

  const territory = createTerritoryRing(system);
  group.add(territory);

  const labelElement = createLabel(system.name);
  const label = new CSS2DObject(labelElement);
  label.position.set(0, 2.1, 0);
  group.add(label);

  system.planets.forEach((planet) => {
    const orbit = createOrbit(planet.orbit);
    const mesh = createPlanet(planet, system);
    group.add(orbit);
    group.add(mesh);
    planetVisuals.set(planet.id, { mesh, orbit, planet, system });
  });

  systemRecords.set(system.id, { group, labelElement, star, halo, system, territory });
  scene.add(group);
}

function createFleetMarker(fleet, offsetIndex) {
  const systemRecord = systemRecords.get(fleet.systemId);
  if (!systemRecord) return;
  const color = factionColor(fleet.faction, galaxy.factions);
  const geometry = new THREE.OctahedronGeometry(0.38, 0);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.25,
    roughness: 0.45,
  });
  const marker = new THREE.Mesh(geometry, material);
  marker.position.set(-2.1 + offsetIndex * 0.75, 1.35, -1.5);
  marker.userData = { type: 'fleet', fleetId: fleet.id, systemId: fleet.systemId };
  selectable.push(marker);
  systemRecord.group.add(marker);

  const labelElement = createLabel(fleet.name, 'galaxy-label fleet-label');
  const label = new CSS2DObject(labelElement);
  label.position.set(0, 0.7, 0);
  marker.add(label);
  fleetMarkers.set(fleet.id, { fleet, labelElement, marker });
}

function formatPopulation(population) {
  if (population >= 1000) return `${(population / 1000).toFixed(2)}B`;
  if (population < 1) return `${Math.round(population * 1000)}K`;
  return `${population.toFixed(2)}M`;
}

function factionById(factionId) {
  return factions.get(factionId) ?? { id: 'neutral', name: 'Unknown', color: '#ffffff' };
}

function openInspectionPanel() {
  if (!panel.classList.contains('open')) lastFocusedElement = document.activeElement;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  panel.focus({ preventScroll: true });
}

function closeInspectionPanel({ restoreFocus = true } = {}) {
  const wasOpen = panel.classList.contains('open');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  if (restoreFocus && wasOpen && lastFocusedElement?.isConnected) {
    lastFocusedElement.focus({ preventScroll: true });
  }
  delete panel.dataset.mode;
  lastFocusedElement = null;
}

function showPlanet(planetId) {
  const visual = planetVisuals.get(planetId);
  const planet = gameState.planets[planetId];
  if (!visual || !planet) return;
  if (selected) selected.scale.setScalar(1);
  selected = visual.mesh;
  selected.scale.setScalar(1.45);
  const faction = factionById(planet.faction);
  panel.dataset.mode = 'planet';
  panelHeading.textContent = 'PLANETARY INTEL';
  selectionReadout.textContent = `${visual.system.name.toUpperCase()} · ${visual.planet.name.toUpperCase()}`;
  content.innerHTML = `
    <div class="planet-title">
      <span class="planet-mark" style="background:${faction.color}"></span>
      <div><p class="eyebrow">PLANETARY INTEL</p><h2>${visual.planet.name}</h2></div>
    </div>
    <div class="intel-row"><span>Faction</span><strong>${faction.name}</strong></div>
    <div class="intel-row"><span>Population</span><strong>${formatPopulation(planet.population)}</strong></div>
    <div class="stat"><span>Industry</span><b>${planet.industry}</b><i><em style="width:${planet.industry}%"></em></i></div>
    <div class="stat"><span>Resources</span><b>${planet.resources}</b><i><em style="width:${planet.resources}%"></em></i></div>
    <div class="stat"><span>Defense</span><b>${planet.defense}</b><i><em style="width:${planet.defense}%"></em></i></div>
    <div class="stat"><span>Development</span><b>${planet.development.toFixed(1)}</b><i><em style="width:${planet.development}%"></em></i></div>
    <div class="status-large">${visual.planet.status}</div>
  `;
  openInspectionPanel();
}

function showFleet(fleetId) {
  const fleet = gameState.fleets[fleetId];
  const system = galaxy.systems.find((item) => item.id === fleet?.systemId);
  if (!fleet || !system) return;
  const faction = factionById(fleet.faction);
  const destination = fleet.destinationSystemId
    ? galaxy.systems.find((item) => item.id === fleet.destinationSystemId)
    : null;
  const reachableSystems = getReachableSystemIds(galaxy, fleet.systemId)
    .map((systemId) => galaxy.systems.find((item) => item.id === systemId))
    .filter(Boolean);
  const destinationOptions = reachableSystems.length > 0
    ? reachableSystems.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')
    : '<option value="">No reachable systems</option>';
  const movementStatus = fleet.movementStatus === 'IDLE' ? fleet.status : fleet.movementStatus;
  panel.dataset.mode = 'fleet';
  panelHeading.textContent = 'FLEET INTEL';
  selectionReadout.textContent = `${system.name.toUpperCase()} · ${fleet.name.toUpperCase()}`;
  content.innerHTML = `
    <div class="planet-title">
      <span class="planet-mark" style="background:${faction.color}"></span>
      <div><p class="eyebrow">FLEET CONTACT</p><h2>${fleet.name}</h2></div>
    </div>
    <div class="intel-row"><span>Faction</span><strong>${faction.name}</strong></div>
    <div class="intel-row"><span>Current system</span><strong>${system.name}</strong></div>
    <div class="intel-row"><span>Destination</span><strong>${destination?.name ?? '—'}</strong></div>
    <div class="intel-row"><span>ETA</span><strong>${fleet.eta ? `${fleet.eta} TURN` : '—'}</strong></div>
    <div class="intel-row"><span>Strength</span><strong>${fleet.strength}</strong></div>
    <div class="fleet-route">
      <label for="fleet-destination">SET COURSE</label>
      <select id="fleet-destination" ${fleet.movementStatus === 'MOVING' ? 'disabled' : ''}>
        <option value="">Choose a reachable system</option>
        ${destinationOptions}
      </select>
      <button id="fleet-move-button" type="button" ${fleet.movementStatus === 'MOVING' ? 'disabled' : ''}>MOVE FLEET</button>
    </div>
    <div class="status-large">${movementStatus}</div>
  `;
  openInspectionPanel();
  const destinationSelect = document.querySelector('#fleet-destination');
  const moveButton = document.querySelector('#fleet-move-button');
  moveButton?.addEventListener('click', () => {
    if (!destinationSelect?.value) return;
    if (assignFleetDestination(gameState, galaxy, fleetId, destinationSelect.value)) {
      syncGalaxyVisuals();
      showFleet(fleetId);
    }
  });
}

function diplomaticActionReason(availability) {
  if (availability.reason === 'AT_WAR') return 'Unavailable during war';
  if (availability.reason === 'INSUFFICIENT_CREDITS') return 'Insufficient credits';
  if (availability.reason === 'COOLDOWN') return `Available in ${availability.turnsRemaining} turn(s)`;
  if (availability.reason === 'OFFER_PENDING') return 'Another offer is pending';
  if (availability.reason === 'NOT_AT_WAR') return 'Only available during war';
  if (availability.reason === 'TREATY_ACTIVE') return 'Treaty already active';
  if (availability.reason === 'REQUIRES_NON_AGGRESSION') return 'Requires an active non-aggression pact';
  if (availability.reason === 'REQUIRES_ALLIANCE') return 'Requires an active alliance';
  if (availability.reason === 'VASSALAGE_ACTIVE') return 'Vassalage already defines this relationship';
  if (availability.reason === 'ACTOR_IS_VASSAL') return 'A subject cannot conduct independent diplomacy';
  if (availability.reason === 'TARGET_IS_VASSAL') return 'This faction is already a subject';
  if (availability.reason === 'TARGET_HAS_VASSALS') return 'An overlord cannot become a subject';
  if (availability.reason === 'ACTOR_AT_WAR') return 'End current wars before proposing vassalage';
  if (availability.reason === 'TARGET_AT_WAR') return 'The target must be at peace before vassalage';
  if (availability.reason === 'VASSALAGE_MINIMUM_TERM') return `Independence available in ${availability.turnsRemaining} turn(s)`;
  return availability.allowed ? '' : 'Unavailable';
}

function showDiplomacy() {
  panel.dataset.mode = 'diplomacy';
  panelHeading.textContent = 'DIPLOMATIC COMMAND';
  selectionReadout.textContent = 'DIPLOMATIC COMMAND';
  const playerFaction = factionById(gameState.playerFaction);
  const targets = galaxy.factions.filter((faction) => faction.id !== gameState.playerFaction);
  content.innerHTML = `
    <div class="planet-title">
      <span class="planet-mark" style="background:${playerFaction.color}"></span>
      <div><p class="eyebrow">FOREIGN RELATIONS</p><h2>${playerFaction.name}</h2></div>
    </div>
    <div class="intel-row"><span>Treasury</span><strong>${Math.floor(gameState.factions[gameState.playerFaction].credits)} CR</strong></div>
    <div class="diplomacy-list">
      ${targets.map((target) => {
        const relationship = getRelationship(gameState, gameState.playerFaction, target.id);
        const actions = Object.entries(DIPLOMATIC_ACTIONS).map(([actionId, action]) => {
          const availability = canPerformDiplomaticAction(gameState, gameState.playerFaction, target.id, actionId);
          const reason = diplomaticActionReason(availability);
          return `<button type="button" data-diplomacy-action="${actionId}" data-target-faction="${target.id}" ${availability.allowed ? '' : 'disabled'} title="${reason}">${action.label}${action.cost ? ` · ${action.cost} CR` : ''}</button>`;
        }).join('');
        const proposalTypes = relationship.atWar
          ? ['PEACE']
          : (relationship.vassalage ? [] : ['NON_AGGRESSION', 'ALLIANCE', 'VASSALAGE']);
        const proposalActions = proposalTypes.map((treatyType) => {
          const treaty = TREATY_DEFINITIONS[treatyType];
          const availability = canProposeTreaty(gameState, gameState.playerFaction, target.id, treatyType);
          const reason = diplomaticActionReason(availability);
          return `<button type="button" data-treaty-proposal="${treatyType}" data-target-faction="${target.id}" ${availability.allowed ? '' : 'disabled'} title="${reason}">PROPOSE ${treaty.label.toUpperCase()}${treaty.cost ? ` · ${treaty.cost} CR` : ''}</button>`;
        }).join('');
        const activeTreaties = relationship.treaties
          .map((treaty) => `<div class="treaty-chip"><span>${TREATY_DEFINITIONS[treaty.type].label} · ${treaty.expiresTurn - gameState.turn} turns</span><button type="button" data-break-treaty="${treaty.type}" data-target-faction="${target.id}">BREAK</button></div>`)
          .join('');
        const vassalage = relationship.vassalage;
        const playerIsOverlord = vassalage?.overlordId === gameState.playerFaction;
        const vassalageStatus = vassalage
          ? `<div class="treaty-chip vassalage-chip"><span>${playerIsOverlord ? 'SUBJECT' : 'OVERLORD'} · ${gameState.turn - vassalage.startedTurn} turns</span></div>`
          : '';
        const relationshipStatus = activeTreaties || vassalageStatus
          ? `${activeTreaties}${vassalageStatus}`
          : '<span class="muted treaty-empty">No active treaties</span>';
        const pendingOffer = relationship.pendingOffer
          ? `<div class="pending-offer">PENDING · ${TREATY_DEFINITIONS[relationship.pendingOffer.type].label.toUpperCase()} · RESOLVES NEXT TURN</div>`
          : '';
        let sovereignAction = '';
        if (vassalage) {
          if (playerIsOverlord) {
            const availability = canReleaseVassal(gameState, gameState.playerFaction, target.id);
            sovereignAction = `<button type="button" data-release-vassal="true" data-target-faction="${target.id}" ${availability.allowed ? '' : 'disabled'} title="${diplomaticActionReason(availability)}">RELEASE VASSAL</button>`;
          } else {
            const availability = canDeclareIndependence(gameState, gameState.playerFaction, target.id);
            sovereignAction = `<button type="button" class="danger-action" data-declare-independence="true" data-target-faction="${target.id}" ${availability.allowed ? '' : 'disabled'} title="${diplomaticActionReason(availability)}">DECLARE INDEPENDENCE</button>`;
          }
        } else if (!relationship.atWar) {
          const availability = canSetWarState(gameState, gameState.playerFaction, target.id, true);
          sovereignAction = `<button type="button" class="danger-action" data-declare-war="true" data-target-faction="${target.id}" ${availability.allowed ? '' : 'disabled'} title="${diplomaticActionReason(availability)}">DECLARE WAR</button>`;
        }
        return `
          <section class="diplomacy-card" data-relationship="${target.id}">
            <div class="diplomacy-faction"><span class="planet-mark" style="background:${target.color}"></span><strong>${target.name}</strong><b>${relationship.stance}</b></div>
            <div class="relationship-stats">
              <span>Opinion <b>${relationship.opinion}</b></span>
              <span>Trust <b>${relationship.trust}</b></span>
              <span>Threat <b>${relationship.threat}</b></span>
            </div>
            <div class="treaty-list">${relationshipStatus}${pendingOffer}</div>
            <div class="diplomacy-actions">${actions}${proposalActions}${sovereignAction}</div>
          </section>
        `;
      }).join('')}
    </div>
  `;
  openInspectionPanel();
  content.querySelectorAll('[data-diplomacy-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const actionId = button.dataset.diplomacyAction;
      const targetId = button.dataset.targetFaction;
      const result = performDiplomaticAction(gameState, gameState.playerFaction, targetId, actionId);
      if (!result.ok) {
        setSaveStatus(`DIPLOMATIC ACTION BLOCKED · ${result.reason}`);
        return;
      }
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) {
        setSaveStatus(`${DIPLOMATIC_ACTIONS[actionId].label.toUpperCase()} · ${factionById(targetId).name.toUpperCase()}`);
      }
    });
  });
  content.querySelectorAll('[data-treaty-proposal]').forEach((button) => {
    button.addEventListener('click', () => {
      const treatyType = button.dataset.treatyProposal;
      const targetId = button.dataset.targetFaction;
      const result = proposeTreaty(gameState, gameState.playerFaction, targetId, treatyType);
      if (!result.ok) {
        setSaveStatus(`TREATY PROPOSAL BLOCKED · ${result.reason}`);
        return;
      }
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) setSaveStatus(`${TREATY_DEFINITIONS[treatyType].label.toUpperCase()} PROPOSED`);
    });
  });
  content.querySelectorAll('[data-break-treaty]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.targetFaction;
      const treatyType = button.dataset.breakTreaty;
      if (!breakTreaty(gameState, gameState.playerFaction, targetId, treatyType)) return;
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) setSaveStatus(`${TREATY_DEFINITIONS[treatyType].label.toUpperCase()} BROKEN`);
    });
  });
  content.querySelectorAll('[data-declare-war]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.targetFaction;
      if (!setWarState(gameState, gameState.playerFaction, targetId, true)) return;
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) setSaveStatus(`WAR DECLARED · ${factionById(targetId).name.toUpperCase()}`);
    });
  });
  content.querySelectorAll('[data-release-vassal]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.targetFaction;
      const result = releaseVassal(gameState, gameState.playerFaction, targetId);
      if (!result.ok) return;
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) setSaveStatus(`VASSAL RELEASED · ${factionById(targetId).name.toUpperCase()}`);
    });
  });
  content.querySelectorAll('[data-declare-independence]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.targetFaction;
      const result = declareIndependence(gameState, gameState.playerFaction, targetId);
      if (!result.ok) return;
      const autosaveSucceeded = saveAutosave();
      showDiplomacy();
      if (autosaveSucceeded) setSaveStatus(`INDEPENDENCE DECLARED · WAR WITH ${factionById(targetId).name.toUpperCase()}`);
    });
  });
}

function syncFleetMarkers() {
  for (const { fleet, marker } of fleetMarkers.values()) {
    const systemRecord = systemRecords.get(fleet.systemId);
    if (!systemRecord) continue;
    if (marker.parent !== systemRecord.group) {
      marker.parent?.remove(marker);
      systemRecord.group.add(marker);
    }
    marker.userData.systemId = fleet.systemId;
  }
}

function updateZoomVisibility(cameraDistance) {
  zoomVisibility.systems = zoomVisibility.systems
    ? cameraDistance <= ZOOM_THRESHOLDS.systems.exit
    : cameraDistance <= ZOOM_THRESHOLDS.systems.enter;
  zoomVisibility.planets = zoomVisibility.planets
    ? cameraDistance <= ZOOM_THRESHOLDS.planets.exit
    : cameraDistance <= ZOOM_THRESHOLDS.planets.enter;
  if (zoomVisibility.planets) zoomVisibility.systems = true;
  if (zoomVisibility.systems) hasRevealedSystems = true;
  return zoomVisibility;
}

function nearestSystemId(position) {
  let nearestId = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [systemId, { group }] of systemRecords) {
    const distance = group.position.distanceToSquared(position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = systemId;
    }
  }
  return nearestId;
}

function syncGalaxyVisuals() {
  const filter = strategicMap.state.factionFilter;
  const focusedSystem = strategicMap.state.selectedSystem;
  const isGalaxyView = strategicMap.state.mode === 'galaxy';
  const cameraDistance = camera.position.distanceTo(controls.target);
  const { systems: systemsVisible, planets: planetsVisible } = updateZoomVisibility(cameraDistance);
  const visiblePlanetSystem = focusedSystem ?? nearestSystemId(controls.target);
  zoomHint.hidden = hasRevealedSystems || !isGalaxyView;
  for (const [planetId, visual] of planetVisuals) {
    const planet = gameState.planets[planetId];
    const matches = filter === 'all' || planet.faction === filter;
    visual.mesh.material.color.set(factionColor(planet.faction, galaxy.factions));
    const inVisibleSystem = visual.system.id === visiblePlanetSystem;
    visual.mesh.visible = matches && planetsVisible && inVisibleSystem;
    visual.orbit.visible = matches && planetsVisible && inVisibleSystem;
  }

  for (const { labelElement, system, territory, star, halo } of systemRecords.values()) {
    const owner = systemFaction(system, gameState.planets);
    const matches = filter === 'all' || owner === filter;
    const isFocused = focusedSystem === system.id;
    territory.material.color.set(factionColor(owner, galaxy.factions));
    territory.material.opacity = isFocused ? 0.2 : (matches ? 0.045 : 0.012);
    territory.visible = systemsVisible && matches;
    star.visible = systemsVisible && matches;
    halo.visible = systemsVisible && matches;
    star.scale.setScalar(isFocused ? 1.55 : 1);
    halo.material.opacity = matches ? (isFocused ? 1 : 0.72) : 0.14;
    halo.scale.setScalar(isFocused ? 6.2 : 4.6);
    setLabelState(labelElement, {
      selected: isFocused,
      faction: owner,
    });
    labelElement.dataset.filtered = String(!matches);
    labelElement.hidden = !systemsVisible || !matches;
  }

  syncFleetMarkers();
  for (const { fleet, labelElement, marker } of fleetMarkers.values()) {
    const matches = filter === 'all' || fleet.faction === filter;
    marker.visible = matches && systemsVisible && !isGalaxyView && fleet.systemId === focusedSystem;
    labelElement.dataset.filtered = String(!matches);
  }

  factionFilters.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.faction === filter));
  });
}

controls.addEventListener('change', syncGalaxyVisuals);

function renderFilterControls() {
  const options = [{ id: 'all', name: 'All' }, ...galaxy.factions];
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.faction = option.id;
    button.textContent = option.name;
    button.setAttribute('aria-pressed', String(option.id === 'all'));
    button.addEventListener('click', () => strategicMap.setFactionFilter(option.id));
    factionFilters.appendChild(button);
  }
}

function returnToGalaxy() {
  strategicMap.returnToGalaxy();
  closeInspectionPanel();
  if (selected) selected.scale.setScalar(1);
  selected = null;
  selectionReadout.textContent = 'NO SYSTEM SELECTED';
}

function navigationLabel(state) {
  const location = state.mode === 'galaxy'
    ? 'GALAXY VIEW'
    : `${state.mode.toUpperCase()} · ${(state.selectedPlanet ?? state.selectedSystem).toUpperCase()}`;
  return `${location} · TURN ${gameState.turn} · YEAR ${gameState.year}`;
}

function setSaveStatus(message) {
  navigationStatus.textContent = `${navigationLabel(strategicMap.state)} · ${message}`;
}

function applyLoadedState(nextState) {
  const activePanelMode = panel.classList.contains('open') ? panel.dataset.mode : null;
  const savedFleets = nextState.fleets;
  Object.assign(gameState, structuredClone(nextState));
  for (const [fleetId, entry] of fleetMarkers) {
    const savedFleet = savedFleets[fleetId];
    if (savedFleet) {
      Object.assign(entry.fleet, savedFleet);
      gameState.fleets[fleetId] = entry.fleet;
    }
  }
  syncGalaxyVisuals();
  if (activePanelMode === 'diplomacy') showDiplomacy();
  else if (selected?.userData.type === 'planet') showPlanet(selected.userData.planetId);
  else if (selected?.userData.type === 'fleet') showFleet(selected.userData.fleetId);
  setSaveStatus(`LOADED TURN ${gameState.turn}`);
}

function saveAutosave() {
  try {
    saveGame(gameState);
    return true;
  } catch (error) {
    setSaveStatus(error instanceof SaveError ? 'AUTOSAVE FAILED — RECOVERY COPY PRESERVED' : 'AUTOSAVE FAILED');
    return false;
  }
}

strategicMap.subscribe((state) => {
  navigationStatus.textContent = navigationLabel(state);
  syncGalaxyVisuals();
});
navigationStatus.textContent = navigationLabel(strategicMap.state);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;

interactionElement.addEventListener('pointerdown', (event) => {
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

interactionElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (travel > 6) return;
  interactionElement.focus({ preventScroll: true });

  const bounds = interactionElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable.filter((object) => object.visible), false)[0];
  if (!hit) return;

  const { type, planetId, systemId, fleetId } = hit.object.userData;
  if (type === 'planet') {
    const position = hit.object.getWorldPosition(new THREE.Vector3());
    showPlanet(planetId);
    strategicMap.selectPlanet(planetId, systemId, position);
  } else if (type === 'system') {
    const record = systemRecords.get(systemId);
    strategicMap.selectSystem(systemId, record.group.position);
    closeInspectionPanel();
    selectionReadout.textContent = `${record.system.name.toUpperCase()} SYSTEM`;
  } else if (type === 'fleet') {
    const record = systemRecords.get(systemId);
    strategicMap.selectSystem(systemId, record.group.position);
    showFleet(fleetId);
  }
});

interactionElement.addEventListener('pointercancel', () => {
  pointerStart = null;
});

closePanel.addEventListener('click', () => closeInspectionPanel());
galaxyViewButton.addEventListener('click', returnToGalaxy);
diplomacyViewButton.addEventListener('click', showDiplomacy);
function advanceTurn() {
  const activePanelMode = panel.classList.contains('open') ? panel.dataset.mode : null;
  const report = simulateTurn(gameState).lastTurnReport;
  const fleetSummary = report.fleetsMoved.length ? ` · ${report.fleetsMoved.length} FLEETS MOVED` : '';
  const offerResolutions = report.diplomacyUpdated
    .map((update) => update.offerResolution)
    .filter(Boolean);
  const acceptedOffers = offerResolutions.filter((resolution) => resolution.accepted);
  const treatyCount = acceptedOffers.filter((resolution) => ['NON_AGGRESSION', 'ALLIANCE'].includes(resolution.treatyType)).length;
  const peaceCount = acceptedOffers.filter((resolution) => resolution.treatyType === 'PEACE').length;
  const vassalageCount = acceptedOffers.filter((resolution) => resolution.treatyType === 'VASSALAGE').length;
  const rejectedCount = offerResolutions.length - acceptedOffers.length;
  const diplomacySummary = [
    treatyCount ? `${treatyCount} TREATY${treatyCount === 1 ? '' : 'IES'} SIGNED` : null,
    peaceCount ? `${peaceCount} PEACE ACCORD${peaceCount === 1 ? '' : 'S'} SIGNED` : null,
    vassalageCount ? `${vassalageCount} VASSALAGE${vassalageCount === 1 ? '' : 'S'} ESTABLISHED` : null,
    rejectedCount ? `${rejectedCount} OFFER${rejectedCount === 1 ? '' : 'S'} REJECTED` : null,
  ].filter(Boolean).map((summary) => ` · ${summary}`).join('');
  navigationStatus.textContent = `${navigationLabel(strategicMap.state)} · ${report.planetsUpdated.length} PLANETS UPDATED${fleetSummary}${diplomacySummary}`;
  syncGalaxyVisuals();
  if (activePanelMode === 'diplomacy') showDiplomacy();
  else if (selected?.userData.type === 'planet') showPlanet(selected.userData.planetId);
  else if (selected?.userData.type === 'fleet') showFleet(selected.userData.fleetId);
  saveAutosave();
}
advanceTurnButton.addEventListener('click', advanceTurn);
saveGameButton.addEventListener('click', () => {
  try {
    saveGame(gameState);
    setSaveStatus(`SAVED TURN ${gameState.turn}`);
  } catch (error) {
    setSaveStatus(error instanceof SaveError ? 'SAVE FAILED — RECOVERY COPY PRESERVED' : 'SAVE FAILED');
  }
});
loadGameButton.addEventListener('click', () => {
  try {
    const loaded = loadGame();
    if (loaded) applyLoadedState(loaded);
    else setSaveStatus('NO USABLE SAVE FOUND');
  } catch (error) {
    setSaveStatus(error instanceof SaveError ? 'LOAD FAILED — STARTING STATE PRESERVED' : 'LOAD FAILED');
  }
});
exportGameButton.addEventListener('click', () => {
  try {
    const blob = new Blob([exportSave(gameState)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `galaxy-command-turn-${gameState.turn}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveStatus('CAMPAIGN EXPORTED');
  } catch (error) {
    setSaveStatus(error instanceof SaveError ? 'EXPORT FAILED' : 'EXPORT FAILED');
  }
});
importGameButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const [file] = importFile.files ?? [];
  if (!file) return;
  try {
    const imported = importSave(await file.text(), 'manual');
    applyLoadedState(imported);
    setSaveStatus(`IMPORTED TURN ${gameState.turn}`);
  } catch (error) {
    setSaveStatus(error instanceof SaveError ? 'IMPORT REJECTED — CURRENT STATE PRESERVED' : 'IMPORT FAILED');
  } finally {
    importFile.value = '';
  }
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') returnToGalaxy();
  if (event.repeat || event.target.matches?.('input, select, textarea')) return;
  if (event.key.toLowerCase() === 'g') returnToGalaxy();
  if (event.key.toLowerCase() === 'n') advanceTurn();
  if (event.key.toLowerCase() === 'd') showDiplomacy();
});

function resize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', resize);
galaxy.systems.forEach(createSystem);
Object.values(gameState.fleets).forEach(createFleetMarker);
renderFilterControls();
syncGalaxyVisuals();
loading.classList.add('hidden');

const clock = new THREE.Clock();
const trackedPosition = new THREE.Vector3();

function animate() {
  if (!renderer) return;
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (!prefersReducedMotion) {
    for (const { mesh } of planetVisuals.values()) {
      mesh.userData.orbitAngle += mesh.userData.orbitSpeed * delta;
      mesh.position.set(
        Math.cos(mesh.userData.orbitAngle) * mesh.userData.orbit,
        0,
        Math.sin(mesh.userData.orbitAngle) * mesh.userData.orbit
      );
      mesh.rotation.y += 0.35 * delta;
    }
  }

  if (strategicMap.state.mode === 'planet') {
    planetVisuals.get(strategicMap.state.selectedPlanet)?.mesh.getWorldPosition(trackedPosition);
    strategicMap.trackPosition(trackedPosition);
  }

  strategicMap.update(prefersReducedMotion ? 1 : undefined);
  controls.update();
  if (!prefersReducedMotion) galaxyBackdrop.update(elapsed);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

animate();
