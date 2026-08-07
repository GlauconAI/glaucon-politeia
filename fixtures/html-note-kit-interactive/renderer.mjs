function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderArtifact({ data, svg }) {
  const projects = data["project-registry"].projects;
  const cards = projects
    .map(
      (project, index) => `
        <article
          class="fixture-project-card"
          data-project-card
          data-project-index="${index}"
          data-project-name="${escapeHtml(project.name)}"
        >
          <p class="fixture-project-category">${escapeHtml(project.category)}</p>
          <h3>${escapeHtml(project.name)}</h3>
          <p>${escapeHtml(project.description)}</p>
        </article>`,
    )
    .join("");

  return {
    navigation: '<a class="fixture-navigation" href="#projects">Projects</a>',
    heroSupplementary: `
      <p class="fixture-summary">
        <strong>${projects.length}</strong> projects rendered from one canonical JSON block.
      </p>`,
    mainSections: `
      <section id="projects" class="fixture-projects" aria-labelledby="projects-heading">
        <div class="fixture-section-heading">
          <div>
            <p class="fixture-kicker">Local registry</p>
            <h2 id="projects-heading">Projects</h2>
          </div>
          <p class="fixture-count"><span id="visible-count" aria-live="polite" aria-atomic="true">${projects.length}</span> visible</p>
        </div>
        <label class="fixture-search-label" for="project-search">Filter projects</label>
        <input
          id="project-search"
          class="fixture-search"
          type="search"
          placeholder="Try memory"
          autocomplete="off"
        >
        <div class="fixture-project-grid">${cards}
        </div>
      </section>`,
    rail: `
      <section class="artifact-rail-panel fixture-system-map" aria-labelledby="system-map-heading">
        <p class="fixture-kicker">Prepared SVG</p>
        <h2 id="system-map-heading">Artifact pipeline</h2>
        ${svg["system-map"].html}
      </section>`,
    footer: '<p class="fixture-footer">Generic interactive fixture · canonical data, local assets, offline runtime.</p>',
  };
}
