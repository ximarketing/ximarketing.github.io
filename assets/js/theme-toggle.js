(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var navToggle = document.querySelector('.nav-toggle');
  var hiddenLinks = document.querySelector('#site-nav .hidden-links');

  function updateThemeButton(theme) {
    if (!toggle) return;
    var isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('xi-theme', theme); } catch (error) {}
    updateThemeButton(theme);
  }

  updateThemeButton(root.getAttribute('data-theme') || 'light');

  if (toggle) {
    toggle.addEventListener('click', function () {
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  if (navToggle && hiddenLinks) {
    navToggle.addEventListener('click', function () {
      window.setTimeout(function () {
        var expanded = !hiddenLinks.classList.contains('hidden');
        navToggle.setAttribute('aria-expanded', String(expanded));
        navToggle.setAttribute('aria-label', expanded ? 'Close navigation menu' : 'Open navigation menu');
      }, 0);
    });
  }
}());
