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
const runnerUrl = new URL('../r-platform/runner.html', import.meta.url);
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
};

let frame;
let startupTimer;
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

function renderLabels() {
  status.textContent = label(statusKey);
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

function finish(key) {
  window.clearTimeout(startupTimer);
  run.disabled = false;
  setStatus(key);
}

function discardSession() {
  frame?.remove();
  frame = undefined;
}

function showUnavailable(message = '') {
  discardSession();
  showOutput(message, 'output_empty');
  finish('unavailable');
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

workspace.addEventListener('submit', (event) => {
  event.preventDefault();
  if (run.disabled) return;
  const script = code.value;
  if (!script.trim()) {
    setStatus('empty_code');
    code.focus();
    return;
  }

  run.disabled = true;
  showOutput('', 'output_empty');
  renderPlots([]);
  setStatus(frame ? 'running' : 'loading');
  startupTimer = window.setTimeout(showUnavailable, 60000);
  const request = { type: 'r-platform:run', code: script };

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
});

window.addEventListener('message', (event) => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || !run.disabled) return;
  const response = event.data;
  if (response?.type === 'r-platform:phase' && response.phase === 'running') {
    window.clearTimeout(startupTimer);
    setStatus('running');
  } else if (response?.type === 'r-platform:result') {
    try {
      showOutput(response.text, 'output_none');
      renderPlots(response.images);
      finish(response.hasError ? 'r_error' : 'done');
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
  code.value = '';
  code.dispatchEvent(new Event('input'));
  showOutput('', 'output_empty');
  renderPlots([]);
  finish('reset_done');
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
run.disabled = false;
reset.disabled = false;
initCodeDisplay();
renderLabels();
