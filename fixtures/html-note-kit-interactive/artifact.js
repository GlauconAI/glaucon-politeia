(() => {
  const registry = window.__402vArtifact.getData("project-registry");
  const projects = Array.isArray(registry.projects) ? registry.projects : [];
  const input = document.querySelector("#project-search");
  const count = document.querySelector("#visible-count");
  const cards = [...document.querySelectorAll("[data-project-card]")];

  const update = () => {
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;

    for (const card of cards) {
      const index = Number.parseInt(card.dataset.projectIndex, 10);
      const project = projects[index];
      const searchable = project
        ? [project.name, project.category, project.description]
            .join(" ")
            .toLocaleLowerCase()
        : "";
      const matches = searchable.includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    }

    count.textContent = String(visible);
  };

  input.addEventListener("input", update);
  update();
})();
