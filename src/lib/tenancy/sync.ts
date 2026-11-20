// Keeps Commencing / Terminating / Term consistent. Called from the change handlers (never from an effect),
// so a calculated value never triggers another calculation.

import type { TenancyData } from './types'
import { endDateFromTerm, termFromDates } from './helpers'

export type DateTermChange =
  | { field: 'commencing'; value: string }
  | { field: 'terminating'; value: string }
  | { field: 'term'; value: string }

export function applyDateTermChange(d: TenancyData, change: DateTermChange): TenancyData {
  const next: TenancyData = { ...d, [change.field]: change.value }
  if (change.field === 'terminating') {
    next.termFrom = 'dates'
    next.term = termFromDates(next.commencing, next.terminating) ?? next.term
  } else if (change.field === 'term') {
    next.termFrom = 'term'
    next.terminating = endDateFromTerm(next.commencing, next.term) ?? next.terminating
  } else {
    // Start date changed: follow whichever side was typed last.
    if (next.termFrom === 'term' && next.term.trim()) {
      next.terminating = endDateFromTerm(next.commencing, next.term) ?? next.terminating
    } else if (next.terminating) {
      next.term = termFromDates(next.commencing, next.terminating) ?? next.term
    } else if (next.term.trim()) {
      next.terminating = endDateFromTerm(next.commencing, next.term) ?? next.terminating
    }
  }
  return next
}
