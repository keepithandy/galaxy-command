import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import galaxyData from './data/galaxy.json';
import './styles/main.css';

const canvas = document.querySelector('#galaxy-canvas');
const loading = document.querySelector('#loading');
const panel = document.querySelector('.planet-panel');
const content = document.querySelector('#planet-content');
const selectionReadout = document.querySelector('#selection-readout');
const closePanel = document.querySelector('#close-panel');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050a);
scene.fog = new THREE.FogExp2(0x03050a, 0.0035);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 18, 36);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 90;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0x667799, 0.7));
const keyLight = new THREE.PointLight(0xffffff, 2.4, 80);
scene.add(keyLight);

const selectable = [];
const systemGroups = [];
let selected = null;

function makeStars(count = 1600) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 90 + Math.random() * 150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xaeb9cc, size: 0.12, transparent: true, opacity: 0.8 });
  scene.add(new THREE.Points(geometry, material));
}

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

function createPlanet(planet, system, factionColor) {
  const geometry = new THREE.SphereGeometry(planet.size, 20, 20);
  const material = new THREE.MeshStandardMaterial({ color: factionColor, roughness: 0.75, metalness: 0.08 });
  const mesh = new THREE.Mesh(geometry, material);
  const angle = Math.random() * Math.PI * 2;
  mesh.position.set(Math.cos(angle) * planet.orbit, 0, Math.sin(angle) * planet.orbit);
  mesh.userData = { planet, system, baseColor: factionColor };
  selectable.push(mesh);
  return mesh;
}

function createSystem(system) {
  const group = new THREE.Group();
  group.position.fromArray(system.position);
  group.userData.system = system;

  const star = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 24, 24),
    new THREE.MeshBasicMaterial({ color: system.starColor })
  );
  group.add(star);

  system.planets.forEach((planet) => {
    const faction = galaxyData.galaxy.factions.find((item) => item.id === planet.faction);
    group.add(createOrbit(planet.orbit));
    group.add(createPlanet(planet, system, faction?.color ?? '#ffffff'));
  });

  systemGroups.push(group);
  scene.add(group);
}

function showPlanet(mesh) {
  if (selected) selected.scale.setScalar(1);
  selected = mesh;
  mesh.scale.setScalar(1.45);
  const { planet, system } = mesh.userData;
  const faction = galaxyData.galaxy.factions.find((item) => item.id === planet.faction);
  selectionReadout.textContent = `${system.name.toUpperCase()} · ${planet.name.toUpperCase()}`;
  content.innerHTML = `
    <div class="planet-title">
      <span class="planet-mark" style="background:${faction?.color ?? '#fff'}"></span>
      <div><p class="eyebrow">PLANETARY INTEL</p><h2>${planet.name}</h2></div>
    </div>
    <div class="intel-row"><span>Faction</span><strong>${faction?.name ?? 'Unknown'}</strong></div>
    <div class="intel-row"><span>Population</span><strong>${planet.population}</strong></div>
    <div class="stat"><span>Industry</span><b>${planet.industry}</b><i><em style="width:${planet.industry}%"></em></i></div>
    <div class="stat"><span>Resources</span><b>${planet.resources}</b><i><em style="width:${planet.resources}%"></em></i></div>
    <div class="stat"><span>Defense</span><b>${planet.defense}</b><i><em style="width:${planet.defense}%"></em></i></div>
    <div class="status-large">${planet.status}</div>
  `;
  panel.classList.add('open');
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable, false)[0];
  if (hit) showPlanet(hit.object);
});

closePanel.addEventListener('click', () => panel.classList.remove('open'));

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', resize);
makeStars();
galaxyData.galaxy.systems.forEach(createSystem);
loading.classList.add('hidden');

function animate() {
  requestAnimationFrame(animate);
  systemGroups.forEach((group) => {
    group.children.forEach((child) => {
      if (child.userData?.planet) {
        child.rotation.y += 0.002;
      }
    });
  });
  controls.update();
  renderer.render(scene, camera);
}

animate();
