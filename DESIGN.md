# Atlas design system: "Sunbird on Air"

A short guide to how the page looks and why, so you can change it or add to it
in the same style. Everything visual lives in three files:

| File | What it holds |
|---|---|
| `frontend/static/css/styles.css` | All tokens (on `:root`) and every style |
| `frontend/templates/index.html` | The markup (one page: masthead, console, four story bands, footer) |
| `frontend/static/js/stage.js` | Presentation glue: state mirrors, the companion bird, the ask flow, focus |

`app.js` and `audio-processor.js` are untouched. `visualizer.js` only had its
three colours changed.

## The idea

The page is a studio with the lights down, where the only lit thing is a voice.
Atlas wears the colours of the **orange-breasted sunbird**, a songbird found only
in South Africa's fynbos:

- its **violet breast band is you** (listening, your messages, your buttons),
- its **orange breast is Atlas's voice** (speaking, and the Connect button),
- its **green crown is "ready"**.

One loud orange word, a wide broadcast typeface where **width means volume**, and
a 3D "voice well" that turns to face you when the call opens.

## Tokens (all in `:root`, styles.css section 1)

**Colours.** Use the token, never a raw hex.

| Token | Hex | Job |
|---|---|---|
| `--velvet` | `#120D18` | Page ground; text on the orange and lilac bands |
| `--velvet-2` | `#1A1322` | Panels, top bar, plates |
| `--velvet-3` / `--velvet-4` | `#251B2F` / `#30243C` | Fields, chips, bubbles / their hover |
| `--hairline` | `#3E3049` | Decorative separators only, never a control edge |
| `--edge` | `#7D6A90` | Control borders (3:1 or better on every velvet) |
| `--ripple` | `#2E2338` | The faint ripples behind the well, never behind small text |
| `--field` | lilac at 32% | The masthead's sound field (decoration only, never behind text); its two innermost loops are orange at 55% |
| `--bone` / `--mist` / `--dusk` | `#F6F0F8` / `#C2B6CF` / `#A493B5` | Text: primary / secondary / meta |
| `--sun` (+ `-hover`, `-press`) | `#FF8A3D` | Atlas's voice: speaking, Connect, the "Talk to" button, the orange band |
| `--amethyst` / `--amethyst-deep` | `#A58BFF` / `#5B3FD1` | You: listening, links, send, the mic in a call |
| `--lilac` / `--lilac-ink` | `#C6B3FF` / `#3B2A63` | Your bubbles, the lilac band, the focus ring on dark |
| `--crown` | `#45D6A0` | Ready / connected |
| `--pollen` | `#FFD39A` | Thinking, tool names |
| `--alarm` | `#FF6B81` | Errors, Disconnect |

Hard rules: never white or bone text on `--sun` (only `--velvet` or `--sun-ink-2`);
on the lilac band only `--velvet` or `--lilac-ink`; no gradient text, no glass, no
glows; nothing that holds text is ever dimmed with opacity. Every text pair is
4.5:1 or better (the lowest on the page is 5.73:1).

**Type.** Three Google Fonts, loaded in `<head>`:

- **Science Gothic** (`--font-display`): headings, the wordmark, the status text,
  the plate sentences. Its width axis is set with `font-stretch`: quiet text is
  condensed (70–72%), whatever Atlas *says* loudly is wide (125–150%).
- **Atkinson Hyperlegible Next** (`--font-text`): everything you read or click.
  A legibility face suits a voice product.
- **Atkinson Hyperlegible Mono** (`--font-mono`): code and data only (tool names
  and results, voice ids, the stack line).

The status text even changes width with the state: 135% speaking, 112% listening,
100% ready, 78% thinking.

**Spacing, radius, shadow, motion.** A 4 px spacing scale (`--s-1` … `--s-12`),
radii from `--r-tail` (6) to `--r-xl` (24) and `--r-pill`, shadows that always
have an offset and a soft blur (`--sh-1`, `--sh-2`, `--sh-lift`, `--sh-plate`),
and three easings (`--ease-out` for entrances, `--ease-flow` for the outward rings,
`--ease-turn` for the Turn: a slow start, then a swing about 4° past facing you
that settles).

**Breakpoints.** Phones under 700 px; tablet 700–1099 px (one column); desktop
1100 px and up (instrument + tuning on the left, conversation on the right);
plus a short-desktop tier (`min-width:1100px and max-height:860px`) with a smaller
well and masthead, so Connect stays above the fold at 1280×720.

## Components

- **Buttons** (`.btn`): `.btn-sun` (orange, the only orange object in the console),
  `.btn-alarm` (Disconnect), `.btn-velvet` (on the lilac band), `.btn-mic` (a 56 px
  circle that never changes size), `.btn-send`, `.ask` chips, and `.btn-ghost`: the
  question buttons in "Ask it something real", a lilac outline (what you say is lilac)
  labelled with the question itself and an arrow.
