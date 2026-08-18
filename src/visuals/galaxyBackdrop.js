import * as THREE from 'three';

function randomNormal(random) {
  return (random() + random() + random() + random() - 2) * 0.5;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(226,241,255,.98)');
  gradient.addColorStop(0.26, 'rgba(132,191,255,.48)');
  gradient.addColorStop(0.58, 'rgba(68,120,255,.12)');
  gradient.addColorStop(1, 'rgba(12,20,60,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function createStarField({ random, count, galaxyRadius, disk = false }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    if (disk) {
      const arm = index % 4;
      const progress = Math.pow(random(), 0.64);
      const radius = 2.5 + progress * galaxyRadius;
      const angle = arm * (Math.PI / 2) + progress * Math.PI * 3.1 + randomNormal(random) * 0.22;
      const width = 0.7 + progress * 2.7;
      positions[offset] = Math.cos(angle) * radius + randomNormal(random) * width;
      positions[offset + 1] = randomNormal(random) * (0.22 + progress * 1.1);
      positions[offset + 2] = Math.sin(angle) * radius + randomNormal(random) * width;
      color.setHSL(0.56 + random() * 0.08, 0.38 + random() * 0.28, 0.62 + random() * 0.28);
    } else {
      const radius = galaxyRadius + 30 + random() * 120;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      positions[offset + 1] = radius * Math.cos(phi);
      positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.56 + random() * 0.1, 0.16 + random() * 0.2, 0.56 + random() * 0.3);
    }
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: disk ? 0.16 : 0.12,
    vertexColors: true,
    transparent: true,
    opacity: disk ? 0.86 : 0.56,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
}

function createCore(random) {
  const count = 700;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const radius = Math.pow(random(), 1.75) * 9;
    const angle = random() * Math.PI * 2;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = randomNormal(random) * 0.72;
    positions[offset + 2] = Math.sin(angle) * radius;
    color.setHSL(0.11 + random() * 0.06, 0.58, 0.66 + random() * 0.24);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.24,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
}

export function createGalaxyBackdrop(random) {
  const group = new THREE.Group();
  const glowTexture = makeGlowTexture();
  const disk = createStarField({ random, count: 2600, galaxyRadius: 52, disk: true });
  const core = createCore(random);
  const background = createStarField({ random, count: 1700, galaxyRadius: 52 });
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd59b,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  coreGlow.scale.setScalar(20);
  group.add(background, disk, core, coreGlow);
  group.userData.disk = disk;
  group.userData.core = core;

  return {
    group,
    glowTexture,
    update(elapsed) {
      disk.rotation.y = elapsed * 0.007;
      core.rotation.y = elapsed * 0.012;
      coreGlow.material.opacity = 0.58 + Math.sin(elapsed * 0.65) * 0.08;
    },
  };
}

export function createSystemHalo(glowTexture, color) {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(4.6);
  return halo;
}
