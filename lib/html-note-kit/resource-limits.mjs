export const ARTIFACT_RESOURCE_LIMITS = Object.freeze({
  dataBlocks: 32,
  styles: 16,
  scripts: 16,
  svgAssets: 16,
  rawJsonBytes: 32 * 1024 * 1024,
  canonicalJsonNodes: 250_000,
  stylesheetBytes: 8 * 1024 * 1024,
  scriptBytes: 8 * 1024 * 1024,
  svgBytes: 20 * 1024 * 1024,
});

export function countCanonicalJsonNodes(value, limit = Number.MAX_SAFE_INTEGER) {
  const pending = [value];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    count += 1;
    if (count > limit) return count;
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        pending.push(current[index]);
      }
      continue;
    }
    for (const key of Object.keys(current)) pending.push(current[key]);
  }
  return count;
}
