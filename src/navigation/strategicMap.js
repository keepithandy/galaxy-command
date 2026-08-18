export function createStrategicMap({ camera, controls, scene }) {
  const state = { selectedSystem: null, selectedPlanet: null, mode: 'galaxy' };
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener({ ...state }));

  return {
    state,
    selectSystem(systemId) {
      state.selectedSystem = systemId;
      state.selectedPlanet = null;
      state.mode = 'system';
      emit();
    },
    selectPlanet(planetId, systemId) {
      state.selectedSystem = systemId;
      state.selectedPlanet = planetId;
      state.mode = 'planet';
      emit();
    },
    returnToGalaxy() {
      state.selectedSystem = null;
      state.selectedPlanet = null;
      state.mode = 'galaxy';
      emit();
    },
    focusObject(object) {
      if (!object || !camera) return;
      const target = object.position.clone();
      camera.position.set(target.x + 8, target.y + 5, target.z + 8);
      if (controls?.target) controls.target.copy(target);
      if (scene) scene.updateMatrixWorld();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
