/**
 * The business's name as it appears in a site sign-in code email (ADR-011;
 * round-2 plan A, A2, default 4): "‹Business› via Saroh" in the display name
 * and "Your code for ‹Business›" in the subject.
 *
 * The name is text the business typed, sent from Saroh's own identity
 * domain, so it is cleaned first: no control or format characters (a
 * newline must never reach a header), no URLs, no email addresses and
 * nothing that looks like a domain ("Bank Alert www.example.com" must not
 * put a link in the inbox list), nothing that quotes or brackets a display
 * name, and at most 40 characters. When nothing is left, the site's host
 * stands in. The body escapes it again as HTML (`common/email.ts`).
 */
export const MAX_SENDER_NAME = 40;

const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/\S*/giu;
const EMAIL_LIKE = /\S+@\S+/gu;
// A run of labels joined by dots and ending in a letter label of two or
// more: example.com, www.bank.co.in, kavi.saroh.app.
const DOMAIN_LIKE = /\b(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}\b\.?/gu;
// What could close a quoted display name or open an address in one.
// Nodemailer quotes the name itself, so commas and colons may stay.
const HEADER_UNSAFE = /["<>\\@]/gu;

export function cleanBusinessName(name: string, fallbackHost: string): string {
    const cleaned = name
        .replace(CONTROL, " ")
        .replace(URL_LIKE, " ")
        .replace(EMAIL_LIKE, " ")
        .replace(DOMAIN_LIKE, " ")
        .replace(HEADER_UNSAFE, " ")
        .replace(/\s+/gu, " ")
        .trim();
    const capped = Array.from(cleaned)
        .slice(0, MAX_SENDER_NAME)
        .join("")
        .trim();
    // Only punctuation left ("--", ".") says nothing about who is writing.
    if (/[\p{L}\p{N}]/u.test(capped)) return capped;
    return fallbackHost;
}

/** The display name the code email is sent under. */
export function codeSenderName(businessName: string): string {
    return `${businessName} via Saroh`;
}

/** The code email's subject. */
export function codeSubject(businessName: string): string {
    return `Your code for ${businessName}`;
}
