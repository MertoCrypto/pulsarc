/**
 * Unit tests for src/lib/comments.ts
 * Run with:
 *   node --experimental-strip-types --no-warnings src/lib/comments.test.ts
 *
 * Uses only node:assert (strict mode). No framework, no test runner.
 */

import assert from 'node:assert/strict'
import type { Comment } from './comments.ts'
import {
  MAX_COMMENT_LENGTH,
  parseComments,
  makeComment,
  toggleLike,
  removeComment,
} from './comments.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let assertionCount = 0

function ok(value: boolean, label: string): void {
  assertionCount++
  assert.ok(value, label)
}

function eq<T>(actual: T, expected: T, label: string): void {
  assertionCount++
  assert.deepStrictEqual(actual, expected, label)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_COMMENT: Comment = {
  id: 'c1',
  dappId: 'dapp-alpha',
  walletAddress: '0xABC',
  text: 'Hello world',
  timestamp: 1_700_000_000_000,
  likes: 0,
  likedBy: [],
}

const VALID_COMMENT_2: Comment = {
  id: 'c2',
  dappId: 'dapp-alpha',
  walletAddress: '0xDEF',
  text: 'Second comment',
  timestamp: 1_700_000_001_000,
  likes: 3,
  likedBy: ['0xABC', '0xGHI', '0xJKL'],
}

// ---------------------------------------------------------------------------
// MAX_COMMENT_LENGTH
// ---------------------------------------------------------------------------

console.log('\n=== MAX_COMMENT_LENGTH ===')

eq(MAX_COMMENT_LENGTH, 500, 'MAX_COMMENT_LENGTH is 500')

// ---------------------------------------------------------------------------
// parseComments
// ---------------------------------------------------------------------------

console.log('\n=== parseComments ===')

// null and empty string
eq(parseComments(null), [], 'null -> []')
eq(parseComments(''), [], '"" -> []')

// invalid JSON
eq(parseComments('not-json'), [], 'invalid JSON -> []')
eq(parseComments('{unclosed'), [], 'unclosed brace -> []')
eq(parseComments('undefined'), [], '"undefined" -> []')

// valid JSON but not an array
eq(parseComments('{}'), [], 'JSON object -> []')
eq(parseComments('"hello"'), [], 'JSON string -> []')
eq(parseComments('42'), [], 'JSON number -> []')
eq(parseComments('true'), [], 'JSON boolean -> []')
eq(parseComments('null'), [], 'JSON null -> []')  // JSON.parse('null') = null; not an array

// empty array
eq(parseComments('[]'), [], 'empty array -> []')

// array with a single valid comment — order preserved
eq(parseComments(JSON.stringify([VALID_COMMENT])), [VALID_COMMENT], 'single valid comment')

// array with two valid comments — order preserved
eq(
  parseComments(JSON.stringify([VALID_COMMENT, VALID_COMMENT_2])),
  [VALID_COMMENT, VALID_COMMENT_2],
  'two valid comments in order',
)

// entries missing a required field are dropped
const missingId = { dappId: 'x', walletAddress: '0x', text: 't', timestamp: 1, likes: 0, likedBy: [] }
const missingDappId = { id: 'c', walletAddress: '0x', text: 't', timestamp: 1, likes: 0, likedBy: [] }
const missingWallet = { id: 'c', dappId: 'x', text: 't', timestamp: 1, likes: 0, likedBy: [] }
const missingText = { id: 'c', dappId: 'x', walletAddress: '0x', timestamp: 1, likes: 0, likedBy: [] }
const missingTimestamp = { id: 'c', dappId: 'x', walletAddress: '0x', text: 't', likes: 0, likedBy: [] }
const missingLikes = { id: 'c', dappId: 'x', walletAddress: '0x', text: 't', timestamp: 1, likedBy: [] }
const missingLikedBy = { id: 'c', dappId: 'x', walletAddress: '0x', text: 't', timestamp: 1, likes: 0 }

eq(parseComments(JSON.stringify([missingId])), [], 'entry missing id dropped')
eq(parseComments(JSON.stringify([missingDappId])), [], 'entry missing dappId dropped')
eq(parseComments(JSON.stringify([missingWallet])), [], 'entry missing walletAddress dropped')
eq(parseComments(JSON.stringify([missingText])), [], 'entry missing text dropped')
eq(parseComments(JSON.stringify([missingTimestamp])), [], 'entry missing timestamp dropped')
eq(parseComments(JSON.stringify([missingLikes])), [], 'entry missing likes dropped')
eq(parseComments(JSON.stringify([missingLikedBy])), [], 'entry missing likedBy dropped')

// wrong field types
const likesAsString = { ...VALID_COMMENT, likes: '5' }
const likedByNotArray = { ...VALID_COMMENT, likedBy: '0xABC' }
const timestampAsString = { ...VALID_COMMENT, timestamp: '1700000000000' }
const idAsNumber = { ...VALID_COMMENT, id: 99 }
const textAsNumber = { ...VALID_COMMENT, text: 42 }

eq(parseComments(JSON.stringify([likesAsString])), [], 'likes as string -> entry dropped')
eq(parseComments(JSON.stringify([likedByNotArray])), [], 'likedBy not array -> entry dropped')
eq(parseComments(JSON.stringify([timestampAsString])), [], 'timestamp as string -> entry dropped')
eq(parseComments(JSON.stringify([idAsNumber])), [], 'id as number -> entry dropped')
eq(parseComments(JSON.stringify([textAsNumber])), [], 'text as number -> entry dropped')

// null entries in array
eq(parseComments(JSON.stringify([null, VALID_COMMENT])), [VALID_COMMENT], 'null entry dropped, valid kept')
eq(parseComments(JSON.stringify([null, null])), [], 'all-null entries dropped')

// primitive entries in array
eq(parseComments(JSON.stringify([42, VALID_COMMENT])), [VALID_COMMENT], 'primitive number entry dropped')
eq(parseComments(JSON.stringify(['string', VALID_COMMENT])), [VALID_COMMENT], 'primitive string entry dropped')
eq(parseComments(JSON.stringify([true, VALID_COMMENT])), [VALID_COMMENT], 'primitive boolean entry dropped')

// mixed valid and invalid: only valid entries survive
const mixed = [VALID_COMMENT, null, likesAsString, VALID_COMMENT_2, 42, missingId]
eq(
  parseComments(JSON.stringify(mixed)),
  [VALID_COMMENT, VALID_COMMENT_2],
  'mixed array: only valid entries survive',
)

// round trip: JSON.stringify -> parseComments gives equal list
const list: Comment[] = [VALID_COMMENT, VALID_COMMENT_2]
eq(parseComments(JSON.stringify(list)), list, 'round trip preserves list')

// ---------------------------------------------------------------------------
// makeComment
// ---------------------------------------------------------------------------

console.log('\n=== makeComment ===')

// Exact id derivation:
//   random = 0.123456789
//   (0.123456789).toString(36) = "0.4fzzzxjylrx"
//   .slice(2, 8) = "4fzzzx"
//   id = "1000000000000-4fzzzx"
const NOW = 1_000_000_000_000
const RANDOM = 0.123456789
const RANDOM_SUFFIX = RANDOM.toString(36).slice(2, 8)
const EXPECTED_ID = `${NOW}-${RANDOM_SUFFIX}`

eq(RANDOM_SUFFIX, '4fzzzx', 'random suffix derivation for 0.123456789')

const c = makeComment('dapp-beta', '0xWALLET', 'Test text', NOW, RANDOM)

eq(c.id, EXPECTED_ID, 'id has correct format')
eq(c.dappId, 'dapp-beta', 'dappId passes through')
eq(c.walletAddress, '0xWALLET', 'walletAddress passes through')
eq(c.text, 'Test text', 'text passes through')
eq(c.timestamp, NOW, 'timestamp equals now')
eq(c.likes, 0, 'starts with likes = 0')
eq(c.likedBy, [], 'starts with likedBy = []')

// text truncation
const TEXT_500 = 'a'.repeat(500)
const TEXT_501 = 'a'.repeat(501)
const TEXT_1000 = 'a'.repeat(1000)

const c500 = makeComment('d', '0x', TEXT_500, NOW, RANDOM)
eq(c500.text.length, 500, '500-char text is unchanged (boundary)')
eq(c500.text, TEXT_500, '500-char text content is unchanged')

const c501 = makeComment('d', '0x', TEXT_501, NOW, RANDOM)
eq(c501.text.length, 500, '501-char text is cut to 500')
ok(c501.text === TEXT_501.slice(0, 500), '501 -> first 500 chars kept')

const c1000 = makeComment('d', '0x', TEXT_1000, NOW, RANDOM)
eq(c1000.text.length, 500, '1000-char text is cut to 500')

const cEmpty = makeComment('d', '0x', '', NOW, RANDOM)
eq(cEmpty.text, '', 'empty string text is fine')

// ---------------------------------------------------------------------------
// toggleLike
// ---------------------------------------------------------------------------

console.log('\n=== toggleLike ===')

const BASE: Comment = {
  id: 'c1',
  dappId: 'd',
  walletAddress: '0xAUTHOR',
  text: 'hi',
  timestamp: 1,
  likes: 0,
  likedBy: [],
}

const OTHER: Comment = {
  id: 'c2',
  dappId: 'd',
  walletAddress: '0xOTHER',
  text: 'other',
  timestamp: 2,
  likes: 10,
  likedBy: ['0xSOMEONE'],
}

const LIST = [BASE, OTHER]

// First like: likes goes 0 -> 1, wallet appears in likedBy
const afterFirstLike = toggleLike(LIST, 'c1', '0xVOTER')
eq(afterFirstLike[0].likes, 1, 'first like increments likes to 1')
ok(afterFirstLike[0].likedBy.includes('0xVOTER'), 'first like adds wallet to likedBy')
eq(afterFirstLike[0].likedBy.length, 1, 'likedBy has exactly 1 entry after first like')

// Second like by same wallet: back to original count, wallet removed
const afterSecondLike = toggleLike(afterFirstLike, 'c1', '0xVOTER')
eq(afterSecondLike[0].likes, 0, 'second like by same wallet decrements back to 0')
ok(!afterSecondLike[0].likedBy.includes('0xVOTER'), 'second like removes wallet from likedBy')
eq(afterSecondLike[0].likedBy.length, 0, 'likedBy is empty after unlike')

// likes never goes negative in normal like/unlike flow
ok(afterFirstLike[0].likes >= 0, 'likes non-negative after first like')
ok(afterSecondLike[0].likes >= 0, 'likes non-negative after unlike')

// Two different wallets add likes
const afterWallet1 = toggleLike(LIST, 'c1', '0xVOTER1')
const afterBothWallets = toggleLike(afterWallet1, 'c1', '0xVOTER2')
eq(afterBothWallets[0].likes, 2, 'two different wallets -> likes = 2')
ok(afterBothWallets[0].likedBy.includes('0xVOTER1'), 'voter1 in likedBy')
ok(afterBothWallets[0].likedBy.includes('0xVOTER2'), 'voter2 in likedBy')

// Only the matching id changes; other comment keeps the SAME object reference
eq(afterFirstLike[1], OTHER, 'non-matched comment returns same object reference')

// Unknown id changes nothing (all items return same object reference)
const afterUnknownId = toggleLike(LIST, 'unknown-id', '0xVOTER')
eq(afterUnknownId[0], BASE, 'unknown id: BASE unchanged (same reference)')
eq(afterUnknownId[1], OTHER, 'unknown id: OTHER unchanged (same reference)')

// Input array is not mutated
const originalList = [{ ...BASE }, { ...OTHER }]
const originalBase = originalList[0]
const originalOther = originalList[1]
toggleLike(originalList, 'c1', '0xVOTER')
eq(originalList[0], originalBase, 'input array not mutated (element 0 unchanged)')
eq(originalList[1], originalOther, 'input array not mutated (element 1 unchanged)')
eq(originalList[0].likes, 0, 'original likes still 0 after toggle on copy')
eq(originalList[0].likedBy, [], 'original likedBy still [] after toggle on copy')

// Input comment objects are not mutated (check the originals in LIST)
toggleLike(LIST, 'c1', '0xMUTATION_CHECK')
eq(BASE.likes, 0, 'BASE.likes not mutated')
eq(BASE.likedBy, [], 'BASE.likedBy not mutated')
eq(OTHER.likes, 10, 'OTHER.likes not mutated')

// ---------------------------------------------------------------------------
// removeComment
// ---------------------------------------------------------------------------

console.log('\n=== removeComment ===')

const R1: Comment = {
  id: 'r1',
  dappId: 'd',
  walletAddress: '0xALICE',
  text: 'alice comment',
  timestamp: 1,
  likes: 0,
  likedBy: [],
}

const R2: Comment = {
  id: 'r2',
  dappId: 'd',
  walletAddress: '0xBOB',
  text: 'bob comment',
  timestamp: 2,
  likes: 0,
  likedBy: [],
}

const RLIST = [R1, R2]

// Both id and walletAddress match -> removed
const afterRemove = removeComment(RLIST, 'r1', '0xALICE')
eq(afterRemove.length, 1, 'removes matching comment (length 1)')
eq(afterRemove[0], R2, 'only R2 remains')

// Right id but wrong walletAddress -> kept (author-only rule)
const afterWrongWallet = removeComment(RLIST, 'r1', '0xBOB')
eq(afterWrongWallet.length, 2, 'right id but wrong wallet -> comment kept')
ok(afterWrongWallet.some(c => c.id === 'r1'), 'r1 still present when wallet does not match')

// Wrong id, right walletAddress -> kept
const afterWrongId = removeComment(RLIST, 'r99', '0xALICE')
eq(afterWrongId.length, 2, 'wrong id -> nothing removed')

// Wrong id AND wrong wallet -> kept
const afterBothWrong = removeComment(RLIST, 'r99', '0xEVE')
eq(afterBothWrong.length, 2, 'wrong id and wrong wallet -> nothing removed')

// Address comparison is case-sensitive: '0xalice' != '0xALICE'
// removeComment uses === so lowercase wallet does NOT match uppercase stored address
const afterCaseMismatch = removeComment(RLIST, 'r1', '0xalice')
eq(
  afterCaseMismatch.length,
  2,
  'address comparison is case-sensitive: "0xalice" does not remove comment stored as "0xALICE"',
)
ok(afterCaseMismatch.some(c => c.id === 'r1'), 'r1 kept when case does not match')

// Input array is not mutated
const mutableList = [{ ...R1 }, { ...R2 }]
removeComment(mutableList, 'r1', '0xALICE')
eq(mutableList.length, 2, 'input array not mutated by removeComment')

// Remove from empty list
eq(removeComment([], 'r1', '0xALICE'), [], 'removeComment on empty list gives []')

// Remove last remaining comment
const singleList = [R1]
const afterRemoveLast = removeComment(singleList, 'r1', '0xALICE')
eq(afterRemoveLast, [], 'removing last comment gives []')

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nAll ${assertionCount} assertions passed.`)
