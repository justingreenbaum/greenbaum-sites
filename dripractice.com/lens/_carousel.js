(function () {
  'use strict';

  // ---- Image format detection ----
  var avifTest = new Image();
  avifTest.onload = function () { applyBackgrounds('avif'); };
  avifTest.onerror = function () { applyBackgrounds('webp'); };
  avifTest.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABoAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLanAyaAAAAAAAAgABAACAAAABQAAAAAAAAAAAAAAAAAAAAAAeaXBtYQAAAAAAAAABAAEEAQKDBAAAARptZGF0EgAKBzgABhAQ0EkA';

  function applyBackgrounds(format) {
    var ext = format === 'avif' ? 'avif' : 'webp';
    var base = window.location.pathname.replace(/\/?$/, '/');
    var root = document.documentElement.style;
    root.setProperty('--narrative-bg', 'url(' + base + 'images/narrative.' + ext + ')');
    root.setProperty('--structure-bg', 'url(' + base + 'images/structure.' + ext + ')');
    root.setProperty('--grain-bg', 'url(' + base + 'images/grain.png)');
  }

  // ---- Carousel state ----
  var currentIndex = 0;
  var cardEls = document.querySelectorAll('.card');
  var totalCards = cardEls.length;
  var dots = document.querySelectorAll('.carousel-dot');
  var prevBtn = document.querySelector('.carousel-prev');
  var nextBtn = document.querySelector('.carousel-next');
  var footerR = document.getElementById('footerRight');

  // ---- Deeplink config ----
  // URL fragments use 1-indexed card numbers (#card-1..#card-5).
  // DOM data-index is 0-indexed; card 6 (data-index="5") is the closing-statement
  // card and is intentionally non-deeplinkable. See lens_deeplink_handler_spec.md.
  var DEEPLINKABLE_CARDS = 5;
  var DEEPLINK_REGEX = /^#card-([1-5])$/;

  // ---- Per-card slider state ----
  var sliders = [];
  for (var i = 0; i < cardEls.length; i++) {
    (function (idx) {
      var card = cardEls[idx];
      var h = card.querySelector('.handle');
      if (!h) return;
      sliders.push({
        el: card,
        handle: h,
        structure: card.querySelector('.layer-structure'),
        narrative: card.querySelector('.layer-narrative'),
        fmLabel: card.querySelector('.fm-label'),
        prompt: card.querySelector('.prompt'),
        promptBtn: card.querySelector('.prompt-button'),
        pct: initialPct(),
        dragging: false,
        startX: 0,
        startPct: 0,
        touched: false,
        halfHandle: h.getBoundingClientRect().width / 2
      });
    })(i);
  }

  // ---- Card positioning ----
  function positionCards(animate) {
    for (var i = 0; i < totalCards; i++) {
      var el = cardEls[i];
      var offset = (i - currentIndex) * 100;
      el.style.transition = animate
        ? 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
        : 'none';
      el.style.transform = 'translateX(' + offset + '%)';
      el.style.pointerEvents = (i === currentIndex) ? 'auto' : 'none';
      if (sliders[i]) sliders[i].handle.setAttribute('tabindex', i === currentIndex ? '0' : '-1');
    }
    for (var j = 0; j < dots.length; j++) {
      if (j === currentIndex) dots[j].classList.add('active');
      else dots[j].classList.remove('active');
    }
    prevBtn.disabled = (currentIndex === 0);
    nextBtn.disabled = (currentIndex === totalCards - 1);
    updateFooterRight();
  }

  function goToCard(index) {
    if (index < 0 || index >= totalCards || index === currentIndex) return;
    currentIndex = index;
    positionCards(true);
    syncFragmentToCard(index);
  }

  // Starting reveal: a slim strip on phones so it stays clear of the centred text column.
  function initialPct() { return window.innerWidth <= 768 ? 6 : 15; }

  // ---- Slider position logic ----
  function setSliderPosition(s, p) {
    s.pct = Math.max(0, Math.min(100, p));
    var px = (s.pct / 100) * window.innerWidth;

    s.handle.style.left = (px - s.halfHandle) + 'px';
    s.structure.style.clipPath = 'inset(0 ' + (100 - s.pct) + '% 0 0)';
    s.narrative.style.clipPath = 'inset(0 0 0 ' + s.pct + '%)';

    var rounded = Math.round(s.pct);
    s.handle.setAttribute('aria-valuenow', rounded);
    s.handle.setAttribute('aria-valuetext', 'Structural view revealed: ' + rounded + '%');

    // Narrative credibility fade at 65%
    if (s.pct > 65) {
      s.narrative.style.opacity = 1 - ((s.pct - 65) / 35) * 0.12;
    } else {
      s.narrative.style.opacity = 1;
    }

    // Structure opacity ramp
    s.structure.style.setProperty('--live-structure-opacity', 0.10 + (s.pct / 100) * 0.04);

    // FM label at >62%
    if (s.pct > 62) s.fmLabel.classList.add('visible');
    else s.fmLabel.classList.remove('visible');

    updateFooterRight();
  }

  function updateFooterRight() {
    if (currentIndex >= sliders.length) { footerR.classList.add('visible'); return; }
    var active = sliders[currentIndex];
    if (active.pct > 80) footerR.classList.add('visible');
    else footerR.classList.remove('visible');
  }

  function firstTouch(s) {
    if (!s.touched) {
      s.touched = true;
      s.prompt.classList.add('hidden');
    }
  }

  // ---- Per-card event binding ----
  for (var i = 0; i < sliders.length; i++) {
    (function (s) {
      s.handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        s.handle.setPointerCapture(e.pointerId);
        s.dragging = true;
        s.startX = e.clientX;
        s.startPct = s.pct;
        s.handle.classList.add('active');
        firstTouch(s);
      });

      if (s.promptBtn) {
        s.promptBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          firstTouch(s);
          setSliderPosition(s, 50);
        });
      }

      s.handle.addEventListener('keydown', function (e) {
        var n = s.pct;
        switch (e.key) {
          case 'ArrowRight': n += 5; break;
          case 'ArrowLeft':  n -= 5; break;
          case 'PageDown':   n += 20; break;
          case 'PageUp':     n -= 20; break;
          case 'End':        n = 100; break;
          case 'Home':       n = 0; break;
          default: return;
        }
        e.preventDefault();
        firstTouch(s);
        setSliderPosition(s, n);
      });
    })(sliders[i]);
  }

  // ---- Global pointer events for slider drag ----
  document.addEventListener('pointermove', function (e) {
    for (var i = 0; i < sliders.length; i++) {
      if (!sliders[i].dragging) continue;
      e.preventDefault();
      var dx = e.clientX - sliders[i].startX;
      setSliderPosition(sliders[i], sliders[i].startPct + (dx / window.innerWidth) * 100);
      return;
    }
  });

  document.addEventListener('pointerup', function () {
    for (var i = 0; i < sliders.length; i++) {
      if (sliders[i].dragging) {
        sliders[i].dragging = false;
        sliders[i].handle.classList.remove('active');
      }
    }
  });

  // ---- Swipe detection for carousel ----
  var swipeStartX = 0;
  var swipeStartY = 0;
  var swiping = false;

  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.handle') || e.target.closest('.carousel-nav') || e.target.closest('.prompt-button')) return;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swiping = true;
  });

  document.addEventListener('pointerup', function (e) {
    if (!swiping) return;
    swiping = false;
    var dx = e.clientX - swipeStartX;
    var dy = e.clientY - swipeStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goToCard(currentIndex + 1);
      else goToCard(currentIndex - 1);
    }
  });

  // ---- Carousel controls ----
  prevBtn.addEventListener('click', function () { goToCard(currentIndex - 1); });
  nextBtn.addEventListener('click', function () { goToCard(currentIndex + 1); });

  for (var d = 0; d < dots.length; d++) {
    dots[d].addEventListener('click', function () {
      goToCard(parseInt(this.getAttribute('data-index')));
    });
  }

  // ---- Resize ----
  window.addEventListener('resize', function () {
    for (var i = 0; i < sliders.length; i++) {
      sliders[i].halfHandle = sliders[i].handle.getBoundingClientRect().width / 2;
      setSliderPosition(sliders[i], sliders[i].pct);
    }
    positionCards(false);
  });

  // ---- Deeplink handler ----
  var liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  document.body.appendChild(liveRegion);

  function readDeeplinkFragment() {
    var m = (window.location.hash || '').match(DEEPLINK_REGEX);
    if (!m) return null;
    return parseInt(m[1], 10) - 1;
  }

  function syncFragmentToCard(idx) {
    if (!history.replaceState) return;
    if (idx >= 0 && idx < DEEPLINKABLE_CARDS) {
      history.replaceState({}, '', '#card-' + (idx + 1));
    }
  }

  function announceCard(idx) {
    var card = cardEls[idx];
    if (!card) return;
    var fmCodeEl = card.querySelector('.fm-code a, .fm-code');
    var fmText = fmCodeEl ? fmCodeEl.textContent.trim() : '';
    liveRegion.textContent = 'Card ' + (idx + 1) + ' of ' + totalCards + (fmText ? ': ' + fmText : '');
  }

  function focusActiveCard(idx) {
    var card = cardEls[idx];
    if (!card) return;
    var handle = card.querySelector('.handle');
    if (handle && typeof handle.focus === 'function') {
      handle.focus({ preventScroll: true });
      return;
    }
    var headline = card.querySelector('.layer-headline');
    if (headline) {
      headline.setAttribute('tabindex', '-1');
      headline.focus({ preventScroll: true });
    }
  }

  function applyDeeplinkOnLoad() {
    var idx = readDeeplinkFragment();
    if (idx === null) return;
    if (idx === currentIndex) {
      announceCard(idx);
      setTimeout(function () { focusActiveCard(idx); }, 0);
      return;
    }
    currentIndex = idx;
    positionCards(false);
    announceCard(idx);
    setTimeout(function () { focusActiveCard(idx); }, 0);
  }

  window.addEventListener('hashchange', function () {
    var idx = readDeeplinkFragment();
    if (idx === null) return;
    if (idx === currentIndex) return;
    goToCard(idx);
    announceCard(idx);
    setTimeout(function () { focusActiveCard(idx); }, 0);
  });

  // ---- Init ----
  positionCards(false);
  for (var i = 0; i < sliders.length; i++) {
    setSliderPosition(sliders[i], initialPct());
  }
  applyDeeplinkOnLoad();
})();
