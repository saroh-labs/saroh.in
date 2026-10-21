/**
 * Where a visit to a merchant's website came from (U15, #1099, A13).
 *
 * THE RULE: a visit's source is one of five groups and, at most, one short
 * label the merchant chose for their own link (`?ref=`). Nothing else about
 * the visit, the visitor or the address they came by is kept.
 *
 * - The site classifies the visit in the visitor's browser
 *   (`packages/site-blocks/src/visit-source.ts`) from the referrer's origin
 *   and an allowed `ref` / `utm_source` value, and sends only the group and
 *   the label. The referrer's full address and the rest of the query string
 *   never leave the browser.
 * - The browser's word is not trusted: the group must be one of
 *   {@link VISIT_SOURCES} and the label must have the shape of
 *   {@link visitRefOf} (no run of six digits, no more than six in all, never
 *   a record's id). Anything else is no source, never a refused order.
 * - No visit id is ever sent or stored. A visit lives in the visitor's tab
 *   memory only; what ties a paid order to its visit is the visit's group and
 *   label, copied onto the order at checkout (`Order.visitSource`,
 *   `Order.visitRef`) and onto its `order.paid` event.
 *
 * The groups, as the merchant reads them (U16 draws them):
 *   instagram → "Instagram", google → "Google search",
 *   whatsapp → "WhatsApp links", direct → "Typed your address",
 *   other → "Other sites".
 */

/** The five groups a visit's source falls into. */
export const VISIT_SOURCES = [
    "instagram",
    "google",
    "whatsapp",
    "direct",
    "other",
] as const;

export type VisitSource = (typeof VISIT_SOURCES)[number];

const SOURCES: ReadonlySet<string> = new Set(VISIT_SOURCES);

/** True for one of the five groups. */
export function isVisitSource(value: unknown): value is VisitSource {
    return typeof value === "string" && SOURCES.has(value);
}

/** The longest label a merchant's own link may carry. */
export const VISIT_REF_MAX = 32;

/**
 * A label's shape: lower-case letters, digits and single hyphens inside,
 * 1 to 32 long. No dots, no `@`, no spaces: an address, an email or a
 * sentence can't be one.
 */
const REF_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/**
 * Six digits in a row read as a phone number, a PIN code or an order
 * number: a label that could name one person is no label.
 */
const DIGIT_RUN = /\d{6,}/;

/**
 * Nor are seven digits in all, however they are split (`98765-43210`): a
 * phone number broken up by hyphens is still one (U15 privacy review).
 */
export const VISIT_REF_MAX_DIGITS = 6;

/**
 * A record's id (cuid: `c` and 24 more), as the booking page's own
 * `?ref=<booking id>` carries one: an id names one booking or order, so it
 * is never a label, whatever the site sent (U15 privacy review).
 */
const ID_SHAPE = /^c[a-z0-9]{24}$/;

/**
 * A merchant's own link label as it may be kept, or null. Lower-cased and
 * trimmed first, so `?ref=Diwali-Post` and `diwali-post` are one label.
 */
export function visitRefOf(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const ref = value.trim().toLowerCase();
    if (ref.length === 0 || ref.length > VISIT_REF_MAX) return null;
    if (!REF_SHAPE.test(ref) || DIGIT_RUN.test(ref)) return null;
    if ((ref.match(/\d/g)?.length ?? 0) > VISIT_REF_MAX_DIGITS) return null;
    if (ID_SHAPE.test(ref)) return null;
    return ref;
}

/** What a visit is said to have come from, as stored. */
export interface VisitOrigin {
    source: VisitSource;
    ref: string | null;
}

/**
 * The visit a checkout sent, cleaned, or null when it sent none or one that
 * isn't well formed. A label without a group is dropped with it: the label
 * says which of the merchant's links, the group where it was shared.
 */
export function visitOriginOf(
    source: unknown,
    ref: unknown,
): VisitOrigin | null {
    if (!isVisitSource(source)) return null;
    return { source, ref: visitRefOf(ref) };
}
