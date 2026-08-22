export function parseCampaignSeed(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : null;
}
