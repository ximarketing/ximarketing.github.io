(function () {
  'use strict';

  var chat = document.querySelector('[data-site-chat]');
  if (!chat) return;

  var launcher = chat.querySelector('.site-chat__launcher');
  var panel = chat.querySelector('.site-chat__panel');
  var closeButton = chat.querySelector('[data-chat-close]');
  var resetButton = chat.querySelector('[data-chat-reset]');
  var messages = chat.querySelector('[data-chat-messages]');
  var suggestions = chat.querySelector('[data-chat-suggestions]');
  var form = chat.querySelector('[data-chat-form]');
  var input = chat.querySelector('[data-chat-input]');
  var sendButton = chat.querySelector('[data-chat-send]');
  var status = chat.querySelector('[data-chat-status]');
  var endpoint = chat.getAttribute('data-chat-endpoint');
  var translationsNode = document.getElementById('site-chat-translations');
  var translations = {};
  var locale = 'en';
  var history = [];
  var requestController = null;
  var requestSequence = 0;

  try { translations = JSON.parse(translationsNode.textContent); } catch (error) { translations = {}; }

  function normalizeLocale(value) {
    var normalized = String(value || '').toLowerCase();
    if (normalized === 'zh-hans' || normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-Hans';
    if (normalized === 'zh-hant' || normalized === 'zh-hk' || normalized === 'zh-tw' || normalized === 'zh-mo') return 'zh-Hant';
    return 'en';
  }

  function storedLocale() {
    try { return window.localStorage.getItem('xi-language'); } catch (error) { return null; }
  }

  function currentLocale() {
    if (window.xiLanguage && typeof window.xiLanguage.getLocale === 'function') {
      return normalizeLocale(window.xiLanguage.getLocale());
    }
    return normalizeLocale(document.documentElement.getAttribute('data-language') || storedLocale() || document.documentElement.lang);
  }

  function dictionary() {
    return translations[locale] || translations.en || {};
  }

  function copy(key) {
    return dictionary()[key] || (translations.en && translations.en[key]) || '';
  }

  function applyCopy(nextLocale) {
    locale = normalizeLocale(nextLocale);
    Array.prototype.forEach.call(chat.querySelectorAll('[data-chat-copy]'), function (element) {
      var value = copy(element.getAttribute('data-chat-copy'));
      if (value) element.textContent = value;
    });
    Array.prototype.forEach.call(chat.querySelectorAll('[data-chat-copy-aria]'), function (element) {
      var value = copy(element.getAttribute('data-chat-copy-aria'));
      if (value) element.setAttribute('aria-label', value);
    });
    Array.prototype.forEach.call(chat.querySelectorAll('[data-chat-copy-placeholder]'), function (element) {
      var value = copy(element.getAttribute('data-chat-copy-placeholder'));
      if (value) element.setAttribute('placeholder', value);
    });
    renderSuggestions();
    if (!history.length) renderGreeting();
  }

  function createMessage(role, text, sourceItems, messageLocale) {
    var article = document.createElement('article');
    article.className = 'site-chat__message site-chat__message--' + role;
    article.setAttribute('lang', normalizeLocale(messageLocale || locale));

    var sender = document.createElement('span');
    sender.className = 'site-chat__sender';
    sender.textContent = copy(role === 'user' ? 'visitor_label' : 'assistant_label');
    article.appendChild(sender);

    var bubble = document.createElement('div');
    bubble.className = 'site-chat__bubble';
    String(text || '').split(/\n{2,}/).forEach(function (paragraphText) {
      if (!paragraphText.trim()) return;
      var paragraph = document.createElement('p');
      paragraph.textContent = paragraphText.trim();
      bubble.appendChild(paragraph);
    });
    article.appendChild(bubble);

    if (role === 'assistant' && Array.isArray(sourceItems) && sourceItems.length) {
      var sourceBlock = document.createElement('div');
      sourceBlock.className = 'site-chat__sources';
      var label = document.createElement('span');
      label.textContent = copy('sources');
      sourceBlock.appendChild(label);
      var list = document.createElement('ul');

      sourceItems.forEach(function (source) {
        if (!source || !source.url || !source.title) return;
        var safeUrl;
        try {
          safeUrl = new URL(source.url, window.location.origin);
          if (safeUrl.protocol !== 'https:' && safeUrl.protocol !== 'http:') return;
        } catch (error) { return; }
        var item = document.createElement('li');
        var link = document.createElement('a');
        link.href = safeUrl.href;
        link.textContent = source.title;
        if (safeUrl.origin !== window.location.origin) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        item.appendChild(link);
        list.appendChild(item);
      });

      if (list.childNodes.length) {
        sourceBlock.appendChild(list);
        article.appendChild(sourceBlock);
      }
    }

    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderGreeting() {
    messages.textContent = '';
    createMessage('assistant', copy('greeting'), [], locale);
  }

  function renderSuggestions() {
    suggestions.textContent = '';
    var items = dictionary().suggestions || (translations.en && translations.en.suggestions) || [];
    items.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-chat__suggestion';
      button.textContent = item.label;
      button.setAttribute('data-prompt', item.prompt);
      button.addEventListener('click', function () {
        input.value = item.prompt;
        resizeInput();
        submitQuestion();
      });
      suggestions.appendChild(button);
    });
    suggestions.hidden = history.length > 0;
  }

  function setBusy(isBusy) {
    input.disabled = isBusy;
    sendButton.disabled = isBusy;
    resetButton.disabled = isBusy;
    status.textContent = isBusy ? copy('sending') : '';
    status.hidden = !isBusy;
    chat.classList.toggle('is-loading', isBusy);
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 112) + 'px';
  }

  function openChat() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    chat.classList.add('is-open');
    window.setTimeout(function () { input.focus(); }, 0);
    document.dispatchEvent(new CustomEvent('xi-chat-open'));
  }

  function closeChat() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    chat.classList.remove('is-open');
    launcher.focus();
    document.dispatchEvent(new CustomEvent('xi-chat-close'));
  }

  function resetChat() {
    requestSequence += 1;
    if (requestController) requestController.abort();
    requestController = null;
    history = [];
    input.value = '';
    resizeInput();
    setBusy(false);
    renderGreeting();
    renderSuggestions();
    input.focus();
  }

  function responseErrorMessage(error) {
    return error && error.name === 'AbortError' ? copy('timeout') : copy('error');
  }

  function submitQuestion() {
    var question = input.value.trim();
    if (!question || input.disabled) return;
    if (question.length > 1000) {
      status.textContent = copy('too_long');
      status.hidden = false;
      return;
    }

    var requestLocale = locale;
    var previousHistory = history.slice(-8);
    createMessage('user', question, [], requestLocale);
    history.push({ role: 'user', content: question });
    suggestions.hidden = true;
    input.value = '';
    resizeInput();
    setBusy(true);

    requestSequence += 1;
    var activeRequest = requestSequence;
    var controller = new AbortController();
    requestController = controller;
    var timeoutId = window.setTimeout(function () { controller.abort(); }, 55000);

    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: question,
        history: previousHistory,
        locale: requestLocale,
        page: { path: window.location.pathname, title: document.title }
      }),
      signal: controller.signal
    }).then(function (response) {
      if (!response.ok) throw new Error('Chat request failed');
      return response.json();
    }).then(function (data) {
      if (activeRequest !== requestSequence) return;
      if (!data || typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('Invalid chat response');
      history.push({ role: 'assistant', content: data.answer.trim() });
      createMessage('assistant', data.answer.trim(), data.sources || [], requestLocale);
      document.dispatchEvent(new CustomEvent('xi-chat-message', { detail: { locale: requestLocale } }));
    }).catch(function (error) {
      if (activeRequest !== requestSequence) return;
      createMessage('assistant', responseErrorMessage(error), [], requestLocale);
    }).then(function () {
      window.clearTimeout(timeoutId);
      if (activeRequest !== requestSequence) return;
      requestController = null;
      setBusy(false);
      input.focus();
    });
  }

  launcher.addEventListener('click', function () {
    if (panel.hidden) openChat();
    else closeChat();
  });
  closeButton.addEventListener('click', closeChat);
  resetButton.addEventListener('click', resetChat);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitQuestion();
  });
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitQuestion();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) closeChat();
  });
  document.addEventListener('xi-language-change', function (event) {
    var nextLocale = normalizeLocale(event.detail && event.detail.locale ? event.detail.locale : currentLocale());
    if (nextLocale !== locale && (history.length || requestController)) resetChat();
    applyCopy(nextLocale);
  });

  locale = currentLocale();
  applyCopy(locale);
  status.hidden = true;

  window.xiChatbot = { open: openChat, close: closeChat, reset: resetChat };
}());
