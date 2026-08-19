(function () {
  'use strict';

  var root = document.documentElement;
  var picker = document.querySelector('[data-language-switcher]');
  var pickerButton = picker ? picker.querySelector('.language-switcher__button') : null;
  var pickerPanel = picker ? picker.querySelector('.language-switcher__panel') : null;
  var pickerCurrent = picker ? picker.querySelector('[data-language-current]') : null;
  var options = picker ? Array.prototype.slice.call(picker.querySelectorAll('[data-language-option]')) : [];
  var translationsNode = document.getElementById('homepage-translations');
  var homeRoot = document.querySelector('[data-home-language-root]');
  var localizedPageRoot = document.querySelector('[data-localized-page-root]');
  var languageRoot = homeRoot || localizedPageRoot;
  var translations = {};
  var defaultLang = root.getAttribute('data-default-language') || root.getAttribute('lang') || 'en-US';
  var defaultTitle = document.title;
  var defaultMeta = {};
  var currentLocale = 'en';
  var textDefaults = [];
  var attributeDefaults = [];

  function normalizeLocale(value) {
    if (!value) return null;
    var locale = String(value).toLowerCase();
    if (locale === 'en' || locale === 'en-us' || locale === 'en-gb') return 'en';
    if (locale === 'zh-hans' || locale === 'zh-cn' || locale === 'zh-sg' || locale === '简体中文') return 'zh-Hans';
    if (locale === 'zh-hant' || locale === 'zh-hk' || locale === 'zh-tw' || locale === 'zh-mo' || locale === '繁體中文') return 'zh-Hant';
    return null;
  }

  function getStoredLocale() {
    try { return normalizeLocale(window.localStorage.getItem('xi-language')); } catch (error) { return null; }
  }

  function storeLocale(locale) {
    try { window.localStorage.setItem('xi-language', locale); } catch (error) {}
  }

  function getQueryLocale() {
    try { return normalizeLocale(new URL(window.location.href).searchParams.get('lang')); } catch (error) { return null; }
  }

  function readPath(source, path) {
    if (!source || !path) return undefined;
    return path.split('.').reduce(function (value, part) {
      return value === undefined || value === null ? undefined : value[part];
    }, source);
  }

  function localeData(locale) {
    return locale === 'en' ? null : translations[locale];
  }

  function localeValue(locale, path) {
    return readPath(localeData(locale), path);
  }

  function captureDefaults() {
    textDefaults = Array.prototype.map.call(document.querySelectorAll('[data-i18n]'), function (element) {
      return { element: element, value: element.textContent };
    });

    [
      { marker: 'data-i18n-aria-label', attribute: 'aria-label' },
      { marker: 'data-i18n-alt', attribute: 'alt' },
      { marker: 'data-i18n-title', attribute: 'title' }
    ].forEach(function (definition) {
      Array.prototype.forEach.call(document.querySelectorAll('[' + definition.marker + ']'), function (element) {
        attributeDefaults.push({
          element: element,
          marker: definition.marker,
          attribute: definition.attribute,
          value: element.getAttribute(definition.attribute) || ''
        });
      });
    });
  }

  function captureMetaDefaults() {
    ['description', 'twitter:title', 'twitter:description'].forEach(function (name) {
      var element = document.querySelector('meta[name="' + name + '"]');
      if (element) defaultMeta['name:' + name] = element.getAttribute('content') || '';
    });
    ['og:title', 'og:description'].forEach(function (property) {
      var element = document.querySelector('meta[property="' + property + '"]');
      if (element) defaultMeta['property:' + property] = element.getAttribute('content') || '';
    });
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) defaultMeta['property:og:locale'] = ogLocale.getAttribute('content') || '';
  }

  function updateMeta(locale) {
    var data = localeData(locale);
    var metaData = data;
    if (data && localizedPageRoot) {
      metaData = readPath(data, localizedPageRoot.getAttribute('data-language-namespace'));
    }
    var title = metaData && metaData.meta ? metaData.meta.title : defaultTitle;
    var description = metaData && metaData.meta ? metaData.meta.description : defaultMeta['name:description'];

    document.title = title || defaultTitle;

    ['description', 'twitter:description'].forEach(function (name) {
      var element = document.querySelector('meta[name="' + name + '"]');
      if (!element) return;
      element.setAttribute('content', description || defaultMeta['name:' + name] || '');
    });
    ['twitter:title'].forEach(function (name) {
      var element = document.querySelector('meta[name="' + name + '"]');
      if (!element) return;
      element.setAttribute('content', title || defaultMeta['name:' + name] || '');
    });
    ['og:title'].forEach(function (property) {
      var element = document.querySelector('meta[property="' + property + '"]');
      if (!element) return;
      element.setAttribute('content', title || defaultMeta['property:' + property] || '');
    });
    ['og:description'].forEach(function (property) {
      var element = document.querySelector('meta[property="' + property + '"]');
      if (!element) return;
      element.setAttribute('content', description || defaultMeta['property:' + property] || '');
    });
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) {
      var ogLocaleValue = locale === 'zh-Hans' ? 'zh_CN' : locale === 'zh-Hant' ? 'zh_HK' : defaultMeta['property:og:locale'];
      ogLocale.setAttribute('content', ogLocaleValue || 'en_US');
    }
  }

  function updateLanguageUi(locale) {
    var data = localeData(locale);
    var currentLabels = { en: 'EN', 'zh-Hans': '简', 'zh-Hant': '繁' };

    if (pickerCurrent) pickerCurrent.textContent = data && data.language ? data.language.current : currentLabels[locale];

    options.forEach(function (option) {
      var isCurrent = option.getAttribute('data-language-option') === locale;
      if (isCurrent) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
    });
  }

  function updateUrl(locale) {
    if (!window.history || !window.history.replaceState) return;
    try {
      var url = new URL(window.location.href);
      if (locale === 'en') url.searchParams.delete('lang');
      else url.searchParams.set('lang', locale);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (error) {}
  }

  function applyLocale(locale, optionsConfig) {
    var normalized = normalizeLocale(locale) || 'en';
    var data = localeData(normalized);
    var config = optionsConfig || {};

    if (!languageRoot && normalized !== 'en') {
      storeLocale(normalized);
      window.location.href = (options.filter(function (option) {
        return option.getAttribute('data-language-option') === normalized;
      })[0] || {}).href || '/?lang=' + encodeURIComponent(normalized);
      return;
    }

    textDefaults.forEach(function (entry) {
      var translated = data ? readPath(data, entry.element.getAttribute('data-i18n')) : undefined;
      entry.element.textContent = translated === undefined || translated === null ? entry.value : translated;
    });

    attributeDefaults.forEach(function (entry) {
      var translated = data ? readPath(data, entry.element.getAttribute(entry.marker)) : undefined;
      entry.element.setAttribute(entry.attribute, translated === undefined || translated === null ? entry.value : translated);
    });

    currentLocale = normalized;
    root.setAttribute('lang', normalized === 'en' ? defaultLang : normalized);
    root.setAttribute('data-language', normalized);
    if (document.body) document.body.setAttribute('data-language', normalized);

    var chineseName = document.querySelector('.profile-card__name-zh');
    if (chineseName) chineseName.setAttribute('lang', normalized === 'zh-Hant' ? 'zh-Hant' : 'zh-Hans');

    updateMeta(normalized);
    updateLanguageUi(normalized);
    storeLocale(normalized);
    if (config.updateUrl !== false && languageRoot) updateUrl(normalized);

    document.dispatchEvent(new CustomEvent('xi-language-change', { detail: { locale: normalized } }));
    window.setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0);
  }

  function openPicker() {
    if (!pickerButton || !pickerPanel) return;
    pickerPanel.hidden = false;
    pickerButton.setAttribute('aria-expanded', 'true');
  }

  function closePicker(returnFocus) {
    if (!pickerButton || !pickerPanel) return;
    pickerPanel.hidden = true;
    pickerButton.setAttribute('aria-expanded', 'false');
    if (returnFocus) pickerButton.focus();
  }

  function initPicker() {
    if (!picker || !pickerButton || !pickerPanel) return;

    pickerButton.addEventListener('click', function () {
      if (pickerPanel.hidden) openPicker();
      else closePicker(false);
    });

    pickerButton.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      openPicker();
      var targets = pickerPanel.querySelectorAll('a');
      if (targets.length) targets[event.key === 'ArrowUp' ? targets.length - 1 : 0].focus();
    });

    pickerPanel.addEventListener('keydown', function (event) {
      var targets = Array.prototype.slice.call(pickerPanel.querySelectorAll('a'));
      var index = targets.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closePicker(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var direction = event.key === 'ArrowDown' ? 1 : -1;
        targets[(index + direction + targets.length) % targets.length].focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        targets[event.key === 'Home' ? 0 : targets.length - 1].focus();
      }
    });

    options.forEach(function (option) {
      option.addEventListener('click', function (event) {
        var locale = normalizeLocale(option.getAttribute('data-language-option')) || 'en';
        storeLocale(locale);
        if (languageRoot) {
          event.preventDefault();
          applyLocale(locale);
          closePicker(true);
        }
      });
    });

    document.addEventListener('click', function (event) {
      if (!picker.contains(event.target)) closePicker(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !pickerPanel.hidden) closePicker(true);
    });
  }

  function init() {
    if (translationsNode) {
      try { translations = JSON.parse(translationsNode.textContent); } catch (error) { translations = {}; }
    }

    captureDefaults();
    captureMetaDefaults();
    initPicker();

    if (languageRoot) {
      var initialLocale = getQueryLocale() || getStoredLocale() || 'en';
      applyLocale(initialLocale, { updateUrl: true });
    } else {
      currentLocale = 'en';
      root.setAttribute('lang', defaultLang);
      root.setAttribute('data-language', 'en');
      if (document.body) document.body.setAttribute('data-language', 'en');
      updateLanguageUi('en');
    }
  }

  window.xiLanguage = {
    getLocale: function () { return currentLocale; },
    applyLocale: applyLocale
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