- **Panels** (`.instrument`, `.tuning`, `.convo`): velvet-2, hairline border, radius 24.
  The top bar is fully opaque velvet-2 (no blur is allowed, so nothing may show through).
- **Status pill** (`#statusIndicator`): its dot colour follows app.js's own classes.
  Its height never changes with the state: under 390 px the provider badge always has
  its own row; from 390 px it shares the row, and on phones error text is set narrower
  (84% width) so "Connection error." still fits beside the badge.
- **Empty state:** "Conversation" is a quiet label, so "Ask it something" is the panel's
  one display heading. From 700 px the empty state fills the panel and centres itself.
  From 1100 px the chips never wrap: one column up to about 1350 px, then 2×2 (tracks
  of at least 17rem; the longest label is 268 px). Under 360 px the chips and the
  question buttons drop to 0.875rem, so every question stays on one line at 320 px.
- **Transcript** (`#transcriptContainer`): the one scroller. Messages scroll inside
  it and can never cover the tools, input or buttons. User bubbles are lilac on the
  right; Atlas's are velvet-3 on the left with a small CSS speaker glyph and, while it
  speaks, a caret at the end of the newest line. Older messages fade out under its top
  edge instead of being cut mid-line (a 16 px mask on the scroller only, never on the
  canvas or its parents); the mask drops while the log has keyboard focus, because it
  would clip the focus ring.
- **Tool activity**: a velvet-3 box with a short scrolling log in mono.
- **Story bands** (`.band` + `.band-sun` / `.band-velvet` / `.band-lilac`): full-bleed
  sections whose content sits in `.page`.
- **Art**: all hand-authored SVG and CSS (mark and favicon, the ripples behind the
  well, the masthead sound field, the plate waveforms, the closing echo of the well,
  the icons in Lucide geometry, the two-tone barge-in glyph). No photos or rasters.
- **The closing echo** (`.echo`, §D): the voice well again in CSS 3D, now facing you
  with its mouth turned toward "Talk to Atlas" (the page opens with it tipped back).
  From 960 px it sits beside the copy; below that it is a compact 168 px mark under
  "Talk to Atlas", its depth scaled down with it (`--echo-z`). Static, `aria-hidden`;
  the kit tilts it toward a mouse only.

## The signature 3D moment: the Turn

The old avatar ring became the **voice well**: seven rings in CSS 3D over an orange
core (`.well` inside `#avatarRing`). It rests tipped back at 62° and breathes twice.
At rest its rings glow from lilac at the rim to orange at the throat, and the whole
well is lifted (`--well-lift`, on `.avatar-ring` and the ripples, so the projection
is unchanged) so the core sits in the throat, above the horizon line. On Connect it
waits 0.2 s for the console to scroll into place, then turns to face you over 1.3 s,
swings about 4° past and settles, dropping back to centre as it turns; the core's
green flash lands as it settles. While you talk, flow rings travel into the well, and
while Atlas speaks they travel out toward you; thinking turns the core over; an error
in a call slumps it to 14°. Every flow is finite, and under reduced motion it is fully
static (the Turn becomes an instant swap; state still shows in colour and in the
status text).

Rules if you touch it: never put `opacity`, `filter`, `overflow` or `clip-path` on
`.voice`, `.avatar-ring` or `.well` (it flattens the 3D), and never transform or
hide the visualizer canvas or its parents (it is measured once at load). app.js
rewrites the className of `#statusIndicator` and `#avatarRing`, so hooks go on
`html[data-call]` / `html[data-status]` (set by stage.js) or on child elements.

A supporting 3D figure, the **Sentence Line** in "How it works", shows the README's
mechanism: three velvet plates in a receding corridor, one spoken, one being voiced,
one still being written. It plays once when it scrolls into view. Below 1180 px the
section stacks, so the figure gets the full page width; from 1180 px it sits beside
the copy, with a narrower, shallower corridor up to 1399 px. Every plate ends inside
its stage and every plate's label stays visible at every width (measured from 320 to
1920 px); the stage's clip margin lets the soft shadows fade out instead of ending in
a hard line.

## Motion

CSS transitions and keyframes plus the living-layer kit; no animation library.
Everything that moves is inside `@media (prefers-reduced-motion: no-preference)`,
and content is visible by default. The first viewport has one authored sequence:
the loud word widens (0.2–1.1 s), one orange ripple leaves the sound field's inner
loops and dissolves at its edge (from 1.1 s, 1.4 s, once; a scaled copy of the
innermost loop, right of the H1), and the sunbird arrives (1.4 s). During a call the
only motion is state feedback (the well, the status width, bubbles fading in) plus
the live visualizer.

