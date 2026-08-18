(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var navToggle = document.querySelector('.nav-toggle');
  var hiddenLinks = document.querySelector('#site-nav .hidden-links');
  var labels = {
    en: {
      light: 'Switch to light theme',
      dark: 'Switch to dark theme',
      navOpen: 'Open navigation menu',
      navClose: 'Close navigation menu'
    },
    'zh-Hans': {
      light: '切换至浅色主题',
      dark: '切换至深色主题',
      navOpen: '打开导航菜单',
      navClose: '关闭导航菜单'
    },
    'zh-Hant': {
      light: '切換至淺色主題',
      dark: '切換至深色主題',
      navOpen: '開啟導覽選單',
      navClose: '關閉導覽選單'
    }
  };

  function currentLabels() {
    var locale = root.getAttribute('data-language') || root.getAttribute('lang') || 'en';
    if (locale.indexOf('zh-Hans') === 0) return labels['zh-Hans'];
    if (locale.indexOf('zh-Hant') === 0) return labels['zh-Hant'];
    return labels.en;
  }

  function updateThemeButton(theme) {
    if (!toggle) return;
    var isDark = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? currentLabels().light : currentLabels().dark);
  }

  function updateNavButton() {
    if (!navToggle || !hiddenLinks) return;
    var expanded = !hiddenLinks.classList.contains('hidden');
    navToggle.setAttribute('aria-expanded', String(expanded));
    navToggle.setAttribute('aria-label', expanded ? currentLabels().navClose : currentLabels().navOpen);
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
        updateNavButton();
      }, 0);
    });
  }

  document.addEventListener('xi-language-change', function () {
    updateThemeButton(root.getAttribute('data-theme') || 'light');
    updateNavButton();
  });
}());
