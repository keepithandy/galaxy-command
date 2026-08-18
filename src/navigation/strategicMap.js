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
  let transitioning = false;
  const emit = () => listeners.forEach((listener) => listener({ ...state }));

  function setFocus(position, distance = 12, height = 5) {
    if (!position || !desiredCameraPosition || !desiredTarget) return;
    desiredTarget.copy(position);
    desiredCameraPosition.set(position.x + distance, position.y + height, position.z + distance);
    transitioning = true;
    if (scene) scene.updateMatrixWorld();
  }

  return {
    state,
    selectSystem(systemId, position) {
      state.selectedSystem = systemId;
      state.selectedPlanet = null;
      state.mode = 'system';
      setFocus(position, 10, 6);
      emit();
    },
    selectPlanet(planetId, systemId, position) {
      state.selectedSystem = systemId;
      state.selectedPlanet = planetId;
      state.mode = 'planet';
      setFocus(position, 4.5, 2.5);
      emit();
    },
    returnToGalaxy() {
      state.selectedSystem = null;
      state.selectedPlanet = null;
      state.mode = 'galaxy';
      if (initialCameraPosition && desiredCameraPosition) desiredCameraPosition.copy(initialCameraPosition);
      if (initialTarget && desiredTarget) desiredTarget.copy(initialTarget);
      transitioning = true;
      emit();
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
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
