export function createStrategicMap({ camera, controls, scene }) {
  const state = {
    selectedSystem: null,
    selectedPlanet: null,
    factionFilter: 'all',
    mode: 'galaxy',
  };
  const listeners = new Set();
  const initialCameraPosition = camera?.position?.clone?.() ?? null;
  const initialTarget = controls?.target?.clone?.() ?? null;
  const desiredCameraPosition = initialCameraPosition?.clone?.() ?? null;
  const desiredTarget = initialTarget?.clone?.() ?? null;
  const cameraBookmarks = new Map();
  const systemPositions = new Map();
  let transitioning = false;
  const emit = () => listeners.forEach((listener) => listener({ ...state }));

  function snapshotCamera() {
    if (!camera?.position?.clone || !controls?.target?.clone) return null;
    if (transitioning && desiredCameraPosition && desiredTarget) {
      return {
        position: desiredCameraPosition.clone(),
        target: desiredTarget.clone(),
      };
    }
    return {
      position: camera.position.clone(),
      target: controls.target.clone(),
    };
  }

  function rememberCamera(key) {
    const snapshot = snapshotCamera();
    if (snapshot) cameraBookmarks.set(key, snapshot);
  }

  function restoreCamera(key) {
    const snapshot = cameraBookmarks.get(key);
    if (!snapshot || !desiredCameraPosition || !desiredTarget) return false;
    desiredCameraPosition.copy(snapshot.position);
    desiredTarget.copy(snapshot.target);
    transitioning = true;
    return true;
  }

  const initialSnapshot = snapshotCamera();
  if (initialSnapshot) cameraBookmarks.set('galaxy', initialSnapshot);

  function setFocus(position, distance = 12, height = 5) {
    if (!position || !desiredCameraPosition || !desiredTarget) return;
    desiredTarget.copy(position);
    desiredCameraPosition.set(position.x + distance, position.y + height, position.z + distance);
    transitioning = true;
    if (scene) scene.updateMatrixWorld();
  }

  const map = {
    state,
    selectSystem(systemId, position) {
      if (!systemId || !position) return false;
      if (state.mode === 'galaxy') rememberCamera('galaxy');
      else if (state.mode === 'system' && state.selectedSystem) {
        rememberCamera(`system:${state.selectedSystem}`);
      }
      systemPositions.set(systemId, position.clone?.() ?? position);
      state.selectedSystem = systemId;
      state.selectedPlanet = null;
      state.mode = 'system';
      setFocus(position, 10, 6);
      if (desiredCameraPosition && desiredTarget) {
        cameraBookmarks.set(`system:${systemId}`, {
          position: desiredCameraPosition.clone(),
          target: desiredTarget.clone(),
        });
      }
      emit();
      return true;
    },
    selectPlanet(planetId, systemId, position) {
      if (!planetId || !systemId || !position) return false;
      if (state.mode === 'system' && state.selectedSystem === systemId) {
        rememberCamera(`system:${systemId}`);
      }
      state.selectedSystem = systemId;
      state.selectedPlanet = planetId;
      state.mode = 'planet';
      setFocus(position, 4.5, 2.5);
      emit();
      return true;
    },
    returnToSystem() {
      if (!state.selectedSystem) return false;
      const systemId = state.selectedSystem;
      state.selectedPlanet = null;
      state.mode = 'system';
      if (!restoreCamera(`system:${systemId}`)) {
        setFocus(systemPositions.get(systemId), 10, 6);
      }
      emit();
      return true;
    },
    returnToGalaxy() {
      state.selectedSystem = null;
      state.selectedPlanet = null;
      state.mode = 'galaxy';
      if (!restoreCamera('galaxy')) {
        if (initialCameraPosition && desiredCameraPosition) desiredCameraPosition.copy(initialCameraPosition);
        if (initialTarget && desiredTarget) desiredTarget.copy(initialTarget);
        transitioning = true;
      }
      emit();
    },
    back() {
      if (state.mode === 'planet') return map.returnToSystem();
      if (state.mode === 'system') {
        map.returnToGalaxy();
        return true;
      }
      return false;
    },
    setFactionFilter(factionId = 'all') {
      state.factionFilter = factionId;
      emit();
    },
    trackPosition(position) {
      if (!position || !desiredTarget || !desiredCameraPosition || state.mode !== 'planet') return;
      const x = position.x - desiredTarget.x;
      const y = position.y - desiredTarget.y;
      const z = position.z - desiredTarget.z;
      desiredTarget.copy(position);
      desiredCameraPosition.set(
        desiredCameraPosition.x + x,
        desiredCameraPosition.y + y,
        desiredCameraPosition.z + z
      );
      transitioning = true;
    },
    update(smoothing = 0.085) {
      if (!transitioning || !camera || !controls || !desiredCameraPosition || !desiredTarget) return;
      camera.position.lerp(desiredCameraPosition, smoothing);
      controls.target.lerp(desiredTarget, smoothing);
      if (camera.position.distanceTo(desiredCameraPosition) < 0.02
        && controls.target.distanceTo(desiredTarget) < 0.02) {
        transitioning = false;
      }
    },
    cancelTransition() {
      transitioning = false;
    },
    getCameraBookmark(key) {
      const snapshot = cameraBookmarks.get(key);
      return snapshot
        ? { position: snapshot.position.clone(), target: snapshot.target.clone() }
        : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return map;
}
