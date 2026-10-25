/**
 * Styles for the galaxy stage that Tailwind classes do not express cleanly: planet and port states driven
 * by data attributes (the scene sets data-active, React sets data-lit), glass panels, and the film grain.
 * Colours are rgba() literals on purpose.
 *
 * Safari perf notes (no backdrop-filter over animating canvas, no mix-blend-mode over canvas):
 * - .om-face: opaque fill, no backdrop-filter.
 * - .om-chip: opaque fill, no backdrop-filter.
 * - .om-glass: blur kept only when NOT overlapping the canvas stage (.om-glass--flat for overlapping panels).
 * - .om-grain: opacity only, normal blend (no mix-blend-mode).
 * - .om-stage: contain + isolate so compositing is bounded.
 */
export const STAGE_CSS = `
.om-stage[data-paused='true'] *, .om-stage[data-paused='true'] *::before { animation-play-state: paused !important; }

/* Stage root: bound the compositing layer for Safari. */
.om-stage { contain: layout paint style; isolation: isolate; }

.om-face {
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  border: 1px solid rgba(169,196,234,0.3);
  background: rgba(14,33,64,0.94);
  box-shadow: 0 0 22px rgba(59,123,255,0.3), inset 0 1px 0 rgba(255,255,255,0.12);
  transition: border-color .3s, box-shadow .3s;
}
.om-node:hover .om-face, .om-node[data-active='true'] .om-face {
  border-color: #a9c4ea; box-shadow: 0 0 34px rgba(169,196,234,0.6), inset 0 1px 0 rgba(255,255,255,0.18);
}
.om-label {
  margin-top: 6px; white-space: nowrap; font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #8da2c0; transition: color .3s;
}
.om-port .om-label { max-width: 92px; overflow: hidden; text-overflow: ellipsis; font-size: 9px; letter-spacing: 0.08em; }
.om-node:hover .om-label, .om-node[data-active='true'] .om-label { color: #ffffff; }
.om-note {
  pointer-events: none; position: absolute; left: 50%; top: 100%; margin-top: 22px; transform: translateX(-50%);
  white-space: nowrap; border-radius: 6px; border: 1px solid rgba(170,196,234,0.14);
  background: rgba(11,24,44,0.95); padding: 4px 10px; font-size: 11px; color: #8da2c0;
  opacity: 0; transition: opacity .2s;
}
.om-node:hover .om-note, .om-node[data-active='true'] .om-note { opacity: 1; }

.om-port-body { display: flex; flex-direction: column; align-items: center; opacity: 0.55; transition: opacity .5s; }
.om-port[data-lit='true'] .om-port-body, .om-port:hover .om-port-body, .om-port[data-active='true'] .om-port-body { opacity: 1; }
.om-port[data-lit='true'] .om-face {
  border-color: rgba(169,196,234,0.9);
  box-shadow: 0 0 0 3px rgba(169,196,234,0.16), 0 0 26px rgba(169,196,234,0.5), inset 0 1px 0 rgba(255,255,255,0.18);
}
/* Port icon: absolutely positioned over the face at full opacity. */
.om-port-icon {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; justify-content: center;
  opacity: 1; pointer-events: none; z-index: 1;
}
/* Free-body glow: periwinkle, strength follows --port-weight (0–1). */
.om-port .om-face {
  box-shadow:
    0 0 calc(12px + var(--port-weight, 0.5) * 24px) rgba(169,196,234,calc(0.15 + var(--port-weight, 0.5) * 0.35)),
    inset 0 1px 0 rgba(255,255,255,0.12);
}
/* Lite mode (set by the scene at quality level >= 1): drop the glow shadows, which WebKit re-rasterises
   per layer. Border colours for lit / hover / active keep working; only box-shadow and its transition go. */
.om-stage[data-lite='true'] .om-face,
.om-stage[data-lite='true'] .om-port .om-face {
  box-shadow: none; transition: border-color .3s;
}
.om-badge {
  position: absolute; right: -6px; top: -6px; min-width: 16px; border-radius: 999px; padding: 0 4px;
  background: #a9c4ea; color: #0a1424; text-align: center; line-height: 16px;
  font-family: 'Geist Mono', ui-monospace, monospace; font-size: 9px; font-weight: 600;
}

/* .om-glass: blur only for panels NOT overlapping the canvas (below the stage, in normal flow). */
.om-glass {
  border: 1px solid rgba(169,196,234,0.18); border-radius: 16px;
  background: rgba(11,24,44,0.55); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
}
/* .om-glass--flat: opaque, no blur — use wherever a glass panel overlaps the animating stage canvas. */
.om-glass--flat {
  border: 1px solid rgba(169,196,234,0.18); border-radius: 16px;
  background: rgba(11,24,44,0.9);
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
.om-chip {
  display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 6px 12px;
  border: 1px solid rgba(169,196,234,0.18); background: rgba(11,24,44,0.78);
  font-family: 'Geist Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: #8da2c0;
}
button.om-chip { cursor: pointer; transition: color .2s, border-color .2s, background .2s; }
button.om-chip:hover { color: #eaf1fb; border-color: rgba(169,196,234,0.4); }
button.om-chip[aria-pressed='true'] { color: #a9c4ea; border-color: rgba(169,196,234,0.5); background: rgba(169,196,234,0.1); }

/* Grain: normal blend, opacity only — mix-blend-mode over a canvas is expensive in Safari. */
.om-grain {
  pointer-events: none; position: absolute; inset: 0; z-index: 4; opacity: 0.035;
  background-image:
    repeating-radial-gradient(circle at 17% 32%, rgba(255,255,255,0.9) 0 0.5px, transparent 0.5px 3px),
    repeating-radial-gradient(circle at 83% 71%, rgba(255,255,255,0.7) 0 0.4px, transparent 0.4px 4px);
}
`
