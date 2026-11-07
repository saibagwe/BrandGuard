import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHighlightSegments } from '../src/utils/highlights.js'

test('highlights: returns empty array on empty or null content', () => {
  assert.deepEqual(buildHighlightSegments(''), [])
  assert.deepEqual(buildHighlightSegments(null), [])
})

test('highlights: returns single unhighlighted segment when no issues', () => {
  const content = 'Clean content without issues'
  const segs = buildHighlightSegments(content, [])
  assert.deepEqual(segs, [{ text: content, issueId: null, severity: null }])
})

test('highlights: handles null locations safely (list only)', () => {
  const content = 'Document with general issue'
  const issues = [
    { id: 'i1', location: null, severity: 'medium', status: 'open' },
    { id: 'i2', location: { start: null, end: null }, severity: 'high', status: 'open' },
  ]
  const segs = buildHighlightSegments(content, issues)
  assert.deepEqual(segs, [{ text: content, issueId: null, severity: null }])
})

test('highlights: handles adjacent ranges correctly', () => {
  const content = 'ABCDEF'
  const issues = [
    { id: 'i1', location: { start: 0, end: 3 }, severity: 'low', status: 'open' },
    { id: 'i2', location: { start: 3, end: 6 }, severity: 'high', status: 'open' },
  ]
  const segs = buildHighlightSegments(content, issues)
  assert.equal(segs.length, 2)
  assert.deepEqual(segs[0], { text: 'ABC', issueId: 'i1', severity: 'low' })
  assert.deepEqual(segs[1], { text: 'DEF', issueId: 'i2', severity: 'high' })
})

test('highlights: resolves overlaps giving priority to higher severity', () => {
  const content = '0123456789'
  // low covers 0..6, high covers 3..8
  const issues = [
    { id: 'low-1', location: { start: 0, end: 6 }, severity: 'low', status: 'open' },
    { id: 'high-1', location: { start: 3, end: 8 }, severity: 'high', status: 'open' },
  ]
  const segs = buildHighlightSegments(content, issues)
  assert.equal(segs.length, 3)
  assert.deepEqual(segs[0], { text: '012', issueId: 'low-1', severity: 'low' })
  assert.deepEqual(segs[1], { text: '34567', issueId: 'high-1', severity: 'high' })
  assert.deepEqual(segs[2], { text: '89', issueId: null, severity: null })
})

test('highlights: ignores dismissed issues from highlights', () => {
  const content = 'Dismissed highlight test'
  const issues = [
    { id: 'i1', location: { start: 0, end: 9 }, severity: 'high', status: 'dismissed' },
  ]
  const segs = buildHighlightSegments(content, issues)
  assert.deepEqual(segs, [{ text: content, issueId: null, severity: null }])
})
