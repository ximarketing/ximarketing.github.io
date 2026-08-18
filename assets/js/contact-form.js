(function () {
  'use strict';

  var dialog = document.querySelector('[data-site-contact]');
  var courseAlert = document.querySelector('[data-contact-course-alert]');
  var translationsNode = document.getElementById('site-contact-translations');
  var isPage = dialog && dialog.getAttribute('data-contact-mode') === 'page';
  if (!dialog || !courseAlert || !translationsNode || typeof courseAlert.showModal !== 'function') return;
  if (!isPage && typeof dialog.showModal !== 'function') return;

  var endpoint = dialog.getAttribute('data-contact-endpoint');
  var form = dialog.querySelector('[data-contact-form]');
  var successPanel = dialog.querySelector('[data-contact-success]');
  var status = dialog.querySelector('[data-contact-status]');
  var submitButton = dialog.querySelector('[data-contact-submit]');
  var nameInput = form.querySelector('[name="name"]');
  var emailInput = form.querySelector('[name="email"]');
  var topicInput = form.querySelector('[name="topic"]');
  var messageInput = form.querySelector('[name="message"]');
  var courseAlertClose = courseAlert.querySelector('[data-contact-course-alert-close]');
  if (!courseAlertClose) return;
  var attachmentInput = form.querySelector('[data-contact-attachment]');
  var attachmentRemove = form.querySelector('[data-contact-attachment-remove]');
  var attachmentStatus = form.querySelector('[data-contact-attachment-status]');
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
  var attachmentMessageKey = '';
  var courseNoticeAcknowledged = false;
  var maxAttachmentBytes = 2 * 1024 * 1024;

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
    Array.prototype.forEach.call(courseAlert.querySelectorAll('[data-contact-copy]'), function (element) {
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
    if (attachmentMessageKey) attachmentStatus.textContent = copy(attachmentMessageKey);
    dialog.setAttribute('lang', locale === 'en' ? 'en' : locale);
    courseAlert.setAttribute('lang', locale === 'en' ? 'en' : locale);
    updateCourseNotice();
  }

  function setStatus(message, state) {
    status.textContent = message || '';
    status.hidden = !message;
    if (state) status.setAttribute('data-state', state);
    else status.removeAttribute('data-state');
  }

  function updateCourseNotice() {
    var isCourse = topicInput.value === 'course';
    if (!isCourse && courseAlert.open) courseAlert.close();
    if (!isCourse || courseNoticeAcknowledged || (!isPage && !dialog.open) || courseAlert.open) return;
    courseAlert.showModal();
    window.requestAnimationFrame(function () { courseAlertClose.focus(); });
  }

  function dismissCourseAlert() {
    courseNoticeAcknowledged = true;
    if (courseAlert.open) courseAlert.close();
    if (typeof topicInput.focus === 'function') topicInput.focus();
  }

  function setAttachmentStatus(message, state, messageKey) {
    attachmentMessageKey = messageKey || '';
    attachmentStatus.textContent = message || '';
    attachmentStatus.hidden = !message;
    if (state) attachmentStatus.setAttribute('data-state', state);
    else attachmentStatus.removeAttribute('data-state');
    if (state === 'error') {
      attachmentInput.setAttribute('aria-invalid', 'true');
      attachmentInput.setAttribute('aria-errormessage', 'site-contact-attachment-status');
    } else {
      attachmentInput.removeAttribute('aria-invalid');
      attachmentInput.removeAttribute('aria-errormessage');
    }
  }

  function attachmentError(file) {
    if (!file) return '';
    if (file.size <= 0) return 'attachment_invalid';
    if (file.size > maxAttachmentBytes) return 'attachment_too_large';
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name || '')) return 'attachment_invalid';
    return '';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
  }

  function updateAttachmentSelection() {
    var file = attachmentInput.files && attachmentInput.files[0];
    attachmentRemove.hidden = !file;
    if (!file) {
      setAttachmentStatus('', '', '');
      return true;
    }
    var errorKey = attachmentError(file);
    if (errorKey) {
      setAttachmentStatus(copy(errorKey), 'error', errorKey);
      return false;
    }
    setAttachmentStatus(file.name + ' · ' + formatFileSize(file.size), 'ready', '');
    return true;
  }

  function readAttachment(file, signal) {
    if (!file) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      var settled = false;
      function cleanup() {
        if (signal) signal.removeEventListener('abort', handleAbort);
      }
      function finish(callback, value) {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      }
      function handleAbort() {
        if (settled) return;
        if (reader.readyState === 1) reader.abort();
        var abortError = new Error('Attachment read aborted');
        abortError.name = 'AbortError';
        finish(reject, abortError);
      }
      reader.onload = function () {
        var result = typeof reader.result === 'string' ? reader.result : '';
        var comma = result.indexOf(',');
        if (comma < 0 || !result.slice(comma + 1)) {
          var invalidError = new Error('Invalid attachment');
          invalidError.code = 'attachment_read_error';
          finish(reject, invalidError);
          return;
        }
        finish(resolve, { filename: file.name, content: result.slice(comma + 1) });
      };
      reader.onerror = function () {
        var readError = new Error('Attachment read failed');
        readError.code = 'attachment_read_error';
        finish(reject, readError);
      };
      reader.onabort = handleAbort;
      if (signal && signal.aborted) {
        handleAbort();
        return;
      }
      if (signal) signal.addEventListener('abort', handleAbort, { once: true });
      reader.readAsDataURL(file);
    });
  }

  function resetView() {
    requestSequence += 1;
    if (requestController) requestController.abort();
    requestController = null;
    courseNoticeAcknowledged = false;
    if (courseAlert.open) courseAlert.close();
    form.reset();
    updateCourseNotice();
    updateAttachmentSelection();
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
    if (isPage) {
      dialog.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(function () { nameInput.focus(); });
      return;
    }
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
    if (isPage) {
      window.location.href = '/';
      return;
    }
    if (!dialog.open) return;
    requestSequence += 1;
    if (requestController) requestController.abort();
    requestController = null;
    if (courseAlert.open) courseAlert.close();
    courseNoticeAcknowledged = false;
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
    attachmentRemove.disabled = isBusy;
    submitButton.textContent = isBusy ? copy('sending') : copy('send');
  }

  function errorMessage(code) {
    if (code === 'submission_too_fast') return copy('too_fast');
    if (code === 'rate_limited' || code === 'daily_limit_reached') return copy('rate_limited');
    if (code === 'attachment_too_large' || code === 'request_too_large') return copy('attachment_too_large');
    if (code === 'invalid_attachment' || code === 'attachment_type_not_allowed') return copy('attachment_invalid');
    if (code === 'attachment_read_error') return copy('attachment_read_error');
    if (code === 'invalid_request' || code === 'invalid_name' || code === 'invalid_email' || code === 'invalid_message') return copy('invalid');
    return copy('unavailable');
  }

  function refreshRequestId() {
    requestId = newRequestId();
  }

  function submitContact() {
    if (!form.reportValidity() || requestController) return;
    if (!updateAttachmentSelection()) return;
    var attachmentFile = attachmentInput.files && attachmentInput.files[0];
    var controller = new AbortController();
    requestSequence += 1;
    var activeRequest = requestSequence;
    var timeoutId = window.setTimeout(function () { controller.abort(); }, 35000);
    requestController = controller;
    setStatus('', '');
    setBusy(true);

    readAttachment(attachmentFile, controller.signal).then(function (attachment) {
      if (activeRequest !== requestSequence || requestController !== controller) return null;
      var payload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        topic: form.elements.topic.value,
        message: messageInput.value.trim(),
        website: form.elements.website.value,
        elapsed_ms: Date.now() - openedAt,
        request_id: requestId,
        locale: locale,
        page: { path: window.location.pathname, title: document.title }
      };
      if (attachment) payload.attachment = attachment;
      return fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }).then(function (response) {
      if (!response) return null;
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
      if (data === null) return;
      if (!data || data.ok !== true) throw new Error('Invalid contact response');
      form.hidden = true;
      successPanel.hidden = false;
      dialog.setAttribute('aria-labelledby', 'site-contact-success-title');
      successPanel.querySelector('[data-contact-success-heading]').focus();
      document.dispatchEvent(new CustomEvent('xi-contact-sent', { detail: { locale: locale } }));
    }).catch(function (error) {
      if (activeRequest !== requestSequence || requestController !== controller) return;
      if (error.code === 'idempotency_conflict') refreshRequestId();
      var message = errorMessage(error.code);
      if (error.code && error.code.indexOf('attachment') !== -1) {
        var messageKey = error.code === 'attachment_too_large' ? 'attachment_too_large' :
          (error.code === 'attachment_read_error' ? 'attachment_read_error' : 'attachment_invalid');
        setAttachmentStatus(message, 'error', messageKey);
      } else {
        setStatus(message, 'error');
      }
    }).then(function () {
      window.clearTimeout(timeoutId);
      if (activeRequest !== requestSequence || requestController !== controller) return;
      requestController = null;
      setBusy(false);
    });
  }

  if (!isPage) {
    triggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        openContact(trigger);
      });
    });
  }

  closeButtons.forEach(function (button) {
    button.addEventListener('click', function () { closeContact(true); });
  });

  if (!isPage) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) closeContact(true);
    });
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeContact(true);
    });
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitContact();
  });
  form.addEventListener('input', refreshRequestId);
  form.addEventListener('change', refreshRequestId);
  topicInput.addEventListener('change', function () {
    courseNoticeAcknowledged = false;
    updateCourseNotice();
  });
  courseAlertClose.addEventListener('click', dismissCourseAlert);
  courseAlert.addEventListener('click', function (event) {
    if (event.target === courseAlert) dismissCourseAlert();
  });
  courseAlert.addEventListener('cancel', function (event) {
    event.preventDefault();
    dismissCourseAlert();
  });
  attachmentInput.addEventListener('change', updateAttachmentSelection);
  attachmentRemove.addEventListener('click', function () {
    attachmentInput.value = '';
    updateAttachmentSelection();
    refreshRequestId();
    attachmentInput.focus();
  });
  document.addEventListener('xi-language-change', function (event) {
    applyCopy(event.detail && event.detail.locale ? event.detail.locale : currentLocale());
  });
  if (!isPage) document.addEventListener('xi-chat-open', function () { closeContact(false); });

  applyCopy(currentLocale());
  if (isPage) resetView();
  window.xiContactForm = { open: openContact, close: closeContact };
}());
