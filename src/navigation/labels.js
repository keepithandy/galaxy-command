export function createLabel(text, className = 'galaxy-label') {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

export function setLabelState(element, { selected = false, hovered = false, faction = 'neutral' } = {}) {
  element.dataset.selected = String(selected);
  element.dataset.hovered = String(hovered);
  element.dataset.faction = faction;
}
