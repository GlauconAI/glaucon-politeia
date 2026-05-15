export const themeStorageKey = "glaucon-theme";

export const themeInitScript = `
(function() {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('glaucon-theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : prefersDark ? 'dark' : 'light';
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  } catch (_) {}
})();
`;