## Living layer (the companion)

- **Character:** `sunbird`, dressed as the orange-breasted sunbird
  (*Anthobaphes violacea*): orange wings and breast, green crown, violet chest band
  over the velvet; a velvet-plum version over the orange and lilac bands so it always
  reads. A South African songbird for a South African voice product, whose plumage
  *is* Atlas's state system.
- **Family note:** this is the family's third sunbird (intuthuko and
  lethabo_legal_pal are both green); this one is the only orange-and-violet one.
- **Where it lives:** only before a call. It flies in on load, cruises in the right
  gutter on desktop (beside the H1 on tablets; on phones level with the short first
  line, "Atlas", clear of the longer lines), and perches beside the H1 and the band
  headings, and on the corners of the "Spoken" plate (the sentence Atlas just said)
  and the "Talk to Atlas" button (`data-perch="corner"`). It never perches in the
  console, and its dust is masked out of the console band. Where it cruises above the
  content (phones and tablets) it steps aside while the console passes under its
  lane, and when the reader stops with words under it and no perch in view; it comes
  back as soon as they scroll or it heads for a perch. When you press
  Connect it loops and sparkles once as a send-off, then is destroyed for the whole
  call (no animation loop runs during audio). When a question is on its way (a chip,
  a question button, or Enter before a call) it leaves at once instead, and if the call gets
  busy during the send-off (listening, thinking, speaking) it leaves then, so it never
  shares the screen with a working call. It flies back in after Disconnect. The pause
  button ("Moving effects") sits at the right of the top bar; a visitor's pause is
  remembered.
- **Size and dust:** 68 px wingspan from 1280 px, where the gutter has room for it,
  58 px below and about 46 on phones (set at every start, and again when the window
  crosses 1280 px), with dust at 0.45, so the bird reads as the main character next
  to the 88 px headline. Scrolling holds 16.7 ms frames.
- **3D touches:** tilt on the voice well (before a call), the plates and the closing
  echo, parallax depth on the ripples and the sound field, 3D reveals on the tools
  ledger and the engine and voice lists only, and a magnetic "Talk to Atlas" button.
- **How to change it:** edit the `SUNBIRD` object at the top of
  `frontend/static/js/stage.js`: `size` (wingspan in px), `colorsOnDark` and `colors`
  (the two palettes), `dust.amount` (0–1) or `dust: false`, `introDelay`, `calm: true`
  for a gentler bird, or `character` for another species (`birdSize()` sets the size
  tiers). Mark new landing spots with
  `data-perch` on a short heading. Never edit `living-layer.js` (v1.2.0, copied
  unchanged from the shared kit; to update it, copy the new file over it), and never
  call `__livingLayer.setEnabled()` from code: it saves a "paused" choice for the
  visitor.

## Behaviour added in stage.js (app.js untouched)

- The question chips, the question buttons in "Ask it something real", and
  Enter/Send before a call connect first, then send the question once.
- "Use Leah's voice" sets the voice and announces it. Leah is an Edge-TTS voice, so
  if OpenAI Realtime or ElevenLabs is chosen the provider switches to Groq: at once
  when no call is open, otherwise when the call ends (app.js reads the provider live
  during a call, so switching it mid-call would break the call). The voice is safe to
  set at any time, because app.js reads it only when connecting.
- The Provider select is locked from Connect until the call ends, for the same
  reason. Voice and Tools stay editable and apply next time you connect.
