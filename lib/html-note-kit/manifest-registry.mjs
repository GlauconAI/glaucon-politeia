const manifestInternals = new WeakMap();

export function registerManifestInternals(manifest, internals) {
  if (manifestInternals.has(manifest)) {
    throw new TypeError("Manifest internals are already registered");
  }
  manifestInternals.set(manifest, internals);
}

export function getManifestInternals(manifest) {
  if (manifest === null || (typeof manifest !== "object" && typeof manifest !== "function")) {
    return undefined;
  }
  return manifestInternals.get(manifest);
}
