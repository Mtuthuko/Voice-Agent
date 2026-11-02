/**
 * Atlas stage: presentation glue for the redesigned page (loaded last).
 *
 * - Mirrors app.js's state onto <html data-call="idle|connecting|live"> and
 *   <html data-status="idle|connected|listening|thinking|speaking|error">,
 *   so the CSS can key the voice well and the layout off them. app.js is untouched.
 * - Runs the living layer (the orange-breasted sunbird) only before a call:
 *   init on load, a send-off when the call opens, destroy during the call,
 *   and a fly-back-in after Disconnect.
 * - Ask flow: the question chips and "Ask this" buttons (and Enter/Send before
 *   a call) connect first, then send the question once.
 * - Focus repair, scroll-on-connect, the Sentence Line plates, "Use Leah's
 *   voice" and the "Talk to" call to action.
 *
 * Every handler is guarded: if anything here fails, the console works exactly
 * as app.js alone does.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  root.classList.add('js');

  var $ = function (id) { return doc.getElementById(id); };
  var connectBtn = $('connectBtn');
  var disconnectBtn = $('disconnectBtn');
  var micBtn = $('micBtn');
  var statusIndicator = $('statusIndicator');
  var statusText = $('statusText');
  var textInput = $('textInput');
  var sendTextBtn = $('sendTextBtn');
  var transcript = $('transcriptContainer');
  var placeholder = $('transcriptPlaceholder');
  var voiceSelect = $('voiceSelect');
  var providerSelect = $('providerSelect');
  var consoleEl = $('console');
  var srNote = $('srNote');
  var instrument = doc.querySelector('.instrument');
  if (!connectBtn || !disconnectBtn || !statusIndicator || !consoleEl) return;

  function mq(q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; }
  var reduce = mq('(prefers-reduced-motion: reduce)');
  // Touch-only devices: moving focus into the text field would open the
  // on-screen keyboard over the answer, so focus goes to the conversation.
  var touchOnly = mq('(hover: none) and (pointer: coarse)');
  function behavior() { return reduce.matches ? 'auto' : 'smooth'; }
  function guard(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { if (window.console) console.warn('stage.js:', e); }
    };
  }

  /* ------------------------------------------------------------------------
   * The sunbird (living layer). Colours come from the tokens in styles.css.
   * ---------------------------------------------------------------------- */
  var SUNBIRD = {
    character: 'sunbird',
    look: 'rich',
    finish: 'satin',
    size: 58,                   // set at every init by birdSize(): 68 from 1280px; phones get about 46
    side: 'right',
    lane: null,                 // set from computeLane() at every init
    perch: '[data-perch]',
    // Over velvet: the orange-breasted sunbird itself (orange breast, green crown, violet band)
    colorsOnDark: { primary: '#FF8A3D', secondary: '#45D6A0', accent: '#A58BFF', dark: '#6B5884', light: '#FFF4EA' },
    // Over the orange and lilac bands: a velvet-plum bird that reads on both
    colors: { primary: '#2A1B38', secondary: '#0F5E45', accent: '#4B2FC0', dark: '#120D18', light: '#FFF4EA' },
    dust: { colors: ['#FFD39A', '#FF8A3D', '#C6B3FF'], amount: 0.45, ambient: true, trail: true },
    ghost: false,
    calm: false,
    intro: true,
    introDelay: 1400,           // after the H1's loud word has finished widening
    zIndex: 40,                 // dust 39, bird 40; the top bar is 50
    safeTop: 'auto',
    scroller: null,
    toggle: { position: 'bottom-left', label: 'Moving effects', bg: '#1A1322', fg: '#FF8A3D', line: '#7D6A90' },
    tilt: '[data-tilt]',
    depth: '[data-depth]',
    reveal: '[data-reveal-3d]',
    magnetic: '[data-magnetic]',
    storageKey: 'living-layer',
    mobileScale: 0.8
  };
  var SEEN_ONLY = '[data-reveal-3d]:not([data-seen])';   // re-inits never replay a reveal

  var call = 'idle';              // mirrors html[data-call]
  var laneNow = null;
  var leaveTimer = 0, returnTimer = 0, flushTimer = 0, resizeTimer = 0;
  var pendingAsk = null;
  var pendingProvider = null;     // a provider switch "Use Leah's voice" needs, applied when the call ends

  // A wide page gives the companion a real gutter, so it can be big enough to register
  // as the main character there: 68px from 1280px, 58px below (46px on phones via mobileScale).
  function birdSize() { return window.innerWidth >= 1280 ? 68 : 58; }

  // Cruise in the right page gutter when it is wide enough; otherwise beside the H1.
  // On phones the lane sits level with the short first line ("Atlas"), clear of the
  // longer lines below it.
  function computeLane() {
    var vw = window.innerWidth;
    var gutter = vw - consoleEl.getBoundingClientRect().right;
    return gutter >= 88
      ? { mode: 'gutter', lane: { x: +((vw - gutter / 2) / vw).toFixed(3), y: 0.36 } }
      : { mode: 'top', lane: { x: 0.86, y: vw < 700 ? 0.11 : 0.16 } };
  }

  // Dock the kit's pause button in the top bar (the kit keeps its own reference).
  var dock = guard(function () {
    var slot = doc.querySelector('.ll-slot');
    var toggle = doc.querySelector('.ll-toggle');
    if (slot && toggle && toggle.parentNode !== slot) slot.appendChild(toggle);
  });

  var llStart = guard(function (extra) {
    if (!window.LivingLayer || call === 'live') return;
    laneNow = computeLane();
    sizeNow = birdSize();
    window.LivingLayer.init(Object.assign({}, SUNBIRD, { lane: laneNow.lane, size: sizeNow }, extra || null));
    dock();
    lastMask = null; lastDust = null; lastYield = null; textYield = false;
    schedule();
    watchStill(2500);
  });

  // Never use setEnabled() here: it would save a "paused" choice for the viewer.
  var llStop = guard(function () {
    clearTimeout(leaveTimer); leaveTimer = 0;
    clearTimeout(stillTimer); stillTimer = 0; textYield = false;
    root.classList.remove('ll-leaving', 'll-yield');
    lastYield = null;
    if (window.__livingLayer) window.__livingLayer.destroy();
  });

  /* ---- Yield (phones) and dust mask (the console stays clear) ---------- */
  var raf = 0, lastMask = null, lastDust = null, lastYield = null;
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  var frame = guard(function () {
    raf = 0;
    if (call === 'live' || !window.__livingLayer) return;
    var r = consoleEl.getBoundingClientRect();
    var vh = window.innerHeight;

    // Top lane: the bird steps aside while the console passes under its lane, and when
    // the reader stops with words under it (see checkStill).
    var yieldNow = textYield;
    if (laneNow && laneNow.mode === 'top') {
      var y = laneNow.lane.y * vh;
      if (y >= r.top - 24 && y <= r.bottom + 24) yieldNow = true;
    }
    if (yieldNow !== lastYield) { root.classList.toggle('ll-yield', yieldNow); lastYield = yieldNow; }

    // Dust never drifts over the console band.
    var dust = doc.querySelector('.ll-dust');
    if (!dust) return;
    var m = 'none';
    if (r.bottom > 0 && r.top < vh) {
      var t = Math.round(Math.max(r.top, 0));
      var b = Math.round(Math.min(r.bottom, vh));
      m = 'linear-gradient(to bottom, #000 ' + (t - 32) + 'px, transparent ' + t + 'px, transparent ' + b + 'px, #000 ' + (b + 32) + 'px)';
    }
    if (m !== lastMask || dust !== lastDust) {
      dust.style.webkitMaskImage = m;
      dust.style.maskImage = m;
      lastMask = m; lastDust = dust;
    }
  });

  /* ---- Words under a cruising bird (top lane) --------------------------------
   * The kit only settles on clear ground, so where no perch is in view the bird keeps
   * hovering in its lane, which on phones and tablets often crosses body text. When the
   * reader stops there, it steps aside (the same yield as over the console) until they
   * scroll again or it heads for a perch. */
  var textYield = false, stillTimer = 0, sizeNow = 0;
  // Does the bird's body meet the line boxes of the text under it (not just its block)?
  function wordsUnder(x, y, size) {
    var hw = size * 0.4, hh = size * 0.3, seen = [];
    var pts = [[x, y], [x - hw, y], [x + hw, y], [x, y - hh], [x, y + hh]];
    for (var i = 0; i < pts.length; i++) {
      var el = doc.elementFromPoint(pts[i][0], pts[i][1]);
      if (!el || seen.indexOf(el) >= 0) continue;
      seen.push(el);
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 3 || !/\S/.test(n.nodeValue)) continue;
        var range = doc.createRange();
        range.selectNodeContents(n);
        var rects = range.getClientRects();
        for (var j = 0; j < rects.length; j++) {
          var q = rects[j];
          if (q.right > x - hw && q.left < x + hw && q.bottom > y - hh && q.top < y + hh) return true;
        }
      }
    }
    return false;
  }
  function setTextYield(on) {
    if (on === textYield) return;
    textYield = on;
    schedule();                   // frame() applies it together with the console yield
  }
  var checkStill = guard(function () {
    stillTimer = 0;
    var ll = window.__livingLayer;
    if (call === 'live' || !ll || !laneNow || laneNow.mode !== 'top') { setTextYield(false); return; }
    var st = ll.state();
    if (!st.running || st.mode !== 'cruise') setTextYield(false);   // flying in, to a perch or perched
    else if (!textYield && wordsUnder(st.x, st.y, st.size)) setTextYield(true);
    stillTimer = setTimeout(checkStill, 700);
  });
  function watchStill(delay) {
    clearTimeout(stillTimer);
    stillTimer = setTimeout(checkStill, delay);
  }

  /* ------------------------------------------------------------------------
   * Focus and scrolling
   * ---------------------------------------------------------------------- */
  function focusForCall() {
    var target = touchOnly.matches ? transcript : textInput;
    if (target) target.focus({ preventScroll: true });
  }

  function px(v) { return parseFloat(v) || 0; }
  // Always issue the scroll, even to where the page already is: a new smooth scroll replaces
  // one still in flight (the browser's own scroll to a link that was focused a moment ago).
  function scrollToY(y) {
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: behavior() });
  }
  // The window offset that puts el's top at the top of the window, as scrollIntoView would
  // (its scroll-margin and the page's scroll-padding for the sticky top bar included).
  function pinOffset(el) {
    return window.pageYOffset + el.getBoundingClientRect().top -
      px(getComputedStyle(el).scrollMarginTop) - px(getComputedStyle(root).scrollPaddingTop);
  }

  // Bring the console into view for the call, and keep the element that has focus there (the
  // text field for mouse and keyboard users, the conversation on touch) fully on screen.
  // Call it after focus has moved. Positions are worked out up front, never read mid-scroll.
  function scrollConsole() {
    var vh = window.innerHeight, y = window.pageYOffset;
    var a = doc.activeElement;
    var f = a && a !== doc.body && consoleEl.contains(a) ? a.getBoundingClientRect() : null;
    var showY = f ? y + f.bottom + 16 - vh : -Infinity;   // 16 px keeps its focus ring off the edge
    var r = consoleEl.getBoundingClientRect();
    var pinY;
    if (window.innerWidth >= 1100) {
      // Two columns. A console that fits the window is shown whole, so its focus is shown too.
      if (r.height + 32 <= vh - px(getComputedStyle(root).scrollPaddingTop)) {
        if (r.top < 0 || r.bottom > vh) consoleEl.scrollIntoView({ block: 'nearest', behavior: behavior() });
        else scrollToY(y);
        return;
      }
      pinY = pinOffset(consoleEl);
      scrollToY(showY > pinY ? showY : pinY);
      return;
    }
    if (!instrument) return;
    // One column: pin the instrument to the top, unless that would leave the focused element
    // below the fold. Then scroll only as far as it takes to show that element whole, which
    // keeps as much of the voice well in view as fits.
    var top = instrument.getBoundingClientRect().top;
    pinY = pinOffset(instrument);
    if (showY > pinY) scrollToY(showY);
    else if (top < 0 || top > vh * 0.25 || (f && f.bottom + 16 > vh)) scrollToY(pinY);
    else scrollToY(y);
  }

  // A chip used during a call: keep the field that just took focus in view (it was focused
  // with preventScroll), moving the page as little as possible.
  function revealFocus() {
    var a = doc.activeElement;
    if (!a || a === doc.body) return;
    var q = a.getBoundingClientRect(), vh = window.innerHeight;
    if (q.bottom + 16 > vh) scrollToY(window.pageYOffset + q.bottom + 16 - vh);
    else if (q.top < 16) scrollToY(window.pageYOffset + q.top - 16);
  }

  /* ------------------------------------------------------------------------
   * Call lifecycle
   * ---------------------------------------------------------------------- */
  var onLive = guard(function () {
    clearTimeout(returnTimer); returnTimer = 0;

    // The success moment: a loop and a sparkle as a send-off, then the bird
    // fades and is destroyed before any audio can play. When a question is on
    // its way (chip, "Ask this", Enter) it is sent within ~100 ms, so the bird
    // leaves at once instead: it never shares the screen with Thinking or Speaking.
    var ll = window.__livingLayer;
    if (ll && ll.isEnabled() && !reduce.matches && pendingAsk == null) {
      try { ll.celebrate(); } catch (e) { /* not started yet */ }
      root.classList.add('ll-leaving');
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(llStop, 640);
    } else {
      llStop();
    }

    // app.js disables the button that had focus; put focus where the talking happens.
    var a = doc.activeElement;
    if (!a || a === doc.body || a === connectBtn || (a.matches && a.matches('[data-ask]'))) focusForCall();

    scrollConsole();

    if (pendingAsk != null) {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 400);
    }
  });

  var onIdle = guard(function (prev) {
    // An ask that never got a call is dropped; its text stays in the input.
    pendingAsk = null;
    clearTimeout(flushTimer); flushTimer = 0;

    // "Use Leah's voice" was pressed during a realtime call: switch the provider now that
    // nothing reads it (only if Leah is still the chosen voice).
    if (pendingProvider && providerSelect && voiceSelect && voiceSelect.value === 'en-ZA-LeahNeural') {
      providerSelect.value = pendingProvider;
      flash(providerSelect);
    }
    pendingProvider = null;

    if (prev !== 'live') return;            // a failed connect: the bird never left

    clearTimeout(leaveTimer); leaveTimer = 0;
    root.classList.remove('ll-leaving');
    if (window.__livingLayer) window.__livingLayer.destroy();

    var a = doc.activeElement;
    if (!a || a === doc.body || ((a === micBtn || a === disconnectBtn) && a.disabled)) {
      connectBtn.focus({ preventScroll: true });
    }

    clearTimeout(returnTimer);
    returnTimer = setTimeout(function () {
      llStart({ intro: true, introDelay: 900, reveal: SEEN_ONLY });
    }, 400);
  });

  function computeCall() {
    if (!disconnectBtn.disabled) return 'live';
    if (connectBtn.disabled) return 'connecting';
    return 'idle';
  }

  var syncCall = guard(function () {
    var next = computeCall();
    if (next === call) return;
    var prev = call;
    call = next;
    root.setAttribute('data-call', next);
    // app.js reads the provider live during a call (to pick pipeline or realtime handling),
    // so it is locked from Connect until the call ends. app.js only reads .value.
    if (providerSelect) providerSelect.disabled = next !== 'idle';
    if (next === 'live') onLive();
    else if (next === 'idle') onIdle(prev);
  });

  // Screen readers hear the status from a quiet copy: app.js rewrites the same "Speaking..."
  // on every audio chunk, so the visible pill is not a live region. The copy speaks only
  // when the words change, and skips the interim "Hearing: ..." text.
  var srStatus = $('srStatus');
  var saidStatus = (statusText.textContent || '').trim();

  var syncStatus = guard(function () {
    var s = (statusIndicator.className || '').replace('status-indicator', '').trim() || 'idle';
    if (root.getAttribute('data-status') !== s) root.setAttribute('data-status', s);
    var said = (statusText.textContent || '').trim();
    if (srStatus && said && said !== saidStatus && !/^hearing:/i.test(said)) {
      saidStatus = said;
      srStatus.textContent = said;
    }
    // A send-off still playing when the call gets busy (a fast typist): the bird goes now.
    if (leaveTimer && (s === 'listening' || s === 'thinking' || s === 'speaking')) llStop();
    if (pendingAsk != null && call === 'live' && /session ready/i.test(statusText.textContent || '')) flush();
  });

  var syncMic = guard(function () {
    if (micBtn) micBtn.setAttribute('aria-pressed', micBtn.classList.contains('active') ? 'true' : 'false');
  });

  /* ------------------------------------------------------------------------
   * Ask flow: connect first if needed, then send exactly once
   * ---------------------------------------------------------------------- */
  function ask(text) {
    text = String(text || '').trim();
    if (!text) return;
    textInput.value = text;
    if (call === 'live') {
      sendTextBtn.click();
      // A chip in the empty state was focused, and app.js has just hidden the empty state:
      // keep focus where the talking happens instead of losing it to <body>.
      var a = doc.activeElement;
      if (!a || a === doc.body || (placeholder && placeholder.contains(a))) { focusForCall(); revealFocus(); }
      return;
    }
    pendingAsk = text;
    if (call === 'idle') connectBtn.click();
  }

  function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    var text = pendingAsk;
    pendingAsk = null;
    if (text != null && call === 'live' && textInput.value.trim() === text) sendTextBtn.click();
  }

  doc.addEventListener('click', guard(function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-ask]') : null;
    if (!b) return;
    var fromStory = !consoleEl.contains(b);     // the question rows sit below the console
    ask(b.getAttribute('data-ask'));
    if (fromStory) {
      if (call === 'live') focusForCall();      // focus first: scrollConsole() keeps it on screen
      scrollConsole();
    }
  }));

  // Enter or Send before a call: app.js ignores it (no session yet), so connect, then send.
  textInput.addEventListener('keydown', guard(function (e) {
    if (e.key !== 'Enter' || e.isComposing || call === 'live') return;
    if (textInput.value.trim()) ask(textInput.value);
  }));
  sendTextBtn.addEventListener('click', guard(function () {
    if (call === 'live') return;
    if (textInput.value.trim()) ask(textInput.value);
  }));

  /* ------------------------------------------------------------------------
   * "Use Leah's voice" and the "Talk to" call to action
   * ---------------------------------------------------------------------- */
  function say(message) {
    if (!srNote) return;
    srNote.textContent = '';
    setTimeout(function () { srNote.textContent = message; }, 60);
  }

  var flashTimers = typeof WeakMap === 'function' ? new WeakMap() : null;
  function flash(el) {
    el.classList.add('flash');
    if (flashTimers) clearTimeout(flashTimers.get(el));
    var t = setTimeout(function () { el.classList.remove('flash'); }, 1200);
    if (flashTimers) flashTimers.set(el, t);
  }

  var leahBtn = $('useLeah');
  if (leahBtn && voiceSelect && providerSelect) {
    leahBtn.addEventListener('click', guard(function () {
      var inCall = call !== 'idle';
      // Leah is an Edge-TTS voice, so a realtime provider can't speak with her. But app.js
      // reads the provider live during a call (isPipelineMode), so switching it mid-call
      // would break that call: switch now only when idle, otherwise once the call ends.
      // The voice is safe to set at any time: app.js reads it only when connecting.
      var realtime = providerSelect.value === 'openai' || providerSelect.value === 'elevenlabs';
      voiceSelect.value = 'en-ZA-LeahNeural';
      if (realtime && !inCall) providerSelect.value = 'groq';
      pendingProvider = realtime && inCall ? 'groq' : null;
      say(!inCall
        ? (realtime ? 'Voice set to Leah, South African English, and the provider to Groq. Press Connect to talk.'
                    : 'Voice set to Leah, South African English. Press Connect to talk.')
        : (realtime ? 'Leah will be used the next time you connect. She needs Groq, so the provider switches to Groq when this call ends.'
                    : 'Leah will be used the next time you connect.'));
      flash(voiceSelect);
      if (inCall) {
        voiceSelect.scrollIntoView({ block: 'nearest', behavior: behavior() });
        voiceSelect.focus({ preventScroll: true });
      } else {
        connectBtn.focus({ preventScroll: true });
        scrollConsole();
      }
    }));
  }

  var cta = $('talkCta');
  if (cta) {
    cta.addEventListener('click', guard(function (e) {
      e.preventDefault();
      if (call === 'live') focusForCall();
      else connectBtn.focus({ preventScroll: true });
      scrollConsole();
    }));
  }

  /* ------------------------------------------------------------------------
   * The Sentence Line plates play once, when they come into view
   * ---------------------------------------------------------------------- */
  guard(function () {
    var plates = doc.querySelector('.plates');
    if (!plates || reduce.matches || !('IntersectionObserver' in window)) return;
    if (plates.getBoundingClientRect().top <= window.innerHeight) return;   // already in view: final state
    plates.classList.add('pre');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.intersectionRatio < 0.35) return;
        plates.classList.add('is-playing');
        plates.classList.remove('pre');
        io.disconnect();
      });
    }, { threshold: [0, 0.35] });
    io.observe(plates);
  })();

  /* ------------------------------------------------------------------------
   * Start
   * ---------------------------------------------------------------------- */
  // Mark 3D reveals as seen, so a re-init after a call never hides them again.
  guard(function () {
    if (!('IntersectionObserver' in window)) return;
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.setAttribute('data-seen', '');
        seen.unobserve(en.target);
      });
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-reveal-3d]'), function (el) { seen.observe(el); });
  })();

  if ('MutationObserver' in window) {
    var watch = function (target, options, fn) { if (target) new MutationObserver(fn).observe(target, options); };
    watch(connectBtn, { attributes: true, attributeFilter: ['disabled'] }, syncCall);
    watch(disconnectBtn, { attributes: true, attributeFilter: ['disabled'] }, syncCall);
    watch(statusIndicator, { attributes: true, attributeFilter: ['class'] }, syncStatus);
    watch(statusText, { childList: true, characterData: true, subtree: true }, syncStatus);
    watch(micBtn, { attributes: true, attributeFilter: ['class'] }, syncMic);
  }
  syncStatus();
  syncMic();
  syncCall();

  window.addEventListener('scroll', function () {
    textYield = false;            // the reader moved on: the bird follows again
    watchStill(1200);
    schedule();
  }, { passive: true });
  // The console moves when the web fonts arrive (and on any reflow): keep the mask true.
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { schedule(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { schedule(); }).observe(doc.body);
  window.addEventListener('resize', function () {
    schedule();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(guard(function () {
      if (call === 'live' || !window.__livingLayer) return;
      var next = computeLane();
      if (!laneNow || next.mode !== laneNow.mode || Math.abs(next.lane.x - laneNow.lane.x) > 0.01 ||
          Math.abs(next.lane.y - laneNow.lane.y) > 0.01 || birdSize() !== sizeNow) {
        llStart({ intro: false, reveal: SEEN_ONLY });
      }
    }), 300);
  });

  llStart();
})();
