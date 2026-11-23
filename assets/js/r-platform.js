const workspace = document.getElementById('r-workspace');
const code = document.getElementById('r-code');
const run = document.getElementById('r-run');
const reset = document.getElementById('r-reset');
const status = document.getElementById('r-status');
const output = document.getElementById('r-output');
const plots = document.getElementById('r-plots');
const emptyPlots = document.getElementById('r-plots-empty');
const highlight = document.getElementById('r-code-highlight');
const lineNumbers = document.getElementById('r-code-lines');
const lineCount = document.getElementById('r-line-count');
const packageOpen = document.getElementById('r-package-open');
const packageDialog = document.getElementById('r-package-dialog');
const packageForm = document.getElementById('r-package-form');
const packageInput = document.getElementById('r-package-name');
const packageSubmit = document.getElementById('r-package-submit');
const packageClose = document.getElementById('r-package-close');
const packageStatus = document.getElementById('r-package-status');
const packageDetails = document.getElementById('r-package-details');
const moduleUrl = new URL(import.meta.url);
const runnerUrl = new URL('../r-platform/runner.html', moduleUrl);
runnerUrl.search = moduleUrl.search;
const translations = JSON.parse(document.getElementById('homepage-translations').textContent);
const english = {
  ready: 'Enter R code and select Run code.',
  empty_code: 'Enter R code to run.',
  loading: 'Loading R. The first run may take a moment.',
  running: 'Running R code…',
  done: 'Run complete.',
  r_error: 'R reported an error. See the console output.',
  unavailable: 'Could not run R. Check your connection and try again.',
  reset_done: 'Editor and R session cleared.',
  output_empty: 'Console output will appear here.',
  output_none: 'No console output.',
  no_plots: 'Plots will appear here.',
  plot_label: 'Plot',
  line_count_one: '{count} line',
  line_count_other: '{count} lines',
  package_invalid: 'Enter one package name using letters, numbers, or periods. For example, ggplot2.',
  package_loading: 'Loading R before installing {name}…',
  package_installing: 'Installing {name}…',
  package_installed: '{name} is ready. Use library({name}) in your code.',
  package_failed: 'Could not install {name}.',
  package_no_details: 'The installer did not return any details.',
  package_startup_timeout: 'The R environment did not load in time. Try again.',
};

let frame;
let startupTimer;
let activeRequest;
let packageFeedback;
let statusKey = 'ready';
let outputKey = 'output_empty';
let numberOfLines;

function label(key) {
  return translations[document.documentElement.lang]?.r_platform?.[key] ?? english[key];
}

function renderLineCount() {
  const key = numberOfLines === 1 ? 'line_count_one' : 'line_count_other';
  lineCount.textContent = label(key).replace('{count}', numberOfLines);
}

function installingPackage() {
  return activeRequest?.type === 'r-platform:install-package';
}

function renderLabels() {
  const packageMessage = packageFeedback
    ? label(packageFeedback.key).replaceAll('{name}', packageFeedback.name)
    : '';
  packageStatus.textContent = packageMessage;
  packageDetails.hidden = packageFeedback?.key !== 'package_failed';
  packageDetails.textContent = packageDetails.hidden
    ? ''
    : packageFeedback.details || label('package_no_details');
  status.textContent = installingPackage() ? packageMessage : label(statusKey);
  if (outputKey) output.textContent = label(outputKey);
  emptyPlots.textContent = label('no_plots');
  plots.querySelectorAll('canvas').forEach((canvas, index) => {
    canvas.setAttribute('aria-label', `${label('plot_label')} ${index + 1}`);
  });
  renderLineCount();
}

function setStatus(key) {
  statusKey = key;
  renderLabels();
}

function showOutput(text, placeholder) {
  outputKey = text ? null : placeholder;
  output.textContent = text || label(outputKey);
}

function renderPlots(images) {
  const figures = images.map((image) => {
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.setAttribute('role', 'img');
    canvas.getContext('2d').drawImage(image, 0, 0);
    figure.append(canvas);
    return figure;
  });
  plots.replaceChildren(...(figures.length ? figures : [emptyPlots]));
}

function updateControls() {
  run.disabled = Boolean(activeRequest);
  packageOpen.disabled = activeRequest?.type === 'r-platform:run';
  packageSubmit.disabled = Boolean(activeRequest);
  packageInput.disabled = installingPackage();
}

function finish() {
  window.clearTimeout(startupTimer);
  activeRequest = undefined;
  updateControls();
  renderLabels();
}

function discardSession() {
  frame?.remove();
  frame = undefined;
}

function showUnavailable(message = '') {
  discardSession();
  if (installingPackage()) {
    packageFeedback = { key: 'package_failed', name: activeRequest.name, details: message };
  } else {
    showOutput(message, 'output_empty');
    statusKey = 'unavailable';
  }
  finish();
}