- Focus repair: after Connect, focus moves to the text field (on touch-only devices
  to the conversation instead, so the on-screen keyboard doesn't cover the answer);
  after Disconnect, back to Connect; and after a question chip is used during a call
  (app.js hides the empty state it sat in), to the text field.
- On connect (and for a question button or "Talk to Atlas" during a call) the
  console scrolls into view and the element that has focus ends fully on screen. On
  desktop a console that fits the window is shown whole. In one column the instrument
  is pinned to the top unless that would push the focused field below the fold; then
  the page scrolls only as far as it takes to show the field whole, keeping as much of
  the well as fits (at 820×600 the call bar and conversation stay in view). Focus moves
  first, positions are worked out up front, and the scroll is always issued, so it
  replaces a scroll still in flight (for example the browser's own scroll to a link
  that was just focused). Measured at 15 window sizes from 360×640 to 1440×900.

Each is additive and can be removed on its own.

## Accessibility decisions

- State changes are announced from `#srStatus`, an sr-only `role="status"` copy that
  stage.js updates only when the status words change, skipping the interim
  "Hearing: '…'" text. The visible pill is not a live region, because app.js rewrites
  the same "Speaking..." on every audio chunk (42 writes became 7 announcements in one
  reply). The transcript is a focusable `role="log"` with `aria-live="off"`: Atlas
  already speaks its replies, and streamed text would be read twice.
- The console's source order is instrument, conversation, then settings, matching the
  phone and tablet layout, so Tab follows what you see (on desktop it goes left top,
  right, then left bottom). The grid places the panels by area name, so the layout
  doesn't depend on the order.
- Visible focus everywhere (lilac on dark, velvet on the bands), a skip link to the
  console, labelled mic, send and message field, buttons and chips 44 px or taller
  (the effects toggle is 40 px; the Tools checkbox is 22 px with its label as part of
  the target), no horizontal scroll at 320–390 px, forced-colours rules, and full
  reduced-motion support.

## Values tuned during the build (the brief allowed ±10%; larger changes noted)

- Desktop tuning panel: Tools and the note sit in a row under the two selects
  (the brief had a third column), because a third column clipped
  "Groq + Llama 3.3 (Free)" at 1440 px. The console row ends 18 px below a 900 px fold.
- Phone status text 0.875rem (brief 0.9375) so "Ready to connect" fits beside the badge at 390 px.
- The H1's line height is 0.96 from 700 px (it was 0.92), so the descender of "speaks"
  clears "it" on the line below; phones keep 0.92.
- Sentence Line plates (x, y, z offsets for p2 and p3):
  - 960 px and up: stage 504 px, plate width `min(470px, 82%)`, p2 (64, 124, −150),
    p3 (128, 268, −300), scene `rotateX(12deg) rotateY(-24deg)`. Below 1180 px the
    section stacks, so this corridor has the full page width.
  - 1180–1399 px (beside the copy in a 564–674 px column): plate width
    `min(430px, 74%)`, sentences at 1.4375rem, p2 x 44, p3 x 88, scene
    `rotateY(-18deg)`. The third plate ends 22–126 px inside its stage at 960–1920 px
    (it was cut by up to 106 px at 960–1365 px before).
  - Under 960 px: stage 476 px, p2 (14, 112, −80), p3 (28, 252, −160); under 420 px:
    stage 520 px, p2 y 128, p3 y 290, so every label clears the plate in front of it.
  - The stage keeps `overflow: clip` with `overflow-clip-margin: 40px`, so shadows fade
    out past its edge; the bands' `overflow-x: clip` is what stops sideways scrolling
    on phones.
- The well: `--core-z` −112 px (desktop), −96 px (short desktop), −92 px (phones);
  `--well-lift` −24 px (−20 px on phones). The core's bottom sits 13–15 px above the
  horizon line in all three tiers (it hung 26–31 px below it). Rings are 2 px with a
  gentler depth fade (6% per ring).
- The masthead sound field: `clamp(360px, 40vw, 560px)` wide, as tall as the masthead,
  lilac at 32% with its two innermost loops orange at 55%, its visible lines at least
  32 px clear of the H1.
- The voice list is one column at 960–1279 px, and every id has `<wbr>` after its
  locale prefix, so no id breaks mid-word at any width.
- Measured: Connect's bottom edge is 756 px at 1440×900, 669 px at 1280×720,
  680 px at 390×844 and 707 px at 360×740.

## How to add a new section in this style

```html
<section id="faq" class="band band-velvet" aria-labelledby="faq-title">
  <div class="page">
    <h2 id="faq-title" class="d2" data-perch>Short heading, one idea.</h2>
    <p class="lede">One line that says what the section gives you.</p>
    <!-- a list or a ledger, not a row of identical cards -->
  </div>
</section>
```

1. Pick the ground: `band-velvet` for most sections; `band-sun` or `band-lilac`
   for one big moment each (they set the focus ring to velvet for you). Alternate
   grounds so two coloured bands never touch.
2. Headings use `.d2`. At most one wide word per heading (`<span class="loud">`).
   No eyebrow labels and no section numbers.
3. Text colours: bone/mist/dusk on velvet; velvet and `--sun-ink-2` on orange;
   velvet and `--lilac-ink` on lilac.
4. Add `data-perch` to the heading if the bird should land there (short headings
   only, never body text). Add `data-reveal-3d` only to a list below the fold, never
   to headings or anything inside the console.
5. Add a nav link in `.topnav` if it deserves one, and keep new copy to facts the
   README supports.

## Checking your change

Run the stubbed local server (no real keys or network) and the checks:
`pytest` (22 tests), a look at 1440×900 and 390×844, and with reduced motion on.
The transcript must still scroll inside its box, every id that app.js uses must
still exist once, and the companion must stay out of calls.
