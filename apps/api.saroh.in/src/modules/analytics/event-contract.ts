import { BadRequestException } from "@nestjs/common";
import { isPrivateSitePath } from "@saroh/block-contract";

import { isVisitSource, visitRefOf } from "./visit-source";

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
 * A page's path as it may be kept: cut at the query and the fragment (a
 * pay link's token or a test release's key travels there), `/` when that
 * leaves nothing.
 */
export function sitePathOnly(path: string): string {
    return path.split(/[?#]/)[0] || "/";
}

/**
 * A referrer as it may be kept: its origin (`https://l.instagram.com`),
 * never the address it was on. Undefined when it isn't an http(s) address.
 */
export function referrerOriginOf(referrer: string): string | undefined {
    try {
        const url = new URL(referrer);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return undefined;
        }
        return url.origin;
    } catch {
        return undefined;
    }
}

/**
 * The `site.view` contract (v1): a page view on a published site.
 *
 * The site's beacon already sends only this (`apps/saroh.app/lib/
 * site-view.ts`); the server holds the same promises, so a forged or older
 * beacon can't break them (U15 privacy review):
 *
 * - `path` is required (≤2048) and kept only up to its `?` or `#`;
 * - a path under one of the private pages (`PRIVATE_PATH_PREFIXES`, one
 *   list with the site, from `@saroh/block-contract`) is refused: those
 *   paths name one customer's order, booking or token;
 * - `referrer` is kept as its origin only, or dropped;
 * - `title` is never kept (a page's title can name an order or a person).
 */
const siteViewV1: EventValidator = (props) => {
    const path = sitePathOnly(requireString(props, "path", MAX_PATH_LEN));
    if (isPrivateSitePath(path)) {
        throw new BadRequestException(
            `"path" is a private page; its views are not counted`,
        );
    }
    const out: Record<string, unknown> = { path };
    const referrer = optionalString(props, "referrer", MAX_PATH_LEN);
    const origin =
        referrer !== undefined ? referrerOriginOf(referrer) : undefined;
    if (origin !== undefined) {
        out.referrer = origin;
    }
    return out;
};

/** The `enquiry.submitted` contract (v1): an org-internal funnel event. */
const enquirySubmittedV1: EventValidator = (props) => ({
    formId: requireString(props, "formId", 128),
    leadId: requireString(props, "leadId", 128),
});

/**
 * Where a visit came from (U15, #1099): one of the five groups, required,
 * and the merchant's own link label, optional. A group that isn't one of
 * the five, or a label that isn't the allowed shape (`visit-source.ts`), is
 * refused: nothing else from the visitor's address may be stored.
 */
function visitOriginProps(
    props: Record<string, unknown>,
): Record<string, unknown> {
    const source = props.source;
    if (!isVisitSource(source)) {
        throw new BadRequestException(`"source" must be a known source`);
    }
    const out: Record<string, unknown> = { source };
    if (props.ref !== undefined && props.ref !== null) {
        const ref = visitRefOf(props.ref);
        if (ref === null) {
            throw new BadRequestException(`"ref" is not an allowed label`);
        }
        out.ref = ref;
    }
    return out;
}

/**
 * The four steps of a visit (U15; `site.paid` since DEC-181), each sent at
 * most once per visit by the site's own beacon and carrying only where the
 * visit came from: no path, no product, no order, no amount, no visitor
 * (`AnalyticsService.ingestPublic` stores no visitor hash for them).
 *
 * - `site.visit`: a visit began (its first page on the site);
 * - `site.looked`: it opened a product or the booking page;
 * - `site.started`: it opened the checkout;
 * - `site.paid`: its own confirmation page showed a successful online
 *   payment (DEC-181: paid is counted from the visit, never from the
 *   order, so nothing about a visit is kept on an order).
 */
const visitStepV1: EventValidator = (props) => visitOriginProps(props);

/** The `order.paid` contract (v1): an org-internal commerce event. */
const orderPaidV1: EventValidator = (props) => ({
    orderId: requireString(props, "orderId", 128),
    amountCents: requireNumber(props, "amountCents"),
});

/**
 * The `order.refunded` contract (v1, #867): an order that `order.paid`
 * counted has had all of its money back, so Insights' orders figure takes
 * it off again, net as Sales is. `amountCents` is the counted sale's.
 */
const orderRefundedV1: EventValidator = (props) => ({
    orderId: requireString(props, "orderId", 128),
    amountCents: requireNumber(props, "amountCents"),
});

/* ------------------------------------------------------------------------- *
 * Activation events (#176 / #119)
 *
 * The three contracts above describe things a merchant's CUSTOMER did. Nothing
 * observed what the MERCHANT did, so `PRODUCT_STRATEGY.md` §23's "How will we
 * know whether it works?" was unanswerable for onboarding and activation, and
 * `PRODUCT.md` recorded plainly that no activation funnel exists.
 *
 * These describe the merchant's own path through the product. Two rules hold
 * for all of them:
 *
 *  - **Never publicly ingestable.** They are produced server-side only; a
 *    visitor must not be able to forge an activation milestone.
 *  - **No personal data.** Properties carry ids, keys and counts — never a
 *    name, an email, an address or free text a merchant typed. The events say
 *    THAT something happened, never who it was about.
 * ------------------------------------------------------------------------- */

/** Identifier-ish property length: a cuid, a module key, a provider name. */
const MAX_ID_LEN = 128;

/** `organization.created` (v1): the funnel's t0. */
const organizationCreatedV1: EventValidator = () => ({});

/**
 * `onboarding.completed` (v1): the merchant finished (or skipped) the goal
 * picker. `moduleCount` rather than the keys themselves — the count is what
 * distinguishes "picked something" from "skipped", and a list would grow into a
 * per-org fingerprint for no analytical gain.
 */
const onboardingCompletedV1: EventValidator = (props) => ({
    moduleCount: requireNumber(props, "moduleCount"),
});

/** `module.enabled` (v1): a capability switched on. */
const moduleEnabledV1: EventValidator = (props) => ({
    moduleKey: requireString(props, "moduleKey", MAX_ID_LEN),
});

/**
 * The first-value contracts (v1). Each carries only the created row's id, so
 * "time to first value" is `occurredAt` minus the org's `organization.created`
 * — derived at read time rather than stored as a field that could drift.
 */
const firstProductV1: EventValidator = (props) => ({
    productId: requireString(props, "productId", MAX_ID_LEN),
});
const firstCustomerV1: EventValidator = (props) => ({
    customerId: requireString(props, "customerId", MAX_ID_LEN),
});
const firstOrderV1: EventValidator = (props) => ({
    orderId: requireString(props, "orderId", MAX_ID_LEN),
});
const firstBookingV1: EventValidator = (props) => ({
    bookingId: requireString(props, "bookingId", MAX_ID_LEN),
});

/**
 * The milestones added for the product funnel (DEC-125), v1. Each is stored
 * once per Organization, as the `first.*` contracts are, and carries an id
 * or a key only: the service or site that was first, which provider (its
 * name, never a key), which plan (its key, never a price).
 */
const firstServiceV1: EventValidator = (props) => ({
    serviceId: requireString(props, "serviceId", MAX_ID_LEN),
});
const firstSitePublishedV1: EventValidator = (props) => ({
    siteId: requireString(props, "siteId", MAX_ID_LEN),
});
const firstPaymentProviderV1: EventValidator = (props) => ({
    provider: requireString(props, "provider", MAX_ID_LEN),
});
const firstPlanUpgradeV1: EventValidator = (props) => ({
    planKey: requireString(props, "planKey", MAX_ID_LEN),
});

/**
 * `import.completed` (v1): counts only. Deliberately no file name and no row
 * contents — an import file is full of customer data and none of it belongs in
 * an analytics ledger.
 */
const importCompletedV1: EventValidator = (props) => ({
    entity: requireString(props, "entity", MAX_ID_LEN),
    created: requireNumber(props, "created"),
    updated: requireNumber(props, "updated"),
    failed: requireNumber(props, "failed"),
});

/** Activation event types — server-produced, never publicly ingestable. */
export const ORGANIZATION_CREATED_TYPE = "organization.created";
export const ONBOARDING_COMPLETED_TYPE = "onboarding.completed";
export const MODULE_ENABLED_TYPE = "module.enabled";
export const FIRST_PRODUCT_CREATED_TYPE = "first.product.created";
export const FIRST_CUSTOMER_CREATED_TYPE = "first.customer.created";
export const FIRST_ORDER_CREATED_TYPE = "first.order.created";
/**
 * The Appointments path's first value (#176).
 *
 * Without this, time-to-first-useful-action was not derivable for an
 * organization that only takes appointments: its first real outcome is a
 * booking, and no `first.*` event described one — so the funnel silently
 * under-counted the entire Appointments path rather than reporting zero.
 *
 * Like `first.order.created`, the row is created by a member of the PUBLIC
 * through the booking form, and like it this remains a MERCHANT event: the
 * fact recorded is that this business took its first booking. It carries an
 * opaque id and no visitor, no booker and no consent basis — nothing here
 * tracks a merchant's own customers, which is the rule this issue exists to
 * keep.
 */
export const FIRST_BOOKING_CREATED_TYPE = "first.booking.created";
export const IMPORT_COMPLETED_TYPE = "import.completed";
/**
 * The product funnel's other firsts (DEC-125): the first bookable service,
 * the first time any of the business's websites went live, the first payment
 * provider connected and the first move onto a paid plan. "First" is the
 * first since these were recorded (10 Oct 2026): a business that had
 * already published or connected before then records it the next time.
 */
export const FIRST_SERVICE_CREATED_TYPE = "first.service.created";
export const FIRST_SITE_PUBLISHED_TYPE = "first.site.published";
export const FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE =
    "first.payment-provider.connected";
export const FIRST_PLAN_UPGRADED_TYPE = "first.plan.upgraded";

/**
 * Every activation type, for tests and for the producer helper. Kept beside the
 * registry so a type added to one and forgotten in the other is visible here.
 */
export const ACTIVATION_TYPES: readonly string[] = [
    ORGANIZATION_CREATED_TYPE,
    ONBOARDING_COMPLETED_TYPE,
    MODULE_ENABLED_TYPE,
    FIRST_PRODUCT_CREATED_TYPE,
    FIRST_CUSTOMER_CREATED_TYPE,
    FIRST_ORDER_CREATED_TYPE,
    FIRST_BOOKING_CREATED_TYPE,
    IMPORT_COMPLETED_TYPE,
    FIRST_SERVICE_CREATED_TYPE,
    FIRST_SITE_PUBLISHED_TYPE,
    FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE,
    FIRST_PLAN_UPGRADED_TYPE,
];

/** The event types accepted from the PUBLIC, unauthenticated intake endpoint. */
export const SITE_VIEW_TYPE = "site.view";
export const ENQUIRY_SUBMITTED_TYPE = "enquiry.submitted";
export const ORDER_PAID_TYPE = "order.paid";
export const ORDER_REFUNDED_TYPE = "order.refunded";

/**
 * A visit's steps (U15): began, looked, started and, since DEC-181, paid.
 * Public, from the site.
 */
export const SITE_VISIT_TYPE = "site.visit";
export const SITE_LOOKED_TYPE = "site.looked";
export const SITE_STARTED_TYPE = "site.started";
export const SITE_PAID_TYPE = "site.paid";

/** The visit steps, which carry a source and never a visitor. */
export const VISIT_STEP_TYPES: ReadonlySet<string> = new Set([
    SITE_VISIT_TYPE,
    SITE_LOOKED_TYPE,
    SITE_STARTED_TYPE,
    SITE_PAID_TYPE,
]);

/**
 * Every event type that carries where a visit came from: the steps only.
 * No order carries a source (DEC-181).
 */
export const VISIT_ORIGIN_TYPES: ReadonlySet<string> = VISIT_STEP_TYPES;

/**
 * The set of event types a public visitor may ingest: a page view and the
 * visit's four steps. Org-internal types (`enquiry.submitted`,
 * `order.paid`, `order.refunded`) are produced server-side and MUST be
 * rejected on the public endpoint: a visitor can't forge a paid order.
 */
export const PUBLIC_INGESTABLE_TYPES: ReadonlySet<string> = new Set([
    SITE_VIEW_TYPE,
    ...VISIT_STEP_TYPES,
]);

/** The `(type, schemaVersion)` → validator registry. */
const REGISTRY = new Map<string, EventValidator>([
    [key(SITE_VIEW_TYPE, 1), siteViewV1],
    [key(ENQUIRY_SUBMITTED_TYPE, 1), enquirySubmittedV1],
    [key(ORDER_PAID_TYPE, 1), orderPaidV1],
    [key(ORDER_REFUNDED_TYPE, 1), orderRefundedV1],
    [key(SITE_VISIT_TYPE, 1), visitStepV1],
    [key(SITE_LOOKED_TYPE, 1), visitStepV1],
    [key(SITE_STARTED_TYPE, 1), visitStepV1],
    [key(SITE_PAID_TYPE, 1), visitStepV1],
    // Activation (#176) — server-produced only; absent from
    // PUBLIC_INGESTABLE_TYPES on purpose.
    [key(ORGANIZATION_CREATED_TYPE, 1), organizationCreatedV1],
    [key(ONBOARDING_COMPLETED_TYPE, 1), onboardingCompletedV1],
    [key(MODULE_ENABLED_TYPE, 1), moduleEnabledV1],
    [key(FIRST_PRODUCT_CREATED_TYPE, 1), firstProductV1],
    [key(FIRST_CUSTOMER_CREATED_TYPE, 1), firstCustomerV1],
    [key(FIRST_ORDER_CREATED_TYPE, 1), firstOrderV1],
    [key(FIRST_BOOKING_CREATED_TYPE, 1), firstBookingV1],
    [key(IMPORT_COMPLETED_TYPE, 1), importCompletedV1],
    [key(FIRST_SERVICE_CREATED_TYPE, 1), firstServiceV1],
    [key(FIRST_SITE_PUBLISHED_TYPE, 1), firstSitePublishedV1],
    [key(FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE, 1), firstPaymentProviderV1],
    [key(FIRST_PLAN_UPGRADED_TYPE, 1), firstPlanUpgradeV1],
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
