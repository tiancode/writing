// Internal credit ledger. Credits are an abstract unit roughly proportional to
// API cost: output tokens are weighted higher than input, cache reads are
// nearly free. This is the integration point for a real payment provider —
// swap creditsForUsage / the grant logic for Stripe-backed balances later.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

// New accounts get this many credits to try the product.
export const INITIAL_CREDITS = 200_000;

// A request won't start unless the user has at least this much headroom, so a
// generation can't begin with an already-empty wallet.
export const MIN_BALANCE_TO_START = 2_000;

// Weights chosen to mirror typical Anthropic pricing ratios (output ≈ 5x input,
// cache writes ≈ 1.25x input, cache reads ≈ 0.1x input).
const WEIGHTS = {
  input: 1,
  output: 5,
  cacheCreate: 1.25,
  cacheRead: 0.1,
} as const;

/** Credits to charge for one API call. Always a non-negative integer. */
export function creditsForUsage(usage: TokenUsage): number {
  const raw =
    usage.inputTokens * WEIGHTS.input +
    usage.outputTokens * WEIGHTS.output +
    usage.cacheCreateTokens * WEIGHTS.cacheCreate +
    usage.cacheReadTokens * WEIGHTS.cacheRead;
  return Math.max(0, Math.ceil(raw));
}
