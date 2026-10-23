// katharsis.js: the theme toggle every Katharsis page shares. The page loads
// it in <head>, before the body draws, so a stored choice applies without a
// flash of the other theme. With no stored choice the page follows the OS
// setting through katharsis.css. scripts/katharsis-artifact.sh copies this
// file beside the pages on every page write.
(function () {
  var KEY = 'katharsis-theme';
  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // Storage can be blocked for file:// pages or in a private window.
  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) {}
  }
  function current() {
    var chosen = root.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return dark && dark.matches ? 'dark' : 'light';
  }

  var choice = stored();
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-k-toggle]');
    if (!button) return;
    function label() {
      var next = current() === 'dark' ? 'light' : 'dark';
      button.textContent = next === 'dark' ? 'Dark' : 'Light';
      button.setAttribute('aria-label', 'Use the ' + next + ' theme');
    }
    button.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store(next);
      label();
    });
    if (dark && dark.addEventListener) dark.addEventListener('change', label);
    label();
  });
})();
