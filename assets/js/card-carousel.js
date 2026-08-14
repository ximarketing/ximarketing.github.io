(function () {
  'use strict';

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initCarousel(carousel) {
    var track = carousel.querySelector('[data-carousel-track]');
    var dots = carousel.querySelector('[data-carousel-dots]');
    var items = track ? Array.prototype.slice.call(track.children) : [];
    var positions = [];
    var activeIndex = 0;
    var scrollFrame = null;
    var resizeFrame = null;
    var pointerId = null;
    var pointerStartX = 0;
    var pointerStartScroll = 0;
    var didDrag = false;
    var suppressClick = false;

    if (!track || !dots || !items.length) return;

    Array.prototype.forEach.call(carousel.querySelectorAll('[data-card-image]'), function (image) {
      function showFallback() {
        image.parentNode.hidden = true;
      }

      image.addEventListener('error', showFallback);
      if (image.complete && !image.naturalWidth) showFallback();
    });

    function closestPageIndex() {
      var closestIndex = 0;
      var closestDistance = Infinity;

      positions.forEach(function (position, index) {
        var distance = Math.abs(track.scrollLeft - position);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      return closestIndex;
    }

    function updateDots(index) {
      var buttons = dots.querySelectorAll('button');
      activeIndex = Math.max(0, Math.min(index, positions.length - 1));

      Array.prototype.forEach.call(buttons, function (button, buttonIndex) {
        if (buttonIndex === activeIndex) {
          button.setAttribute('aria-current', 'true');
        } else {
          button.removeAttribute('aria-current');
        }
      });
    }

    function goToPage(index, smooth) {
      var targetIndex = Math.max(0, Math.min(index, positions.length - 1));
      var targetPosition = positions[targetIndex];

      if (typeof track.scrollTo === 'function') {
        try {
          track.scrollTo({
            left: targetPosition,
            behavior: smooth && !reducedMotion ? 'smooth' : 'auto'
          });
        } catch (error) {
          track.scrollLeft = targetPosition;
        }
      } else {
        track.scrollLeft = targetPosition;
      }
      updateDots(targetIndex);
    }

    function renderDots() {
      var focusedDot = dots.contains(document.activeElement) ? document.activeElement : null;
      var focusedIndex = focusedDot ? Array.prototype.indexOf.call(dots.children, focusedDot) : -1;

      dots.innerHTML = '';
      dots.hidden = positions.length < 2;

      positions.forEach(function (position, index) {
        var button = document.createElement('button');
        button.className = 'carousel-dot';
        button.type = 'button';
        button.setAttribute('aria-label', 'Show page ' + (index + 1) + ' of ' + positions.length);
        button.addEventListener('click', function () {
          goToPage(index, true);
        });
        dots.appendChild(button);
      });

      updateDots(closestPageIndex());

      if (focusedIndex > -1 && dots.children.length) {
        dots.children[Math.min(focusedIndex, dots.children.length - 1)].focus();
      }
    }

    function measurePages() {
      var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      var firstOffset = items[0].offsetLeft;
      var measured = [0];

      items.forEach(function (item) {
        var position = Math.max(0, Math.min(item.offsetLeft - firstOffset, maxScroll));
        var previous = measured[measured.length - 1];
        if (Math.abs(position - previous) > 4) measured.push(position);
      });

      if (maxScroll > 4 && Math.abs(measured[measured.length - 1] - maxScroll) > 4) {
        measured.push(maxScroll);
      }

      positions = measured;
      if (dots.children.length === positions.length) {
        dots.hidden = positions.length < 2;
        updateDots(closestPageIndex());
      } else {
        renderDots();
      }
    }

    track.addEventListener('scroll', function () {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(function () {
        updateDots(closestPageIndex());
        scrollFrame = null;
      });
    }, { passive: true });

    track.addEventListener('keydown', function (event) {
      if (event.target !== track) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(activeIndex + 1, true);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPage(activeIndex - 1, true);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToPage(0, true);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToPage(positions.length - 1, true);
      }
    });

    track.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartScroll = track.scrollLeft;
      didDrag = false;
      track.classList.add('is-pointer-down');
    });

    track.addEventListener('pointermove', function (event) {
      if (pointerId !== event.pointerId) return;
      var distance = event.clientX - pointerStartX;

      if (Math.abs(distance) > 5) {
        didDrag = true;
        track.classList.add('is-dragging');
        if (!track.hasPointerCapture(pointerId)) track.setPointerCapture(pointerId);
      }

      if (didDrag) {
        event.preventDefault();
        track.scrollLeft = pointerStartScroll - distance;
      }
    });

    function finishDrag(event) {
      if (pointerId !== event.pointerId) return;

      if (track.hasPointerCapture(pointerId)) track.releasePointerCapture(pointerId);
      pointerId = null;
      track.classList.remove('is-pointer-down', 'is-dragging');

      if (didDrag) {
        suppressClick = true;
        goToPage(closestPageIndex(), true);
        window.setTimeout(function () { suppressClick = false; }, 0);
      }
    }

    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    track.addEventListener('dragstart', function (event) { event.preventDefault(); });
    track.addEventListener('click', function (event) {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    window.addEventListener('resize', function () {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(function () {
        measurePages();
        resizeFrame = null;
      });
    }, { passive: true });

    measurePages();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), initCarousel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
