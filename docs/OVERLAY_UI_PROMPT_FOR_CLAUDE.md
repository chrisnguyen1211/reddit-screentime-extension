# Prompt — Design overlay UI for Reddit Growth Lab

Copy everything below the line into Claude (or design tool) to generate polished HTML/CSS for the on-page status overlay.

---

## Role
You are a senior product designer + front-end engineer. Design a **floating status overlay** for a Chrome extension that runs on reddit.com.

## Product context
**Reddit Growth Lab** automates human-like browsing:
- Scroll feed with uneven rhythm
- Occasional upvote
- Sometimes open a post, read comments
- **Auto comment/reply**: generate with LLM → simulate typing time based on word count → fill Reddit’s comment field → click Comment/Reply

The overlay must show live state so the user trusts the bot is “human-paced”, not stuck or spamming.

## Placement & constraints
- Fixed corner: **bottom-right** (default), 16px inset
- Must not block Reddit’s main composer or primary CTA
- Width ~240–300px; max-height ~200px with internal scroll if needed
- `pointer-events: none` by default (display only)
- Optional: tiny “pin” hit area if you add a collapse control (`pointer-events: auto` only on that control)
- Works on light/dark Reddit; prefer **dark glass** panel that fits Reddit’s orange accent `#FF4500`
- Support `prefers-reduced-motion`
- No external fonts/images (system font stack only)
- z-index high but below modal dialogs if possible (`2147483000` range)

## Information architecture (must show)

### Header row
- Mode badge: `OBS` | `ENG` | `FULL` (color-coded: gray / orange / red)
- Phase: `FEED` | `POST` | `COMMENTING` | `COOLDOWN` | `OFF`
- Energy % (0–100) as a thin progress bar

### Metrics row (compact)
- Scrolls count
- Upvotes count  
- Comments posted count
- Optional: posts opened

### Job block (only when commenting)
Show a mini timeline of the current comment job:
1. DWELL (reading target)
2. GENERATING (LLM)
3. THINKING
4. TYPING — **critical**: show `12/34s · 22 words @ 37 wpm`
5. REREAD
6. SUBMIT
7. DONE / FAIL

Highlight active step. If FAIL, show one-line error.

### Rhythm / anti-bot strip
- Live `scroll speed`
- Live `comment chance %`
- Live `typing wpm`
- Budget: `2/4 hour · next gap ~6m`
- Engagement gate: `on` / skip reason `low eng`

### Footer
- `9router: ok | down`
- Model id truncated (`grok-4`)
- One calm status sentence, e.g. “Typing reply like a mobile user…”

## Visual direction
- Aesthetic: **ops dashboard meets Reddit** — dense but calm, not gamer HUD, not crypto neon
- Reddit orange only as accent (mode FULL, active step, energy fill)
- Rounded 12–14px, subtle border, soft shadow
- Monospace for numbers/timers; sans for labels
- Collapsed state: 40×40 pill showing only mode + phase color
- Expanded state: full panel (design both)

## Interaction (optional, if pointer-events on chrome)
- Click header to collapse/expand
- No other controls (STOP lives in extension popup)

## Deliverables
1. **Single HTML file** with embedded CSS (and minimal JS only for collapse toggle demo)
2. **Mock states** as sections or data attributes you can switch:
   - `data-state="feed"`
   - `data-state="typing"`
   - `data-state="fail"`
   - `data-state="cooldown"`
3. CSS variables for colors
4. Short note: how to map fields to our JS object:

```js
{
  mode: "full",
  phase: "COMMENTING",
  energy: 0.48,
  stats: { scrolls, upvotes, comments, opens },
  job: {
    phase: "TYPING",
    kind: "comment", // or "post"
    wordCount: 22,
    typingMs: 34000,
    typingElapsedMs: 18000,
    thinkMs, rereadMs, error
  },
  live: { scrollSpeed, commentChance, commentWpm, minGapSec },
  budget: { commentsThisHour: 2, maxHour: 4, nextGapSec: 360 },
  health: { routerOk: true, model: "xai/grok-4" }
}
```

## Accessibility
- Contrast AA for text on panel
- Don’t rely on color alone for FAIL vs DONE (use icon/text)

## Out of scope
- Don’t redesign the Bram mascot speech bubble
- Don’t add settings forms inside the overlay

## Success criteria
A developer can paste your CSS into `content.css` under `#rgl-overlay` / `.rgl-overlay*` and wire the data object above in <30 minutes.
