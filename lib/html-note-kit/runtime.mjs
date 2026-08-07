export function renderInteractiveRuntime() {
  return `(function () {
  "use strict";
  const root = document.querySelector("[data-artifact-root]");
  const dataNodes = new Map(Array.from(
    document.querySelectorAll('script[type="application/json"][id]'),
    (node) => [node.id, node],
  ));
  const ids = Object.freeze(Array.from(dataNodes.keys()));
  const api = Object.freeze({
    root,
    dataIds: () => ids.slice(),
    getData(id) {
      if (!dataNodes.has(id)) {
        throw new Error("Unknown artifact data block: " + String(id));
      }
      return JSON.parse(dataNodes.get(id).textContent);
    },
  });
  Object.defineProperty(window, "__402vArtifact", {
    value: api,
    configurable: false,
    writable: false,
  });
})();`;
}
