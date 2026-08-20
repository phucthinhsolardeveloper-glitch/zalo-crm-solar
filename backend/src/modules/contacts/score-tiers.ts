// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * score-tiers.ts — derive display-only Grade/Priority tiers from the existing
 * leadScore/priorityScore (both 0-100, see score-engine.ts / priority-service.ts).
 * NOT a stored field — computed on read so it never drifts from the underlying
 * score and doesn't duplicate the scoring system (per audit: reuse, don't rebuild).
 */

export type ContactGrade = 'A' | 'B' | 'C' | 'D';
export type ContactPriorityTier = 'critical' | 'high' | 'normal' | 'low';

export function leadScoreToGrade(score: number): ContactGrade {
  if (score >= 75) return 'A';
  if (score >= 50) return 'B';
  if (score >= 25) return 'C';
  return 'D';
}

export function priorityScoreToTier(score: number): ContactPriorityTier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'normal';
  return 'low';
}
