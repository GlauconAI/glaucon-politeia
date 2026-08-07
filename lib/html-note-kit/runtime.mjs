export function renderInteractiveRuntime() {
  return `(function () {
  "use strict";
  const root = document.querySelector("[data-artifact-root]");
  const ids = Object.freeze(Array.from(
    document.querySelectorAll('script[type="application/json"][id]'),
    (node) => node.id,
  ));
  const api = Object.freeze({
    root,
    dataIds: () => ids.slice(),
    getData(id) {
      if (!ids.includes(id)) {
        throw new Error("Unknown artifact data block: " + String(id));
      }
      return JSON.parse(document.getElementById(id).textContent);
    },
  });
  Object.defineProperty(window, "__402vArtifact", {
    value: api,
    configurable: false,
    writable: false,
  });
})();`;
}
