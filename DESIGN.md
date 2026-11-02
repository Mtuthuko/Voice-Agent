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
| `--ripple` | `#2E2338` | The faint contour lines, never behind small text |
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
and two easings (`--ease-out` for entrances and the Turn, `--ease-flow` for the
outward rings).

**Breakpoints.** Phones under 700 px; tablet 700–1099 px (one column); desktop
1100 px and up (instrument + tuning on the left, conversation on the right);
plus a short-desktop tier (`min-width:1100px and max-height:860px`) with a smaller
well and masthead, so Connect stays above the fold at 1280×720.

## Components

- **Buttons** (`.btn`): `.btn-sun` (orange, the only orange object in the console),
  `.btn-alarm` (Disconnect), `.btn-velvet` (on the lilac band), `.btn-mic` (a 56 px
  circle that never changes size), `.btn-send`, `.ask` chips, `.btn-ghost` ("Ask this").
- **Panels** (`.instrument`, `.tuning`, `.convo`): velvet-2, hairline border, radius 24.
- **Status pill** (`#statusIndicator`): its dot colour follows app.js's own classes.
- **Transcript** (`#transcriptContainer`): the one scroller. Messages scroll inside
  it and can never cover the tools, input or buttons. User bubbles are lilac on the
  right; Atlas's are velvet-3 on the left with a small CSS speaker glyph and, while it
  speaks, a caret at the end of the newest line.
- **Tool activity**: a velvet-3 box with a short scrolling log in mono.
- **Story bands** (`.band` + `.band-sun` / `.band-velvet` / `.band-lilac`): full-bleed
  sections whose content sits in `.page`.
- **Art**: all hand-authored SVG and CSS (mark and favicon, the ripples behind the
  well, the masthead contour field, the plate waveforms, the icons in Lucide geometry,
  the two-tone barge-in glyph). No photos or rasters.

## The signature 3D moment: the Turn

The old avatar ring became the **voice well**: seven rings in CSS 3D over an orange
core (`.well` inside `#avatarRing`). It rests tipped back at 62° and breathes twice;
on Connect it turns to face you (0°) with a green flash in the core; while you talk,
flow rings travel into the well, and while Atlas speaks they travel out toward you;
thinking turns the core over; an error in a call slumps it to 14°. Every flow is
finite, and under reduced motion it is fully static (the Turn becomes an instant
swap; state still shows in colour and in the status text).

Rules if you touch it: never put `opacity`, `filter`, `overflow` or `clip-path` on
`.voice`, `.avatar-ring` or `.well` (it flattens the 3D), and never transform or
hide the visualizer canvas or its parents (it is measured once at load). app.js
rewrites the className of `#statusIndicator` and `#avatarRing`, so hooks go on
`html[data-call]` / `html[data-status]` (set by stage.js) or on child elements.

A supporting 3D figure, the **Sentence Line** in "How it works", shows the README's
mechanism: three velvet plates in a receding corridor, one spoken, one being voiced,
one still being written. It plays once when it scrolls into view.

## Motion

CSS transitions and keyframes plus the living-layer kit; no animation library.
Everything that moves is inside `@media (prefers-reduced-motion: no-preference)`,
and content is visible by default. During a call the only motion is state feedback
(the well, the status width, bubbles fading in) plus the live visualizer.

## Living layer (the companion)

- **Character:** `sunbird`, dressed as the orange-breasted sunbird
  (*Anthobaphes violacea*): orange wings and breast, green crown, violet chest band
  over the velvet; a velvet-plum version over the orange and lilac bands so it always
  reads. A South African songbird for a South African voice product, whose plumage
  *is* Atlas's state system.
- **Family note:** this is the family's third sunbird (intuthuko and
  lethabo_legal_pal are both green); this one is the only orange-and-violet one.
- **Where it lives:** only before a call. It flies in on load, cruises in the right
  gutter on desktop (beside the H1 on phones and tablets), and perches beside the
  H1 and the band headings. It never perches in the console, its dust is masked out
  of the console band, and on phones it steps aside while the console passes under
  its lane. When a call opens it loops and sparkles once as a send-off, then is
  destroyed for the whole call (no animation loop runs during audio). It flies back
  in after Disconnect. The pause button ("Moving effects") sits at the right of the
  top bar; a visitor's pause is remembered.
- **3D touches:** tilt on the voice well (before a call) and the plates, parallax
  depth on the ripples and the contour field, 3D reveals on the tools ledger and the
  engine and voice lists only, and a magnetic "Talk to Atlas" button.
- **How to change it:** edit the `SUNBIRD` object at the top of
  `frontend/static/js/stage.js`: `size` (wingspan in px), `colorsOnDark` and `colors`
  (the two palettes), `dust.amount` (0–1) or `dust: false`, `introDelay`, `calm: true`
  for a gentler bird, or `character` for another species. Mark new landing spots with
  `data-perch` on a short heading. Never edit `living-layer.js` (v1.2.0, copied
  unchanged from the shared kit; to update it, copy the new file over it), and never
  call `__livingLayer.setEnabled()` from code: it saves a "paused" choice for the
  visitor.

## Behaviour added in stage.js (app.js untouched)

- The question chips, the "Ask this" rows, and Enter/Send before a call connect
  first, then send the question once.
- "Use Leah's voice" sets the voice (and the provider to Groq if a realtime provider
  was chosen, since Leah is an Edge-TTS voice) and announces it.
- Focus repair: after Connect, focus moves to the text field (on touch-only devices
  to the conversation instead, so the on-screen keyboard doesn't cover the answer);
  after Disconnect, back to Connect.
- On connect, the console scrolls into view.

Each is additive and can be removed on its own.

## Accessibility decisions

- `#statusIndicator` is `role="status"`, so state changes are announced. The
  transcript is a focusable `role="log"` with `aria-live="off"`: Atlas already speaks
  its replies, and streamed text would be read twice. A known trade-off: in pipeline
  mode the status announces "Hearing: '…'" as you talk, which is chatty.
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
- Sentence Line plates, desktop: stage 470 px, plate width `min(470px, 82%)`, offsets
  p2 (64, 124, −150) and p3 (128, 268, −300); phones: stage 440 px, p2 (14, 108, −80),
  p3 (28, 222, −160). The x offsets shrank more than 10% so the third plate isn't cut
  at the edge, and the y offsets grew so every plate's label stays visible.
- The bands use `overflow-x: clip` so 3D reveals can't widen the page on phones.
- Measured: Connect's bottom edge is 749 px at 1440×900, 663 px at 1280×720 and
  680 px at 390×844.

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
