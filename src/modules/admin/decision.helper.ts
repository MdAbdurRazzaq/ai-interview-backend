export function deriveDecision(
  aiScore?: number | null,
  reviewerScore?: number | null,
  status?: string
) {
  if (status === 'FAILED') return 'MANUAL_REVIEW';

  const finalScore = reviewerScore ?? aiScore;

  if (finalScore === null || finalScore === undefined) {
    return 'PENDING';
  }

  if (finalScore >= 8) return 'STRONG_PASS';
  if (finalScore >= 6) return 'PASS';
  if (finalScore >= 4) return 'REVIEW';
  return 'REJECT';
}
