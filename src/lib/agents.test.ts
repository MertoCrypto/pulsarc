// Unit tests for toAgent() in agents.ts
// Run with: node --experimental-strip-types --no-warnings src/lib/agents.test.ts

import assert from 'node:assert/strict'
import { toAgent } from './agents.ts'
import type { RawInstance } from './agents.ts'

// ── Tiny test harness ─────────────────────────────────────────────────────────

let pass = 0
let total = 0

function check(label: string, actual: unknown, expected: unknown): void {
  total++
  try {
    assert.deepEqual(actual, expected)
    console.log(`  ✔ ${label}`)
    pass++
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`  ✘ ${label}`)
    console.error(`    ${msg.split('\n').join('\n    ')}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function raw(overrides: Partial<RawInstance> & { metadata?: Record<string, unknown> | null } = {}): RawInstance {
  return {
    id: 'agent-1',
    owner: { hash: '0xabc' },
    metadata: {},
    ...overrides,
  }
}

// ── 1. Full valid record ──────────────────────────────────────────────────────

console.log('\n1. Full valid record')
{
  const r = raw({
    id: 'agent-42',
    owner: { hash: '0xdeadbeef' },
    metadata: {
      name: 'My Agent',
      description: 'Does things',
      active: true,
      x402Support: true,
      tags: ['defi', 'payments'],
      services: [
        { name: 'Swap', endpoint: 'https://example.com/swap' },
      ],
    },
  })
  const a = toAgent(r)
  check('id', a.id, 'agent-42')
  check('owner = owner.hash', a.owner, '0xdeadbeef')
  check('name', a.name, 'My Agent')
  check('description', a.description, 'Does things')
  check('active', a.active, true)
  check('x402', a.x402, true)
  check('tags', a.tags, ['defi', 'payments'])
  check('services', a.services, [{ name: 'Swap', endpoint: 'https://example.com/swap' }])
}

// ── 2. metadata null → all defaults ──────────────────────────────────────────

console.log('\n2. metadata null')
{
  const a = toAgent(raw({ metadata: null }))
  check('name null', a.name, null)
  check('description null', a.description, null)
  check('active null', a.active, null)
  check('x402 false', a.x402, false)
  check('tags []', a.tags, [])
  check('services []', a.services, [])
}

// ── 3. name / description: non-string inputs → null ──────────────────────────

console.log('\n3. name/description — non-string inputs')
{
  check('name number', toAgent(raw({ metadata: { name: 42 } })).name, null)
  check('name object', toAgent(raw({ metadata: { name: {} } })).name, null)
  check('name array', toAgent(raw({ metadata: { name: ['a'] } })).name, null)
  check('name null', toAgent(raw({ metadata: { name: null } })).name, null)
  check('description number', toAgent(raw({ metadata: { description: 0 } })).description, null)
  check('description object', toAgent(raw({ metadata: { description: {} } })).description, null)
  check('description array', toAgent(raw({ metadata: { description: [] } })).description, null)
  check('description null', toAgent(raw({ metadata: { description: null } })).description, null)
}

// ── 4. name / description: whitespace-only → null ────────────────────────────

console.log('\n4. name/description — whitespace-only')
{
  check('name spaces only', toAgent(raw({ metadata: { name: '   ' } })).name, null)
  check('name tabs only',   toAgent(raw({ metadata: { name: '\t\n' } })).name, null)
  check('desc spaces only', toAgent(raw({ metadata: { description: '  ' } })).description, null)
}

// ── 5. name / description: trimming ──────────────────────────────────────────

console.log('\n5. name/description — trimming')
{
  check('name trimmed',        toAgent(raw({ metadata: { name: '  Hello  ' } })).name, 'Hello')
  check('description trimmed', toAgent(raw({ metadata: { description: '\t Hi \n' } })).description, 'Hi')
}

// ── 6. name: 80-char boundary ────────────────────────────────────────────────

console.log('\n6. name — 80-char boundary (trim happens before slice)')
{
  const exactly80 = 'a'.repeat(80)
  const exactly81 = 'a'.repeat(81)
  // Trim a string that is already 80 chars of 'a': stays 80
  check('name 80 chars stays', toAgent(raw({ metadata: { name: exactly80 } })).name, exactly80)
  // 81 chars of 'a': cut to 80
  check('name 81 chars cut to 80', toAgent(raw({ metadata: { name: exactly81 } })).name?.length, 80)
  // Leading space + 80 chars: after trim = 80 chars, slice(0,80) = 80 chars
  const spacePlus80 = ' ' + exactly80
  check('name " "+80a trimmed then sliced stays 80', toAgent(raw({ metadata: { name: spacePlus80 } })).name, exactly80)
  // Leading space + 81 chars: after trim = 81 chars, cut to 80
  const spacePlus81 = ' ' + exactly81
  check('name " "+81a trimmed then cut to 80', toAgent(raw({ metadata: { name: spacePlus81 } })).name?.length, 80)
}

// ── 7. description: 280-char boundary ────────────────────────────────────────

console.log('\n7. description — 280-char boundary')
{
  const d280 = 'b'.repeat(280)
  const d281 = 'b'.repeat(281)
  check('desc 280 chars stays', toAgent(raw({ metadata: { description: d280 } })).description, d280)
  check('desc 281 chars cut to 280', toAgent(raw({ metadata: { description: d281 } })).description?.length, 280)
}

// ── 8. active: boolean values ────────────────────────────────────────────────

console.log('\n8. active — boolean vs non-boolean')
{
  check('active true',    toAgent(raw({ metadata: { active: true  } })).active, true)
  check('active false',   toAgent(raw({ metadata: { active: false } })).active, false)
  check('active "true"',  toAgent(raw({ metadata: { active: 'true' } })).active, null)
  check('active 1',       toAgent(raw({ metadata: { active: 1 } })).active, null)
  check('active null',    toAgent(raw({ metadata: { active: null } })).active, null)
  check('active missing', toAgent(raw({ metadata: {} })).active, null)
}

// ── 9. x402: only boolean true on x402Support ────────────────────────────────

console.log('\n9. x402 — only boolean true on x402Support')
{
  check('x402Support true',    toAgent(raw({ metadata: { x402Support: true    } })).x402, true)
  check('x402Support false',   toAgent(raw({ metadata: { x402Support: false   } })).x402, false)
  check('x402Support "true"',  toAgent(raw({ metadata: { x402Support: 'true'  } })).x402, false)
  check('x402Support 1',       toAgent(raw({ metadata: { x402Support: 1       } })).x402, false)
  check('x402Support missing', toAgent(raw({ metadata: {}                      })).x402, false)
}

// ── 10. tags: not an array → [] ──────────────────────────────────────────────

console.log('\n10. tags — non-array inputs')
{
  check('tags string',  toAgent(raw({ metadata: { tags: 'defi' } })).tags, [])
  check('tags number',  toAgent(raw({ metadata: { tags: 1 } })).tags, [])
  check('tags object',  toAgent(raw({ metadata: { tags: {} } })).tags, [])
  check('tags null',    toAgent(raw({ metadata: { tags: null } })).tags, [])
  check('tags missing', toAgent(raw({ metadata: {} })).tags, [])
}

// ── 11. tags: non-string entries skipped ─────────────────────────────────────

console.log('\n11. tags — non-string entries skipped')
{
  const a = toAgent(raw({ metadata: { tags: ['ok', 42, null, {}, 'also-ok'] } }))
  check('non-string entries skipped', a.tags, ['ok', 'also-ok'])
}

// ── 12. tags: each string cut to 24 chars ────────────────────────────────────

console.log('\n12. tags — cut to 24 chars')
{
  const long = 'x'.repeat(30)
  const a = toAgent(raw({ metadata: { tags: [long] } }))
  check('tag cut to 24', a.tags[0]?.length, 24)
  check('tag exact 24 value', a.tags[0], 'x'.repeat(24))
}

// ── 13. tags: max 5 kept (give 8) ────────────────────────────────────────────

console.log('\n13. tags — max 5 kept')
{
  const eightTags = ['a','b','c','d','e','f','g','h']
  const a = toAgent(raw({ metadata: { tags: eightTags } }))
  check('only 5 kept from 8', a.tags.length, 5)
  check('order preserved (first 5)', a.tags, ['a','b','c','d','e'])
}

// ── 14. tags: empty string is KEPT (typeof check only, no truthiness check) ───

console.log('\n14. tags — empty string kept (current behaviour)')
{
  // The code does: typeof t === 'string' ? [t.slice(0,24)] : []
  // An empty string '' passes the typeof check, so it IS included.
  const a = toAgent(raw({ metadata: { tags: ['', 'real'] } }))
  check('empty string tag kept', a.tags, ['', 'real'])
}

// ── 15. services: not an array → [] ──────────────────────────────────────────

console.log('\n15. services — non-array inputs')
{
  check('services string',  toAgent(raw({ metadata: { services: 'x' } })).services, [])
  check('services number',  toAgent(raw({ metadata: { services: 5 } })).services, [])
  check('services null',    toAgent(raw({ metadata: { services: null } })).services, [])
  check('services missing', toAgent(raw({ metadata: {} })).services, [])
}

// ── 16. services: null/non-object/missing-name entries skipped ────────────────

console.log('\n16. services — null/non-object/name-less entries skipped')
{
  const a = toAgent(raw({
    metadata: {
      services: [
        null,
        42,
        'string entry',
        [],
        { name: 'Valid', endpoint: 'https://a.com' },
        {},                              // no name → skipped
        { name: '   ', endpoint: '' },   // whitespace-only name → skipped
        { name: 'Also Valid' },          // no endpoint → ''
      ],
    },
  }))
  check('length = 2 (only valid names kept)', a.services.length, 2)
  check('first = Valid', a.services[0], { name: 'Valid', endpoint: 'https://a.com' })
  check('second = Also Valid, endpoint ""', a.services[1], { name: 'Also Valid', endpoint: '' })
}

// ── 17. services: name cut to 40, endpoint cut to 90 ─────────────────────────

console.log('\n17. services — name cut to 40, endpoint cut to 90')
{
  const longName     = 'n'.repeat(50)
  const longEndpoint = 'e'.repeat(100)
  const a = toAgent(raw({ metadata: { services: [{ name: longName, endpoint: longEndpoint }] } }))
  check('service name cut to 40',     a.services[0]?.name?.length, 40)
  check('service endpoint cut to 90', a.services[0]?.endpoint?.length, 90)
}

// ── 18. services: missing/blank endpoint → '' ────────────────────────────────

console.log('\n18. services — missing/blank endpoint → empty string')
{
  check('no endpoint key',
    toAgent(raw({ metadata: { services: [{ name: 'X' }] } })).services[0]?.endpoint, '')
  check('null endpoint',
    toAgent(raw({ metadata: { services: [{ name: 'X', endpoint: null }] } })).services[0]?.endpoint, '')
  check('number endpoint',
    toAgent(raw({ metadata: { services: [{ name: 'X', endpoint: 99 }] } })).services[0]?.endpoint, '')
  check('whitespace endpoint',
    toAgent(raw({ metadata: { services: [{ name: 'X', endpoint: '   ' }] } })).services[0]?.endpoint, '')
}

// ── 19. services: max 4 kept (give 6) ────────────────────────────────────────

console.log('\n19. services — max 4 kept')
{
  const sixServices = Array.from({ length: 6 }, (_, i) => ({ name: `Svc${i}`, endpoint: '' }))
  const a = toAgent(raw({ metadata: { services: sixServices } }))
  check('only 4 kept from 6', a.services.length, 4)
  check('order preserved (first 4 names)', a.services.map(s => s.name), ['Svc0','Svc1','Svc2','Svc3'])
}

// ── 20. HTML/script-looking strings returned unchanged (no execution) ─────────

console.log('\n20. HTML/script strings — returned as plain text, unchanged')
{
  const xssName = '<img src=x onerror=alert(1)>'
  const xssDesc = '<script>alert("xss")</script>'
  const a = toAgent(raw({ metadata: { name: xssName, description: xssDesc } }))
  check('name with HTML stays as-is', a.name, xssName)
  check('description with script stays as-is', a.description, xssDesc)
  // Also in tags and services — no escaping, just text
  const aTag = toAgent(raw({ metadata: { tags: ['<b>bold</b>'] } }))
  check('HTML tag in tag stays as-is', aTag.tags[0], '<b>bold</b>')
  const aSvc = toAgent(raw({
    metadata: { services: [{ name: '<b>Svc</b>', endpoint: 'javascript:alert(1)' }] },
  }))
  check('HTML in service name stays as-is', aSvc.services[0]?.name, '<b>Svc</b>')
  check('javascript: endpoint stays as-is', aSvc.services[0]?.endpoint, 'javascript:alert(1)')
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${pass}/${total} passed`)
if (pass < total) {
  console.error(`${total - pass} test(s) FAILED`)
  process.exit(1)
}
