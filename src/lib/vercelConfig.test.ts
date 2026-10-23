/**
 * Deploy-config guard for the Pulsarc site.
 *
 * Run from the repo root:
 *   node --experimental-strip-types src/lib/vercelConfig.test.ts
 *
 * Reads vercel.json at runtime from process.cwd().
 * Collects ALL failures and asserts once with assert.deepEqual(failures, []).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeaderEntry {
  key: string;
  value: string;
}

interface VercelHeaders {
  source: string;
  headers: HeaderEntry[];
}

interface VercelRewrite {
  source: string;
  destination: string;
}

interface VercelConfig {
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: VercelRewrite[];
  headers?: VercelHeaders[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helper: find a header value by key (case-insensitive) inside a headers block
// Returns undefined when not found.
// ---------------------------------------------------------------------------

function findHeaderValue(
  block: VercelHeaders,
  targetKey: string
): string | undefined {
  const lower = targetKey.toLowerCase();
  return block.headers.find((h) => h.key.toLowerCase() === lower)?.value;
}

// ---------------------------------------------------------------------------
// Self-checks of findHeaderValue (run before the real config is loaded)
// ---------------------------------------------------------------------------

(function selfChecks() {
  const sample: VercelHeaders = {
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "x-frame-options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  };

  // Exact case match
  assert.equal(
    findHeaderValue(sample, "X-Content-Type-Options"),
    "nosniff",
    "self-check: exact-case lookup"
  );

  // Case-insensitive – upper vs lower
  assert.equal(
    findHeaderValue(sample, "x-content-type-options"),
    "nosniff",
    "self-check: lowercase key lookup"
  );

  // Key stored lowercase, queried mixed-case
  assert.equal(
    findHeaderValue(sample, "X-Frame-Options"),
    "SAMEORIGIN",
    "self-check: stored-lowercase queried-mixed"
  );

  // Absent key returns undefined
  assert.equal(
    findHeaderValue(sample, "Content-Security-Policy"),
    undefined,
    "self-check: missing key returns undefined"
  );

  // Empty headers array
  assert.equal(
    findHeaderValue({ source: "/", headers: [] }, "anything"),
    undefined,
    "self-check: empty headers array"
  );
})();

// ---------------------------------------------------------------------------
// Load vercel.json
// ---------------------------------------------------------------------------

const configPath = path.join(process.cwd(), "vercel.json");

let config: VercelConfig;
try {
  config = JSON.parse(readFileSync(configPath, "utf-8")) as VercelConfig;
} catch (err) {
  // Fatal: if we cannot load the file at all we fail immediately with a clear
  // message rather than silently passing.
  throw new Error(
    `Cannot read ${configPath}: ${err instanceof Error ? err.message : String(err)}`
  );
}

// ---------------------------------------------------------------------------
// Collect failures
// ---------------------------------------------------------------------------

const failures: string[] = [];

// Rule 1 – Catch-all rewrite for SPA deep links
// -----------------------------------------------
const catchAllRewrite = (config.rewrites ?? []).find(
  (r) => r.source === "/(.*)" && r.destination === "/index.html"
);
if (!catchAllRewrite) {
  failures.push(
    'Rule 1 [catch-all rewrite]: missing { source: "/(.*)", destination: "/index.html" } in rewrites'
  );
}

// Rule 2 – Security headers on every route
// -----------------------------------------
const securityHeadersBlock = (config.headers ?? []).find(
  (h) => h.source === "/(.*)"
);

if (!securityHeadersBlock) {
  failures.push(
    'Rule 2 [security headers]: no headers entry with source "/(.*)"'
  );
} else {
  // X-Content-Type-Options
  const xcto = findHeaderValue(securityHeadersBlock, "X-Content-Type-Options");
  if (xcto !== "nosniff") {
    failures.push(
      `Rule 2 [X-Content-Type-Options]: expected "nosniff", got ${JSON.stringify(xcto)}`
    );
  }

  // Referrer-Policy
  const rp = findHeaderValue(securityHeadersBlock, "Referrer-Policy");
  if (rp !== "strict-origin-when-cross-origin") {
    failures.push(
      `Rule 2 [Referrer-Policy]: expected "strict-origin-when-cross-origin", got ${JSON.stringify(rp)}`
    );
  }

  // X-Frame-Options
  const xfo = findHeaderValue(securityHeadersBlock, "X-Frame-Options");
  if (xfo !== "SAMEORIGIN") {
    failures.push(
      `Rule 2 [X-Frame-Options]: expected "SAMEORIGIN", got ${JSON.stringify(xfo)}`
    );
  }
}

// Rule 3 – Build settings
// ------------------------
if (config.buildCommand !== "npm run build") {
  failures.push(
    `Rule 3 [buildCommand]: expected "npm run build", got ${JSON.stringify(config.buildCommand)}`
  );
}
if (config.outputDirectory !== "dist") {
  failures.push(
    `Rule 3 [outputDirectory]: expected "dist", got ${JSON.stringify(config.outputDirectory)}`
  );
}

// Rule 4 – No "unsafe-inline" in script-capable directives
// --------------------------------------------------------
// style-src may keep it: React renders style={{}} props as inline style attributes.
// script-src / default-src (the fallback for scripts) / script-src-elem / script-src-attr must not.
for (const block of config.headers ?? []) {
  for (const h of block.headers) {
    for (const directive of h.value.split(";")) {
      const name = directive.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (name === "style-src" || name === "style-src-elem" || name === "style-src-attr") continue;
      if (directive.includes("unsafe-inline")) {
        failures.push(
          `Rule 4 [no unsafe-inline]: header ${JSON.stringify(h.key)} in block source=${JSON.stringify(block.source)} contains "unsafe-inline" in ${JSON.stringify(name || directive.trim())}`
        );
      }
    }
  }
}

// Rule 5 – Three /llama-* rewrites exist and come before the catch-all
// -----------------------------------------------------------------------
// Required proxies: /llama-api, /llama-stables, /llama-icons.
// All three must appear in rewrites BEFORE the catch-all { source: "/(.*)" }.

const rewrites = config.rewrites ?? []
const catchAllIdx = rewrites.findIndex(
  (r) => r.source === "/(.*)" && r.destination === "/index.html"
)

const expectedLlama = [
  { source: "/llama-api/:path*",    destination: "https://api.llama.fi/:path*" },
  { source: "/llama-stables/:path*", destination: "https://stablecoins.llama.fi/:path*" },
  { source: "/llama-icons/:path*",  destination: "https://icons.llamao.fi/:path*" },
]

for (const expected of expectedLlama) {
  const idx = rewrites.findIndex(
    (r) => r.source === expected.source && r.destination === expected.destination
  )
  if (idx === -1) {
    failures.push(
      `Rule 5 [llama rewrites]: missing rewrite { source: "${expected.source}", destination: "${expected.destination}" }`
    )
  } else if (catchAllIdx !== -1 && idx > catchAllIdx) {
    failures.push(
      `Rule 5 [llama rewrites]: rewrite for "${expected.source}" appears AFTER the catch-all "/(.*)" at index ${catchAllIdx} (found at ${idx})`
    )
  }
}

// ---------------------------------------------------------------------------
// Single assertion – all failures reported at once
// ---------------------------------------------------------------------------

assert.deepEqual(
  failures,
  [],
  `vercel.json guard failed with ${failures.length} violation(s):\n${failures.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`
);

console.log("vercel.json guard: all checks passed.");
