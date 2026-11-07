/**
 * Pure function to build highlight segments from text content and a list of issues.
 * Handles:
 * - null or empty content
 * - issues with null/undefined locations (ignored for highlights; list-only)
 * - out of bounds locations
 * - adjacent ranges [0, 5] and [5, 10]
 * - overlapping ranges (higher severity wins: high > medium > low)
 * - dismissed issues (excluded from content highlights)
 *
 * @param {string} content - Full text content of the document
 * @param {Array<Object>} issues - Array of Issue objects
 * @returns {Array<{text: string, issueId: string | null, severity: string | null}>}
 */
export function buildHighlightSegments(content, issues = []) {
  if (!content || typeof content !== 'string') {
    return []
  }

  // Filter to issues that have valid non-null coordinates within content bounds and are not dismissed
  const activeLocated = (issues || []).filter(
    (iss) =>
      iss &&
      iss.status !== 'dismissed' &&
      iss.location &&
      typeof iss.location.start === 'number' &&
      typeof iss.location.end === 'number' &&
      iss.location.start >= 0 &&
      iss.location.end <= content.length &&
      iss.location.start < iss.location.end
  )

  if (activeLocated.length === 0) {
    return [{ text: content, issueId: null, severity: null }]
  }

  // Priority order for overlapping ranges
  const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 }

  // Character-level map for resolving overlaps
  const charMap = new Array(content.length).fill(null)

  for (const iss of activeLocated) {
    const { start, end } = iss.location
    const sev = (iss.severity || 'low').toLowerCase()
    const weight = SEVERITY_WEIGHT[sev] || 1

    for (let i = start; i < end; i++) {
      const existing = charMap[i]
      if (!existing || (SEVERITY_WEIGHT[existing.severity] || 0) < weight) {
        charMap[i] = { issueId: iss.id, severity: sev }
      }
    }
  }

  // Group contiguous characters with the same issueId into segments
  const segments = []
  let idx = 0

  while (idx < content.length) {
    const current = charMap[idx]
    let nextIdx = idx + 1

    while (
      nextIdx < content.length &&
      ((!current && !charMap[nextIdx]) ||
        (current &&
          charMap[nextIdx] &&
          charMap[nextIdx].issueId === current.issueId))
    ) {
      nextIdx++
    }

    segments.push({
      text: content.slice(idx, nextIdx),
      issueId: current ? current.issueId : null,
      severity: current ? current.severity : null,
    })

    idx = nextIdx
  }

  return segments
}
