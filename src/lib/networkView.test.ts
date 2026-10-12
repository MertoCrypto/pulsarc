// Unit tests for src/lib/networkView.ts
// Run: node --experimental-strip-types --no-warnings src/lib/networkView.test.ts

import assert from "node:assert/strict";
import {
  minutesAgo,
  bridgeSpanMinutes,
  chartYMin,
  percentOf,
  windowIncomplete,
  netFlow,
  barWidth,
} from "./networkView.ts";

// ---------------------------------------------------------------------------
// Tiny harness
// ---------------------------------------------------------------------------

let passed = 0;
let total = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  total++;
  try {
    assert.deepStrictEqual(actual, expected);
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof assert.AssertionError ? err.message : String(err);
    console.error(`  FAIL  ${label}`);
    console.error(`        actual  : ${JSON.stringify(actual)}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// minutesAgo
// ---------------------------------------------------------------------------

console.log("\n── minutesAgo ──");

const BASE_MS = 1_700_000_000_000; // a fixed "now"

{
  // 5 minutes before → 5
  const iso5m = new Date(BASE_MS - 5 * 60_000).toISOString();
  check("5 min before → 5", minutesAgo(BASE_MS, iso5m), 5);
}
{
  // 30 s before → floor-at-1 (Math.round(0.5)=1)
  const iso30s = new Date(BASE_MS - 30_000).toISOString();
  check("30 s before → 1", minutesAgo(BASE_MS, iso30s), 1);
}
{
  // exactly now → 1
  const isoNow = new Date(BASE_MS).toISOString();
  check("exactly now → 1", minutesAgo(BASE_MS, isoNow), 1);
}
{
  // 90 s before → Math.round(1.5) = 2
  const iso90s = new Date(BASE_MS - 90_000).toISOString();
  check("90 s before → 2", minutesAgo(BASE_MS, iso90s), 2);
}
{
  // 89 s before → Math.round(1.4833…) = 1
  const iso89s = new Date(BASE_MS - 89_000).toISOString();
  check("89 s before → 1", minutesAgo(BASE_MS, iso89s), 1);
}
{
  // future timestamp (negative diff) → 1
  const isoFuture = new Date(BASE_MS + 60_000).toISOString();
  check("future → 1", minutesAgo(BASE_MS, isoFuture), 1);
}
{
  // 2 hours → 120
  const iso2h = new Date(BASE_MS - 2 * 60 * 60_000).toISOString();
  check("2 h before → 120", minutesAgo(BASE_MS, iso2h), 120);
}

// ---------------------------------------------------------------------------
// bridgeSpanMinutes
// ---------------------------------------------------------------------------

console.log("\n── bridgeSpanMinutes ──");

// blockSpan * 0.5 / 60; Math.max(1, Math.round(...))
check("0 blocks → 1",               bridgeSpanMinutes(0),         1);
check("120 blocks → 1",             bridgeSpanMinutes(120),        1);  // 60/60=1 → max(1,1)=1
check("1200 blocks → 10",           bridgeSpanMinutes(1200),       10); // 600/60=10
check("1800 blocks → 15",           bridgeSpanMinutes(1800),       15); // 900/60=15
check("100 blocks → 1 (round 0.83)",bridgeSpanMinutes(100),        1);  // 50/60≈0.833 → round=1
check("300 blocks → 3 (round 2.5)", bridgeSpanMinutes(300),        3);  // 150/60=2.5 → round=3 (JS rounds .5 up for positive)
check("1_000_000 blocks → 8333",    bridgeSpanMinutes(1_000_000),  8333); // 500000/60≈8333.33 → round=8333

// ---------------------------------------------------------------------------
// chartYMin
// ---------------------------------------------------------------------------

console.log("\n── chartYMin ──");

// empty → reduce keeps 100, floor(100)-1=99, max(0,99)=99
check("empty series → 99",
  chartYMin([]),
  99);

// all null → same as empty (reducer never updates m)
check("all null → 99",
  chartYMin([{ successRate: null }, { successRate: null }]),
  99);

// lowest 97.4 → floor(97.4)=97, 97-1=96
check("lowest 97.4 → 96",
  chartYMin([{ successRate: 97.4 }, { successRate: 99 }, { successRate: null }]),
  96);

// lowest 100 → floor(100)=100, 100-1=99
check("lowest 100 → 99",
  chartYMin([{ successRate: 100 }, { successRate: 100 }]),
  99);

// lowest 0.5 → floor(0.5)=0, 0-1=-1, max(0,-1)=0
check("lowest 0.5 → 0",
  chartYMin([{ successRate: 0.5 }, { successRate: 99 }]),
  0);

// lowest 0 → floor(0)=0, 0-1=-1, max(0,-1)=0
check("lowest 0 → 0",
  chartYMin([{ successRate: 0 }]),
  0);

// null points ignored among numbers: lowest real = 98, floor=98, 98-1=97
check("null ignored, real lowest 98 → 97",
  chartYMin([{ successRate: null }, { successRate: 98 }, { successRate: 100 }]),
  97);

// exact integer 98 → 97
check("exact 98 → 97",
  chartYMin([{ successRate: 98 }]),
  97);

// ---------------------------------------------------------------------------
// percentOf
// ---------------------------------------------------------------------------

console.log("\n── percentOf ──");

check("(1,4) → 25",    percentOf(1, 4),   25);
check("(0,0) → 0",     percentOf(0, 0),   0);  // no NaN
check("(5,0) → 0",     percentOf(5, 0),   0);
check("(0,10) → 0",    percentOf(0, 10),  0);
check("(3,3) → 100",   percentOf(3, 3),   100);
check("(6,4) → 150",   percentOf(6, 4),   150); // part > total

// ---------------------------------------------------------------------------
// windowIncomplete
// ---------------------------------------------------------------------------

console.log("\n── windowIncomplete ──");

// '1h' threshold = 1
check("'1h' 0.5 h → true",  windowIncomplete(0.5, "1h"),  true);
check("'1h' 1 h → false",   windowIncomplete(1,   "1h"),  false);

// '24h' threshold = 24
check("'24h' 23 h → true",  windowIncomplete(23,  "24h"), true);
check("'24h' 24 h → false", windowIncomplete(24,  "24h"), false);
check("'24h' 30 h → false", windowIncomplete(30,  "24h"), false);

// '7d' threshold = 168
check("'7d' 167 h → true",  windowIncomplete(167, "7d"),  true);
check("'7d' 168 h → false", windowIncomplete(168, "7d"),  false);

// ---------------------------------------------------------------------------
// netFlow
// ---------------------------------------------------------------------------

console.log("\n── netFlow ──");

check("(10,4) → {6, in}",   netFlow(10, 4),  { amount: 6, incoming: true });
check("(4,10) → {6, out}",  netFlow(4, 10),  { amount: 6, incoming: false });
check("tie (5,5) → {0, in}",netFlow(5, 5),   { amount: 0, incoming: true });
check("(0,0) → {0, in}",    netFlow(0, 0),   { amount: 0, incoming: true });

// ---------------------------------------------------------------------------
// barWidth
// ---------------------------------------------------------------------------

console.log("\n── barWidth ──");

check("(50,100) → '50.0%'",    barWidth(50, 100),  "50.0%");
check("(1,3) → '33.3%'",       barWidth(1, 3),     "33.3%");   // 33.333… toFixed(1)='33.3'
check("(2,3) → '66.7%'",       barWidth(2, 3),     "66.7%");   // 66.666… toFixed(1)='66.7'
check("max 0 → '0%'",          barWidth(50, 0),    "0%");      // template literal: `${0}%`
check("negative max → '0%'",   barWidth(50, -1),   "0%");
check("value 0, max>0 → '0.0%'",barWidth(0, 100),  "0.0%");    // (0/100*100).toFixed(1)='0.0'
check("(150,100) → '150.0%'",  barWidth(150, 100), "150.0%");  // value > max

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed}/${total} passed`);

if (passed < total) {
  console.error(`${total - passed} test(s) FAILED`);
  process.exit(1);
}

console.log("All tests passed.");
