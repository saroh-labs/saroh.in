/**
 * Turning form fields into API input.
 *
 * A text input that the merchant left alone and one they deliberately cleared
 * both arrive as `""`. Almost every form here wants the same thing: treat a
 * blank field as "not provided" and send the fallback instead — `null` to clear
 * a stored value, `undefined` to omit the key, or the existing value to keep it.
 *
 * This existed as `values.phone?.trim() || null` in twelve components, which is
 * correct but reads as an accident, and `@typescript-eslint/prefer-nullish-
 * coalescing` flags every instance. The rule is right that `||` deserves a
 * second look and wrong about the fix: `??` only catches `null`/`undefined`, so
 * `"" ?? null` is `""`. Swapping the operator would store an empty string where
 * the merchant meant to clear the field — a phone number of `""` rather than
 * "no phone number". Naming the intent is the fix; the operator was never the
 * problem.
 */
export function trimmedOr<TFallback>(
    value: string | null | undefined,
    fallback: TFallback,
): string | TFallback {
    const trimmed = value?.trim();
    // An explicit emptiness test, not `trimmed ?? fallback` and not
    // `trimmed ? trimmed : fallback`. The lint rule reads both ternary and
    // logical forms as nullish-equivalent and rewrites them to `??`, which is
    // the exact bug this helper exists to prevent — `"" ?? null` is `""`.
    return trimmed !== undefined && trimmed.length > 0 ? trimmed : fallback;
}
