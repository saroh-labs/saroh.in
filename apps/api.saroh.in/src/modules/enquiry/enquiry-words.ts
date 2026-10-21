import type { FormField } from "../forms/dto";

/**
 * What an enquiry says, read for its auto-reply (DEC-174 U15, #1146): the
 * message to quote back, and whether the submission is obvious spam.
 *
 * Pure: the public form's data as submitted and its fields. Kept here,
 * beside the form that takes the data, so the notice that quotes the
 * message and the submit that decides to queue it read one set of rules.
 *
 * The auto-reply sends words someone typed to an address someone typed,
 * from the business's own email. So it is careful in three ways:
 * - **Obvious spam gets no reply** ({@link looksLikeSpam}): markup, a run
 *   of links, a link where a name goes, or a wall of text. The team still
 *   gets the lead, as before; only the reply is held back.
 * - **A message with a link is not quoted** ({@link quotableMessage}): the
 *   reply goes, without their words, so the business's email never carries
 *   a link a stranger chose.
 * - **The quote is short**: {@link QUOTE_MAX} characters at most.
 */

/** The most of their message the reply quotes back. */
export const QUOTE_MAX = 500;

/** More text than an enquiry needs: a pasted page, not a question. */
const SPAM_TEXT_MAX = 5000;

/** At this many links an enquiry is an advert, not a question. */
const SPAM_LINKS = 3;

const LINK = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]/gi;
const MARKUP = /<\s*\/?\s*[a-z][^>]*>|\[\s*\/?\s*(?:url|link|img)\b/i;
const NAME_FIELD = /name/i;
const MESSAGE_FIELD =
    /message|enquiry|inquiry|comment|question|details|note|request|about/i;

function text(v: unknown): string {
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
}

function linkCount(value: string): number {
    return value.match(LINK)?.length ?? 0;
}

/** Whether a value carries a web address. */
export function hasLink(value: string): boolean {
    return linkCount(value) > 0;
}

/**
 * Obvious spam, which gets no auto-reply: HTML or forum markup, three or
 * more links in all, a link in a name, or more than {@link SPAM_TEXT_MAX}
 * characters in all.
 */
export function looksLikeSpam(
    fields: readonly FormField[],
    data: Record<string, unknown>,
): boolean {
    let links = 0;
    let length = 0;
    for (const [name, raw] of Object.entries(data)) {
        const value = text(raw);
        if (value === "") continue;
        if (MARKUP.test(value)) return true;
        const field = fields.find((f) => f.name === name);
        const isEmail = field?.type === "email";
        const found = isEmail ? 0 : linkCount(value);
        if (found > 0 && NAME_FIELD.test(name) && field?.type !== "textarea") {
            return true;
        }
        links += found;
        length += value.length;
    }
    return links >= SPAM_LINKS || length > SPAM_TEXT_MAX;
}

/**
 * The message they wrote: every long-text field, or, on a form with none,
 * the fields named like a message ("Message", "Your question"), in the
 * form's order. Null when the form has no message.
 */
export function enquiryMessage(
    fields: readonly FormField[],
    data: Record<string, unknown>,
): string | null {
    const long = fields.filter((f) => f.type === "textarea");
    const named = fields.filter(
        (f) =>
            f.type === "text" &&
            MESSAGE_FIELD.test(f.name) &&
            !NAME_FIELD.test(f.name),
    );
    const parts = (long.length > 0 ? long : named)
        .map((f) => text(data[f.name]))
        .filter((v) => v !== "");
    return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * The message as the reply quotes it: null when there is none, or when it
 * carries a link; cut to {@link QUOTE_MAX} characters, at a word where it
 * can be, with "…".
 */
export function quotableMessage(message: string | null): string | null {
    if (message === null || message === "" || hasLink(message)) return null;
    if (message.length <= QUOTE_MAX) return message;
    const cut = message.slice(0, QUOTE_MAX);
    const space = cut.lastIndexOf(" ");
    return `${(space > QUOTE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
