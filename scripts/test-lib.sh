#!/usr/bin/env bash
# Runs every plain-node test of the site (src/**/*.test.ts) with type stripping. Exits 1 if any fails.
set -u
fail=0
count=0
for f in $(find src -name '*.test.ts' | sort); do
  count=$((count+1))
  if out=$(node --experimental-strip-types --no-warnings "$f" 2>&1); then
    echo "ok   $f"
  else
    echo "FAIL $f"; echo "$out" | tail -15; fail=$((fail+1))
  fi
done
echo "$count test files, $fail failed"
[ "$fail" -eq 0 ]
