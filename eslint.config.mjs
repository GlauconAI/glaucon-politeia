import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      ".worktrees/**",
      "coverage/**",
      "node_modules/**",
      "dist/**",
      "out/**",
    ],
  },
];

export default eslintConfig;
