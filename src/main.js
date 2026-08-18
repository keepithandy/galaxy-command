import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { createGameState, hydrateGalaxyState } from './core/gameState.js';
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

const galaxy = galaxyData.galaxy;
const gameState = hydrateGalaxyState(createGameState(), galaxy);
const factions = new Map(galaxy.factions.map((faction) => [faction.id, faction]));

const app = document.querySelector('#app');
const canvas = document.querySelector('#galaxy-canvas');
const loading = document.querySelector('#loading');
const panel = document.querySelector('.planet-panel');
const content = document.querySelector('#planet-content');
const selectionReadout = document.querySelector('#selection-readout');
const navigationStatus = document.querySelector('#navigation-status');
const closePanel = document.querySelector('#close-panel');
const galaxyViewButton = document.querySelector('#galaxy-view');
const factionFilters = document.querySelector('#faction-filters');
const gameVersion = document.querySelector('#game-version');

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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'label-layer';
app.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 5;
controls.maxDistance = 115;
controls.target.set(0, 0, 0);

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

function showPlanet(planetId) {
  const visual = planetVisuals.get(planetId);
  const planet = gameState.planets[planetId];
  if (!visual || !planet) return;
  if (selected) selected.scale.setScalar(1);
  selected = visual.mesh;
  selected.scale.setScalar(1.45);
  const faction = factionById(planet.faction);
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
    <div class="status-large">${visual.planet.status}</div>
  `;
  panel.classList.add('open');
}

function showFleet(fleetId) {
  const fleet = gameState.fleets[fleetId];
  const system = galaxy.systems.find((item) => item.id === fleet?.systemId);
  if (!fleet || !system) return;
  const faction = factionById(fleet.faction);
  selectionReadout.textContent = `${system.name.toUpperCase()} · ${fleet.name.toUpperCase()}`;
  content.innerHTML = `
    <div class="planet-title">
      <span class="planet-mark" style="background:${faction.color}"></span>
      <div><p class="eyebrow">FLEET CONTACT</p><h2>${fleet.name}</h2></div>
    </div>
    <div class="intel-row"><span>Faction</span><strong>${faction.name}</strong></div>
    <div class="intel-row"><span>System</span><strong>${system.name}</strong></div>
    <div class="intel-row"><span>Strength</span><strong>${fleet.strength}</strong></div>
    <div class="status-large">${fleet.status}</div>
  `;
  panel.classList.add('open');
}

function syncGalaxyVisuals() {
  const filter = strategicMap.state.factionFilter;
  const focusedSystem = strategicMap.state.selectedSystem;
  const isGalaxyView = strategicMap.state.mode === 'galaxy';
  for (const [planetId, visual] of planetVisuals) {
    const planet = gameState.planets[planetId];
    const matches = filter === 'all' || planet.faction === filter;
    visual.mesh.material.color.set(factionColor(planet.faction, galaxy.factions));
    const inFocusedSystem = visual.system.id === focusedSystem;
    visual.mesh.visible = matches && !isGalaxyView && inFocusedSystem;
    visual.orbit.visible = matches && !isGalaxyView && inFocusedSystem;
  }

  for (const { labelElement, system, territory, star, halo } of systemRecords.values()) {
    const owner = systemFaction(system, gameState.planets);
    const matches = filter === 'all' || owner === filter;
    const isFocused = focusedSystem === system.id;
    territory.material.color.set(factionColor(owner, galaxy.factions));
    territory.material.opacity = isFocused ? 0.2 : (matches ? 0.045 : 0.012);
    territory.visible = !isGalaxyView || matches;
    star.scale.setScalar(isFocused ? 1.55 : 1);
    halo.material.opacity = matches ? (isFocused ? 1 : 0.72) : 0.14;
    halo.scale.setScalar(isFocused ? 6.2 : 4.6);
    setLabelState(labelElement, {
      selected: isFocused,
      faction: owner,
    });
    labelElement.dataset.filtered = String(!matches);
  }

  for (const { fleet, labelElement, marker } of fleetMarkers.values()) {
    const matches = filter === 'all' || fleet.faction === filter;
    marker.visible = matches && !isGalaxyView && fleet.systemId === focusedSystem;
    labelElement.dataset.filtered = String(!matches);
  }

  factionFilters.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.faction === filter));
  });
}

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
  panel.classList.remove('open');
  if (selected) selected.scale.setScalar(1);
  selected = null;
  selectionReadout.textContent = 'NO SYSTEM SELECTED';
}

strategicMap.subscribe((state) => {
  navigationStatus.textContent = state.mode === 'galaxy'
    ? 'GALAXY VIEW'
    : `${state.mode.toUpperCase()} · ${(state.selectedPlanet ?? state.selectedSystem).toUpperCase()}`;
  syncGalaxyVisuals();
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (travel > 6) return;

  const bounds = renderer.domElement.getBoundingClientRect();
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
    panel.classList.remove('open');
    selectionReadout.textContent = `${record.system.name.toUpperCase()} SYSTEM`;
  } else if (type === 'fleet') {
    const record = systemRecords.get(systemId);
    strategicMap.selectSystem(systemId, record.group.position);
    showFleet(fleetId);
  }
});

renderer.domElement.addEventListener('pointercancel', () => {
  pointerStart = null;
});

closePanel.addEventListener('click', () => panel.classList.remove('open'));
galaxyViewButton.addEventListener('click', returnToGalaxy);
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') returnToGalaxy();
});

function resize() {
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
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  for (const { mesh } of planetVisuals.values()) {
    mesh.userData.orbitAngle += mesh.userData.orbitSpeed * delta;
    mesh.position.set(
      Math.cos(mesh.userData.orbitAngle) * mesh.userData.orbit,
      0,
      Math.sin(mesh.userData.orbitAngle) * mesh.userData.orbit
    );
    mesh.rotation.y += 0.35 * delta;
  }

  if (strategicMap.state.mode === 'planet') {
    planetVisuals.get(strategicMap.state.selectedPlanet)?.mesh.getWorldPosition(trackedPosition);
    strategicMap.trackPosition(trackedPosition);
  }

  strategicMap.update();
  controls.update();
  galaxyBackdrop.update(elapsed);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

animate();
