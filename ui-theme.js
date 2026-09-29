/* Presentation only: theme choice is not saved or sent anywhere. */
(() => {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const setTheme = dark => {
    document.documentElement.classList.toggle('theme-dark', dark);
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  };
  setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  toggle.addEventListener('click', () => setTheme(!document.documentElement.classList.contains('theme-dark')));
})();
