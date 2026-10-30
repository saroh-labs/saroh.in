/**
 * An email worth sending to the API: something@something.something. The one
 * check on saroh.in (DEC-195); the API is the real one. Domain labels
 * exclude "." so no two parts can match the same dots (CodeQL
 * js/polynomial-redos). `@saroh/search-pages` keeps the same pattern in
 * `src/tools/email-gate.tsx` (a package can't import the site).
 */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export const isEmailShape = (value: string) => EMAIL_SHAPE.test(value);

/** The typed email, trimmed, when it has the shape; null when it doesn't. */
export function shapedEmail(typed: string): string | null {
    const value = typed.trim();
    return isEmailShape(value) ? value : null;
}
