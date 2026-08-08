import { BadRequestException } from "@nestjs/common";

/**
 * Versioned analytics event contract (S7-002).
 *
 * A registry mapping `(type, schemaVersion)` → a pure validator for that event's
 * `properties` JSON. Validation is the intake trust boundary: an event whose
 * `(type, schemaVersion)` is unknown, or whose properties don't match the
 * declared shape, is rejected (400) BEFORE it can be persisted — so the raw
 * ledger only ever holds well-formed, versioned rows the aggregate jobs can
 * trust.
 *
 * The registry is intentionally pure (no Nest DI, no Prisma) so it is trivially
 * unit-testable and reusable by both the public intake and server-side
 * producers.
 */

/** Retention window (days) stamped onto every event as `expiresAt` at intake. */
export const ANALYTICS_RETENTION_DAYS = 400;

/** Max length for a free-form path/URL-ish string property. */
const MAX_PATH_LEN = 2048;
/** Max length for a short text property (title, etc.). */
const MAX_TEXT_LEN = 1024;

/** A pure validator: given raw props, return the normalized props or throw. */
export type EventValidator = (
    props: Record<string, unknown>,
) => Record<string, unknown>;

/** Build the registry key from a `(type, schemaVersion)` pair. */
function key(type: string, schemaVersion: number): string {
    return `${type}@${schemaVersion}`;
}

/**
 * Read a REQUIRED string property, trimming it. Throws a 400 naming the field
 * when it is missing, empty, not a string, or over `maxLen`.
 */
function requireString(
    props: Record<string, unknown>,
    field: string,
    maxLen: number,
): string {
    const raw = props[field];
    if (typeof raw !== "string") {
        throw new BadRequestException(`"${field}" must be a string`);
    }
    const value = raw.trim();
    if (value === "") {
        throw new BadRequestException(`"${field}" is required`);
    }
    if (value.length > maxLen) {
        throw new BadRequestException(
            `"${field}" must be at most ${maxLen} characters`,
        );
    }
    return value;
}

/**
 * Read an OPTIONAL string property, trimming it. Returns `undefined` when
 * absent/null; throws a 400 naming the field when present but not a string or
 * over `maxLen`. An empty string normalizes to `undefined`.
 */
function optionalString(
    props: Record<string, unknown>,
    field: string,
    maxLen: number,
): string | undefined {
    const raw = props[field];
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw !== "string") {
        throw new BadRequestException(`"${field}" must be a string`);
    }
    const value = raw.trim();
    if (value === "") {
        return undefined;
    }
    if (value.length > maxLen) {
        throw new BadRequestException(
            `"${field}" must be at most ${maxLen} characters`,
        );
    }
    return value;
}

/** Read a REQUIRED finite number property. Throws a 400 naming the field. */
function requireNumber(props: Record<string, unknown>, field: string): number {
    const raw = props[field];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new BadRequestException(`"${field}" must be a finite number`);
    }
    return raw;
}

/**
 * The `site.view` contract (v1): a page view on a published site.
 * `path` is required (≤2048); `referrer` and `title` are optional.
 */
const siteViewV1: EventValidator = (props) => {
    const out: Record<string, unknown> = {
        path: requireString(props, "path", MAX_PATH_LEN),
    };
    const referrer = optionalString(props, "referrer", MAX_PATH_LEN);
    if (referrer !== undefined) {
        out.referrer = referrer;
    }
    const title = optionalString(props, "title", MAX_TEXT_LEN);
    if (title !== undefined) {
        out.title = title;
    }
    return out;
};

/** The `enquiry.submitted` contract (v1): an org-internal funnel event. */
const enquirySubmittedV1: EventValidator = (props) => ({
    formId: requireString(props, "formId", 128),
    leadId: requireString(props, "leadId", 128),
});

/** The `order.paid` contract (v1): an org-internal commerce event. */
const orderPaidV1: EventValidator = (props) => ({
    orderId: requireString(props, "orderId", 128),
    amountCents: requireNumber(props, "amountCents"),
});

/** The event types accepted from the PUBLIC, unauthenticated intake endpoint. */
export const SITE_VIEW_TYPE = "site.view";
export const ENQUIRY_SUBMITTED_TYPE = "enquiry.submitted";
export const ORDER_PAID_TYPE = "order.paid";

/**
 * The set of event types a public visitor may ingest. Only `site.view` is
 * publicly ingestable — org-internal types (`enquiry.submitted`, `order.paid`)
 * are produced server-side and MUST be rejected on the public endpoint.
 */
export const PUBLIC_INGESTABLE_TYPES: ReadonlySet<string> = new Set([
    SITE_VIEW_TYPE,
]);

/** The `(type, schemaVersion)` → validator registry. */
const REGISTRY = new Map<string, EventValidator>([
    [key(SITE_VIEW_TYPE, 1), siteViewV1],
    [key(ENQUIRY_SUBMITTED_TYPE, 1), enquirySubmittedV1],
    [key(ORDER_PAID_TYPE, 1), orderPaidV1],
]);

/**
 * Validate an event's `properties` against the registered contract for
 * `(type, schemaVersion)` and return the NORMALIZED props.
 *
 * Throws `BadRequestException` (naming the offending field) when the
 * `(type, schemaVersion)` pair is unknown, when `properties` is not an object,
 * or when the props violate the contract.
 */
export function validateEventProperties(
    type: string,
    schemaVersion: number,
    properties: unknown,
): Record<string, unknown> {
    if (
        typeof properties !== "object" ||
        properties === null ||
        Array.isArray(properties)
    ) {
        throw new BadRequestException("properties must be an object");
    }

    const validator = REGISTRY.get(key(type, schemaVersion));
    if (!validator) {
        throw new BadRequestException(
            `Unknown event type "${type}" (schema v${schemaVersion})`,
        );
    }

    return validator(properties as Record<string, unknown>);
}
