export function createLabel(text, className = 'galaxy-label') {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

export function setLabelState(element, { selected = false, faction = 'neutral' } = {}) {
  element.dataset.selected = String(selected);
  element.dataset.faction = faction;
}
