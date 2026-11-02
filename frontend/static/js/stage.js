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
    size: 50,
    side: 'right',
    lane: null,                 // set from computeLane() at every init
    perch: '[data-perch]',
    // Over velvet: the orange-breasted sunbird itself (orange breast, green crown, violet band)
    colorsOnDark: { primary: '#FF8A3D', secondary: '#45D6A0', accent: '#A58BFF', dark: '#6B5884', light: '#FFF4EA' },
    // Over the orange and lilac bands: a velvet-plum bird that reads on both
    colors: { primary: '#2A1B38', secondary: '#0F5E45', accent: '#4B2FC0', dark: '#120D18', light: '#FFF4EA' },
    dust: { colors: ['#FFD39A', '#FF8A3D', '#C6B3FF'], amount: 0.32, ambient: true, trail: true },
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
  var leaveTimer = 0, returnTimer = 0, flushTimer = 0, flashTimer = 0, resizeTimer = 0;
  var pendingAsk = null;

  // Cruise in the right page gutter when it is wide enough; otherwise beside the H1.
  function computeLane() {
    var vw = window.innerWidth;
    var gutter = vw - consoleEl.getBoundingClientRect().right;
    return gutter >= 88
      ? { mode: 'gutter', lane: { x: +((vw - gutter / 2) / vw).toFixed(3), y: 0.36 } }
      : { mode: 'top', lane: { x: 0.86, y: 0.16 } };
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
    window.LivingLayer.init(Object.assign({}, SUNBIRD, { lane: laneNow.lane }, extra || null));
    dock();
    lastMask = null; lastDust = null; lastYield = null;
    schedule();
  });

  // Never use setEnabled() here: it would save a "paused" choice for the viewer.
  var llStop = guard(function () {
    clearTimeout(leaveTimer); leaveTimer = 0;
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

    // Top lane: the bird steps aside while the console passes under its lane.
    var yieldNow = false;
    if (laneNow && laneNow.mode === 'top') {
      var y = laneNow.lane.y * vh;
      yieldNow = y >= r.top - 24 && y <= r.bottom + 24;
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

  /* ------------------------------------------------------------------------
   * Focus and scrolling
   * ---------------------------------------------------------------------- */
  function focusForCall() {
    var target = touchOnly.matches ? transcript : textInput;
    if (target) target.focus({ preventScroll: true });
  }

  function scrollConsole() {
    var vh = window.innerHeight;
    if (window.innerWidth >= 1100) {
      var r = consoleEl.getBoundingClientRect();
      if (r.top < 0 || r.bottom > vh) consoleEl.scrollIntoView({ block: 'nearest', behavior: behavior() });
    } else if (instrument) {
      var top = instrument.getBoundingClientRect().top;
      if (top < 0 || top > vh * 0.25) instrument.scrollIntoView({ block: 'start', behavior: behavior() });
    }
  }

  /* ------------------------------------------------------------------------
   * Call lifecycle
   * ---------------------------------------------------------------------- */
  var onLive = guard(function () {
    clearTimeout(returnTimer); returnTimer = 0;

    // The success moment: a loop and a sparkle as a send-off, then the bird
    // fades and is destroyed before any audio can play.
    var ll = window.__livingLayer;
    if (ll && ll.isEnabled() && !reduce.matches) {
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
    if (next === 'live') onLive();
    else if (next === 'idle') onIdle(prev);
  });

  var syncStatus = guard(function () {
    var s = (statusIndicator.className || '').replace('status-indicator', '').trim() || 'idle';
    if (root.getAttribute('data-status') !== s) root.setAttribute('data-status', s);
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
    if (call === 'live') { sendTextBtn.click(); return; }
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
    var fromStory = !consoleEl.contains(b);     // the "Ask this" rows sit below the console
    ask(b.getAttribute('data-ask'));
    if (fromStory) {
      scrollConsole();
      if (call === 'live') focusForCall();
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

  var leahBtn = $('useLeah');
  if (leahBtn && voiceSelect && providerSelect) {
    leahBtn.addEventListener('click', guard(function () {
      voiceSelect.value = 'en-ZA-LeahNeural';
      // Leah is an Edge-TTS voice, so a realtime provider can't speak with her.
      if (providerSelect.value === 'openai' || providerSelect.value === 'elevenlabs') providerSelect.value = 'groq';
      var live = call === 'live';
      say(live ? 'Leah will be used the next time you connect.'
               : 'Voice set to Leah, South African English. Press Connect to talk.');
      voiceSelect.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { voiceSelect.classList.remove('flash'); }, 1200);
      if (live) {
        voiceSelect.scrollIntoView({ block: 'nearest', behavior: behavior() });
        voiceSelect.focus({ preventScroll: true });
      } else {
        scrollConsole();
        connectBtn.focus({ preventScroll: true });
      }
    }));
  }

  var cta = $('talkCta');
  if (cta) {
    cta.addEventListener('click', guard(function (e) {
      e.preventDefault();
      scrollConsole();
      if (call === 'live') focusForCall();
      else connectBtn.focus({ preventScroll: true });
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

  window.addEventListener('scroll', schedule, { passive: true });
  // The console moves when the web fonts arrive (and on any reflow): keep the mask true.
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { schedule(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { schedule(); }).observe(doc.body);
  window.addEventListener('resize', function () {
    schedule();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(guard(function () {
      if (call === 'live' || !window.__livingLayer) return;
      var next = computeLane();
      if (!laneNow || next.mode !== laneNow.mode || Math.abs(next.lane.x - laneNow.lane.x) > 0.01) {
        llStart({ intro: false, reveal: SEEN_ONLY });
      }
    }), 300);
  });

  llStart();
})();