function initCodeDisplay() {
  const prism = window.Prism;
  const grammar = prism?.languages?.r;
  const area = highlight.parentElement;
  const mirror = highlight.querySelector('code');
  let paintFrame;

  function syncScroll() {
    lineNumbers.scrollTop = code.scrollTop;
    highlight.scrollTop = code.scrollTop;
    highlight.scrollLeft = code.scrollLeft;
  }

  function paint() {
    const source = code.value;
    const lines = source.split('\n').length;
    if (lines !== numberOfLines) {
      numberOfLines = lines;
      lineNumbers.textContent = Array.from({ length: lines }, (_, index) => index + 1).join('\n');
      lineNumbers.style.setProperty('--r-line-number-chars', Math.max(2, String(lines).length));
      renderLineCount();
    }
    if (!grammar) {
      syncScroll();
      return;
    }
    const rendered = document.createDocumentFragment();
    for (const token of prism.tokenize(source, grammar)) {
      if (typeof token === 'string') {
        rendered.append(token);
      } else {
        const span = document.createElement('span');
        span.className = `token ${token.type}`;
        if (token.alias) span.classList.add(token.alias);
        span.textContent = token.content;
        rendered.append(span);
      }
    }
    if (source.endsWith('\n')) rendered.append(' ');
    mirror.replaceChildren(rendered);
    syncScroll();
  }

  code.addEventListener('input', () => {
    window.cancelAnimationFrame(paintFrame);
    paintFrame = window.requestAnimationFrame(paint);
  });
  code.addEventListener('scroll', syncScroll, { passive: true });
  code.addEventListener('compositionstart', () => area.classList.remove('has-highlight'));
  code.addEventListener('compositionend', () => {
    area.classList.toggle('has-highlight', Boolean(grammar));
    paint();
  });
  new ResizeObserver(syncScroll).observe(code);
  area.classList.toggle('has-highlight', Boolean(grammar));
  paint();
}

function beginRequest(request) {
  activeRequest = request;
  if (installingPackage()) {
    packageFeedback = { key: frame ? 'package_installing' : 'package_loading', name: request.name };
  } else {
    showOutput('', 'output_empty');
    renderPlots([]);
    statusKey = frame ? 'running' : 'loading';
  }
  updateControls();
  renderLabels();
  startupTimer = window.setTimeout(() => {
    showUnavailable(installingPackage() ? label('package_startup_timeout') : '');
  }, 60000);

  if (frame) {
    frame.contentWindow.postMessage(request, '*');
    return;
  }

  const newFrame = document.createElement('iframe');
  newFrame.title = 'R runtime';
  newFrame.hidden = true;
  newFrame.setAttribute('sandbox', 'allow-scripts');
  newFrame.src = runnerUrl;
  newFrame.addEventListener('load', () => {
    if (frame === newFrame) newFrame.contentWindow.postMessage(request, '*');
  }, { once: true });
  frame = newFrame;
  workspace.append(newFrame);
}

workspace.addEventListener('submit', (event) => {
  event.preventDefault();
  if (activeRequest) return;
  const script = code.value;
  if (!script.trim()) {
    setStatus('empty_code');
    code.focus();
    return;
  }
  beginRequest({ type: 'r-platform:run', code: script });
});

packageOpen.addEventListener('click', () => packageDialog.showModal());
packageClose.addEventListener('click', () => packageDialog.close());
packageInput.addEventListener('input', () => {
  packageFeedback = undefined;
  renderLabels();
});

packageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (activeRequest) return;
  const name = packageInput.value.trim();
  if (name.length > 128 || !/^[A-Za-z](?:[A-Za-z0-9.]*[A-Za-z0-9])?$/.test(name)) {
    packageFeedback = { key: 'package_invalid', name };
    renderLabels();
    packageInput.focus();
    return;
  }
  beginRequest({ type: 'r-platform:install-package', name });
});

window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || !activeRequest) return;
  const response = event.data;
  if (response?.type === 'r-platform:phase' && response.phase === 'running') {
    window.clearTimeout(startupTimer);
    if (installingPackage()) {
      packageFeedback.key = 'package_installing';
      renderLabels();
    } else {
      setStatus('running');
    }
  } else if (response?.type === 'r-platform:result') {
    try {
      if (installingPackage()) {
        packageFeedback = {
          key: response.hasError ? 'package_failed' : 'package_installed',
          name: activeRequest.name,
          details: response.text,
        };
      } else {
        showOutput(response.text, 'output_none');
        renderPlots(response.images);
        statusKey = response.hasError ? 'r_error' : 'done';
      }
      finish();
    } catch (error) {
      showUnavailable(error.message);
    } finally {
      response.images.forEach((image) => image.close());
    }
  } else if (response?.type === 'r-platform:unavailable') {
    showUnavailable(response.message);
  }
});

reset.addEventListener('click', () => {
  discardSession();
  packageFeedback = undefined;
  packageForm.reset();
  code.value = '';
  code.dispatchEvent(new Event('input'));
  showOutput('', 'output_empty');
  renderPlots([]);
  statusKey = 'reset_done';
  finish();
  code.focus();
});

code.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    workspace.requestSubmit(run);
  }
});

new MutationObserver(renderLabels).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['lang'],
});
updateControls();
reset.disabled = false;
initCodeDisplay();
renderLabels();
