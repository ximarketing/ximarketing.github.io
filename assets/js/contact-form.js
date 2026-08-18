(function () {
  'use strict';

  var dialog = document.querySelector('[data-site-contact]');
  var translationsNode = document.getElementById('site-contact-translations');
  if (!dialog || !translationsNode || typeof dialog.showModal !== 'function') return;

  var endpoint = dialog.getAttribute('data-contact-endpoint');
  var form = dialog.querySelector('[data-contact-form]');
  var successPanel = dialog.querySelector('[data-contact-success]');
  var status = dialog.querySelector('[data-contact-status]');
  var submitButton = dialog.querySelector('[data-contact-submit]');
  var nameInput = form.querySelector('[name="name"]');
  var emailInput = form.querySelector('[name="email"]');
  var messageInput = form.querySelector('[name="message"]');
  var editableFields = Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'));
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-contact-open]'));
  var closeButtons = Array.prototype.slice.call(dialog.querySelectorAll('[data-contact-close]'));
  var translations = {};
  var locale = 'en';
  var openedAt = 0;
  var previousFocus = null;
  var requestController = null;
  var requestId = '';
  var requestSequence = 0;

  try { translations = JSON.parse(translationsNode.textContent || '{}'); } catch (error) { return; }

  function normalizeLocale(value) {
    var normalized = String(value || '').toLowerCase();
    if (normalized === 'zh-hans' || normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh-Hans';
    if (normalized === 'zh-hant' || normalized === 'zh-hk' || normalized === 'zh-tw' || normalized === 'zh-mo') return 'zh-Hant';
    return 'en';
  }

  function currentLocale() {
    if (window.xiLanguage && typeof window.xiLanguage.getLocale === 'function') {
      return normalizeLocale(window.xiLanguage.getLocale());
    }
    return normalizeLocale(document.documentElement.getAttribute('data-language') || document.documentElement.lang);
  }

  function copy(key) {
    var selected = translations[locale] || translations.en || {};
    return selected[key] || (translations.en && translations.en[key]) || '';
  }

  function newRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      var random = Math.floor(Math.random() * 16);
      var value = character === 'x' ? random : (random & 3) | 8;
      return value.toString(16);
    });
  }

  function applyCopy(nextLocale) {
    locale = normalizeLocale(nextLocale);
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-contact-copy]'), function (element) {
      if (element === submitButton && form.getAttribute('aria-busy') === 'true') return;
      var value = copy(element.getAttribute('data-contact-copy'));
      if (value) element.textContent = value;
    });
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-contact-copy-placeholder]'), function (element) {
      var value = copy(element.getAttribute('data-contact-copy-placeholder'));
      if (value) element.setAttribute('placeholder', value);
    });
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-contact-copy-aria]'), function (element) {
      var value = copy(element.getAttribute('data-contact-copy-aria'));
      if (value) element.setAttribute('aria-label', value);
    });
    dialog.setAttribute('lang', locale === 'en' ? 'en' : locale);
  }

  function setStatus(message, state) {
    status.textContent = message || '';
    status.hidden = !message;
    if (state) status.setAttribute('data-state', state);
    else status.removeAttribute('data-state');
  }

  function resetView() {
    requestSequence += 1;
    if (requestController) requestController.abort();
    requestController = null;
    form.reset();
    form.hidden = false;
    form.removeAttribute('aria-busy');
    successPanel.hidden = true;
    editableFields.forEach(function (field) { field.disabled = false; });
    submitButton.disabled = false;
    submitButton.textContent = copy('send');
    setStatus('', '');
    dialog.setAttribute('aria-labelledby', 'site-contact-title');
    openedAt = Date.now();
    requestId = newRequestId();
  }

  function openContact(trigger) {
    if (window.xiChatbot && typeof window.xiChatbot.close === 'function') window.xiChatbot.close();
    if (!dialog.open) {
      previousFocus = trigger || document.activeElement;
      resetView();
      dialog.showModal();
      document.body.classList.add('contact-dialog-open');
      window.requestAnimationFrame(function () { nameInput.focus(); });
      document.dispatchEvent(new CustomEvent('xi-contact-open'));
    }
  }

  function closeContact(restoreFocus) {
    if (!dialog.open) return;
    requestSequence += 1;
    if (requestController) requestController.abort();
    requestController = null;
    dialog.close();
    document.body.classList.remove('contact-dialog-open');
    if (restoreFocus !== false && previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null;
    document.dispatchEvent(new CustomEvent('xi-contact-close'));
  }

  function setBusy(isBusy) {
    form.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    editableFields.forEach(function (field) { field.disabled = isBusy; });
    submitButton.disabled = isBusy;
    submitButton.textContent = isBusy ? copy('sending') : copy('send');
  }

  function errorMessage(code) {
    if (code === 'submission_too_fast') return copy('too_fast');
    if (code === 'rate_limited' || code === 'daily_limit_reached') return copy('rate_limited');
    if (code === 'invalid_request' || code === 'invalid_name' || code === 'invalid_email' || code === 'invalid_message') return copy('invalid');
    return copy('unavailable');
  }

  function refreshRequestId() {
    requestId = newRequestId();
  }

  function submitContact() {
    if (!form.reportValidity() || requestController) return;
    var controller = new AbortController();
    requestSequence += 1;
    var activeRequest = requestSequence;
    var timeoutId = window.setTimeout(function () { controller.abort(); }, 20000);
    requestController = controller;
    setStatus('', '');
    setBusy(true);

    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        topic: form.elements.topic.value,
        message: messageInput.value.trim(),
        website: form.elements.website.value,
        elapsed_ms: Date.now() - openedAt,
        request_id: requestId,
        locale: locale,
        page: { path: window.location.pathname, title: document.title }
      }),
      signal: controller.signal
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var requestError = new Error('Contact request failed');
          requestError.code = data && data.error;
          throw requestError;
        }
        return data;
      });
    }).then(function (data) {
      if (activeRequest !== requestSequence || requestController !== controller) return;
      if (!data || data.ok !== true) throw new Error('Invalid contact response');
      form.hidden = true;
      successPanel.hidden = false;
      dialog.setAttribute('aria-labelledby', 'site-contact-success-title');
      successPanel.querySelector('[data-contact-success-heading]').focus();
      document.dispatchEvent(new CustomEvent('xi-contact-sent', { detail: { locale: locale } }));
    }).catch(function (error) {
      if (activeRequest !== requestSequence || requestController !== controller) return;
      if (error.code === 'idempotency_conflict') refreshRequestId();
      setStatus(errorMessage(error.code), 'error');
    }).then(function () {
      window.clearTimeout(timeoutId);
      if (activeRequest !== requestSequence || requestController !== controller) return;
      requestController = null;
      setBusy(false);
    });
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      openContact(trigger);
    });
  });

  closeButtons.forEach(function (button) {
    button.addEventListener('click', function () { closeContact(true); });
  });

  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) closeContact(true);
  });
  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    closeContact(true);
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitContact();
  });
  form.addEventListener('input', refreshRequestId);
  form.addEventListener('change', refreshRequestId);
  document.addEventListener('xi-language-change', function (event) {
    applyCopy(event.detail && event.detail.locale ? event.detail.locale : currentLocale());
  });
  document.addEventListener('xi-chat-open', function () { closeContact(false); });

  applyCopy(currentLocale());
  window.xiContactForm = { open: openContact, close: closeContact };
}());
