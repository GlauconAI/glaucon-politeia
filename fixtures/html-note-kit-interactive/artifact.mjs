const artifact = {
  contractVersion: 1,
  mode: "interactive",
  rootDirectory: ".",
  metadata: {
    title: "Interactive Project Index",
    description: "A generic offline fixture for canonical data and local interactions.",
    eyebrow: "402v Artifact Fixture",
    lang: "en",
  },
  dataBlocks: [
    { id: "project-registry", source: "./data/projects.json" },
  ],
  renderer: "./renderer.mjs",
  styles: ["./artifact.css"],
  scripts: ["./artifact.js"],
  svgAssets: [
    {
      id: "system-map",
      source: "./system-map.svg",
      title: "Generic project system map",
      description: "Three project nodes connected through a shared local artifact.",
    },
  ],
  requiredDataBlocks: ["project-registry"],
};

export default artifact;
