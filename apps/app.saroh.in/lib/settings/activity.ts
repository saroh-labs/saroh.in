import { productHref } from "@/lib/products/links";

import { BUSINESS_TAB_PARAM, TEAM_TAB_PARAM } from "./search";

/**
 * Settings › Activity ("Saroh Settings" design): the audit stream said in
 * plain English — "Priya changed the invoice prefix to RC", "Priya invited
 * meera@ryeandco.in as Member" — each line with the place it happened.
 *
 * Only what the stream records. A settings save records the NAMES of the
 * fields it touched and, since #509, each business detail's value before
 * and after (`metadata.changes`); the contact email and the website stay
 * names only. So a line says the new value when there is one short enough
 * to read in a sentence, and "updated the invoice prefix" for an earlier
 * save that kept none. A role change records from and to; an invitation,
 * the role; a module switched on or off, its name; a plan, from and to; a
 * product marked sold out by hand or available again (#515), the product
 * and the storefront.
 *
 * Pure: the page reads the events (`lib/settings/activity-service.ts`) and
 * this turns each into a line, or drops it. The sheet a row opens, with
 * the whole of what changed, is `activity-detail.ts`.
 *
 * Track stock turned on or off (#515), for a product or the business, says
 * what it did in the same voice: "turned Track stock off for Plum jam — 38
 * set to 0", "turned Track stock on for Plum jam with its first count".
 */

/**
 * The actions the page asks for: the business's settings and its team, and
 * the hand-marked Sold out (#515) — a change to what the shop sells that no
 * stock log records.
 */
export const ACTIVITY_ACTIONS = [
    "organization.onboard",
    "profile.update",
    "storefront.hours.update",
    "organization.module.enabled",
    "organization.module.disabled",
    "organization.plan.changed",
    "membership.invite",
    "membership.accept",
    "membership.role.update",
    "membership.remove",
    "product.sold-out.mark",
    "product.sold-out.clear",
    "product.stock-tracking.on",
    "product.stock-tracking.off",
    "business.stock-tracking.on",
    "business.stock-tracking.off",
] as const;

/** Someone an event names, as they are now; `null` when they are gone. */
export interface AuditPerson {
    name: string | null;
    email: string;
    /** Their role key here now; null when they left. Absent from an older API. */
    role?: string | null;
}

/** One row of `GET /organizations/:id/audit`. */
export interface AuditEventRow {
    id: string;
    action: string;
    actorUserId: string;
    targetType: string | null;
    targetId: string | null;
    outcome: string;
    metadata: unknown;
    createdAt: string;
    actor: AuditPerson | null;
    target: AuditPerson | null;
}

export interface ActivityLine {
    id: string;
    at: string;
    /** Who did it: their name, else their email. */
    who: string;
    /** What they did, as the rest of the sentence. */
    what: string;
    /** Where it lives, to open. */
    where: { label: string; href: string };
}

type BusinessTab = "identity" | "contact" | "tax" | "hours" | "address";

const TAB_LABEL: Record<BusinessTab, string> = {
    identity: "Identity",
    contact: "Contact",
    tax: "Tax and invoices",
    hours: "Hours",
    address: "Address",
};

/**
 * Every field a settings save records: how a sentence names it, how the
 * sheet labels it, and the Business tab it is on. The four address lines
 * are one thing to a person — "the registered address" — so they share a
 * phrase and say it once; a newer save records them as one
 * `registeredAddress`.
 */
export const FIELD_PHRASES: Partial<
    Record<string, { phrase: string; label: string; tab: BusinessTab }>
> = {
    name: {
        phrase: "the business name",
        label: "Business name",
        tab: "identity",
    },
    legalName: {
        phrase: "the legal name",
        label: "Legal name",
        tab: "identity",
    },
    type: {
        phrase: "the type of business",
        label: "Type of business",
        tab: "identity",
    },
    logo: { phrase: "the logo", label: "Logo", tab: "identity" },
    timezone: { phrase: "the time zone", label: "Time zone", tab: "identity" },
    contactEmail: {
        phrase: "the contact email",
        label: "Contact email",
        tab: "contact",
    },
    website: { phrase: "the website", label: "Website", tab: "contact" },
    phone: { phrase: "the phone number", label: "Phone", tab: "contact" },
    gstRegistered: {
        phrase: "the GST registration",
        label: "GST registration",
        tab: "tax",
    },
    taxId: { phrase: "the GSTIN", label: "GSTIN or tax ID", tab: "tax" },
    invoicePrefix: {
        phrase: "the invoice prefix",
        label: "Invoice prefix",
        tab: "tax",
    },
    invoiceNumberFormat: {
        phrase: "the invoice number format",
        label: "Invoice number format",
        tab: "tax",
    },
    deliveryGstRate: {
        phrase: "GST on delivery",
        label: "GST on delivery",
        tab: "tax",
    },
    deliverySacCode: {
        phrase: "the delivery SAC",
        label: "Delivery SAC",
        tab: "tax",
    },
    openingHours: {
        phrase: "the opening hours",
        label: "Opening hours",
        tab: "hours",
    },
    registeredAddress: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    addressLine1: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    addressLine2: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    city: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    postalCode: {
        phrase: "the registered address",
        label: "Registered address",
        tab: "address",
    },
    gstState: { phrase: "the state", label: "State", tab: "address" },
    country: { phrase: "the country", label: "Country", tab: "address" },
};

const BUILT_IN_ROLES: Partial<Record<string, string>> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

export type RoleLabels = Readonly<Partial<Record<string, string>>>;

const TEAM = (view: "people" | "roles" = "people") => ({
    label: "Team",
    href: `/settings/people?${TEAM_TAB_PARAM}=${view}`,
});
const MODULES = { label: "Modules", href: "/settings/modules" };
const PRODUCTS = { label: "Products", href: "/commerce/products" };
const PLAN = { label: "Plan and billing", href: "/settings/billing" };

const business = (tab?: BusinessTab) => ({
    label: tab ? TAB_LABEL[tab] : "Business",
    href: tab
        ? `/settings/organization?${BUSINESS_TAB_PARAM}=${tab}`
        : "/settings/organization",
});

/** The product a Sold out change was about, at the storefront it was made. */
function productPlace(
    productId: string | null,
    meta: Record<string, unknown>,
): ActivityLine["where"] {
    if (!productId) return { label: "Products", href: "/commerce/products" };
    return {
        label: text(meta.product) ?? "Product",
        href: productHref(text(meta.storefrontId), productId),
    };
}

export function personName(person: AuditPerson | null): string | null {
    if (!person) return null;
    // A blank name is no name: say the email instead.
    const name = person.name?.trim();
    if (name) return name;
    return person.email;
}

/** "a, b and c" */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

export const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** A whole count the stream recorded, or `null`. */
export const countOf = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : null;

/** "1 storefront", "2 storefronts", with Indian digit grouping. */
export const counted = (n: number, one: string, many = `${one}s`): string =>
    `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/**
 * What turning Track stock on or off did, as the tail of a sentence:
 * " — 38 set to 0", " — cleared Sold out at 2 storefronts". Empty when it
 * did nothing worth saying.
 */
function trackingTail(on: boolean, meta: Record<string, unknown>): string {
    if (on) {
        const cleared = countOf(meta.soldOutCleared) ?? 0;
        return cleared > 0
            ? ` — cleared Sold out at ${counted(cleared, "storefront")}`
            : "";
    }
    const units = countOf(meta.unitsZeroed) ?? 0;
    return units > 0 ? ` — ${units.toLocaleString("en-IN")} set to 0` : "";
}

/** A value as recorded: plain, or nothing. */
export type ChangeValue = string | number | boolean | null;

/** One field a save changed, as the stream recorded it. */
export interface RecordedChange {
    field: string;
    before: ChangeValue;
    after: ChangeValue;
}

const plainValue = (v: unknown): ChangeValue =>
    typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? v
        : null;

/**
 * The values a save recorded, or `null` for a save from before values were
 * kept (#509) — which is not the same as a save that changed none.
 */
export function recordedChanges(
    meta: Record<string, unknown>,
): RecordedChange[] | null {
    if (!Array.isArray(meta.changes)) return null;
    return meta.changes.flatMap((c): RecordedChange[] => {
        const r = record(c);
        return typeof r.field === "string"
            ? [
                  {
                      field: r.field,
                      before: plainValue(r.before),
                      after: plainValue(r.after),
                  },
              ]
            : [];
    });
}

export const fieldsOf = (meta: Record<string, unknown>): string[] =>
    Array.isArray(meta.fields)
        ? meta.fields.filter((f): f is string => typeof f === "string")
        : [];

/** Values too long to read inside a sentence; the sheet shows them. */
const LONG_FIELDS = new Set([
    "registeredAddress",
    "openingHours",
    "invoiceNumberFormat",
]);
const MAX_SENTENCE_VALUE = 32;

/**
 * One field's change said with its value: "changed the invoice prefix to
 * RC", "cleared the delivery SAC", "registered for GST", "added the logo".
 * Null when the value is too long for a sentence, or not a string.
 */
function valueSentence(change: RecordedChange): string | null {
    const known = FIELD_PHRASES[change.field];
    if (!known) return null;
    if (change.field === "logo") {
        return typeof change.after === "string"
            ? `${change.after} the logo`
            : null;
    }
    if (change.field === "gstRegistered") {
        if (change.after === true) return "registered the business for GST";
        if (change.after === false) return "took the business off GST";
        return null;
    }
    if (change.after === null) return `cleared ${known.phrase}`;
    if (LONG_FIELDS.has(change.field)) return null;
    const after = String(change.after);
    if (after.length > MAX_SENTENCE_VALUE) return null;
    return `changed ${known.phrase} to ${after}`;
}

/**
 * "updated the GSTIN and the invoice prefix". Up to three things are named;
 * past that, the first two and how many more. A field this map does not know
 * is counted, not guessed at. One field with a short recorded value is said
 * with it.
 */
function profileChange(
    fields: readonly string[],
    changes: readonly RecordedChange[] | null,
): { what: string; tab?: BusinessTab } {
    const only = changes?.length === 1 ? changes[0] : undefined;
    const sameField =
        only &&
        (fields.length === 0 ||
            fields.every(
                (f) =>
                    FIELD_PHRASES[f]?.phrase ===
                    FIELD_PHRASES[only.field]?.phrase,
            ));
    if (only && sameField) {
        const said = valueSentence(only);
        if (said) return { what: said, tab: FIELD_PHRASES[only.field]?.tab };
    }
    if (fields.length === 1 && fields[0] === "logo") {
        return { what: "changed the logo", tab: "identity" };
    }
    const phrases: string[] = [];
    const tabs: BusinessTab[] = [];
    let unknown = 0;
    for (const field of fields) {
        const known = FIELD_PHRASES[field];
        if (!known) {
            unknown += 1;
            continue;
        }
        if (!phrases.includes(known.phrase)) phrases.push(known.phrase);
        tabs.push(known.tab);
    }
    const tab = tabs[0];
    if (phrases.length === 0) {
        return { what: "updated the business details" };
    }
    if (phrases.length <= 3 && unknown === 0) {
        return { what: `updated ${list(phrases)}`, tab };
    }
    const named = phrases.slice(0, 2);
    const extra = phrases.length - named.length + unknown;
    const others = `${extra} other ${extra === 1 ? "detail" : "details"}`;
    return { what: `updated ${named.join(", ")} and ${others}`, tab };
}

/** A module's name as recorded, else its key in words ("PAYMENTS" → "Payments"). */
export function moduleName(
    meta: Record<string, unknown>,
    key: string | null,
): string {
    const named = text(meta.module);
    if (named) return named;
    if (!key) return "a module";
    return key.charAt(0) + key.slice(1).toLowerCase();
}

/**
 * One event as a line, or `null` for one this page does not tell: an action
 * outside {@link ACTIVITY_ACTIONS}, or one that was refused or failed —
 * nothing changed, so there is nothing to report as a change.
 *
 * `roleLabels` names a role the business invented; the built-ins are known.
 */
export function activityLine(
    event: AuditEventRow,
    roleLabels: RoleLabels = {},
): ActivityLine | null {
    if (event.outcome !== "SUCCESS") return null;
    const meta = record(event.metadata);
    const role = (key: unknown) => roleName(key, roleLabels);
    const who = personName(event.actor) ?? "Someone no longer here";
    const target = personName(event.target);
    const line = (what: string, where: ActivityLine["where"]) => ({
        id: event.id,
        at: event.createdAt,
        who,
        what,
        where,
    });

    switch (event.action) {
        case "organization.onboard":
            return line("set up the business", business());
        case "profile.update": {
            const change = profileChange(fieldsOf(meta), recordedChanges(meta));
            return line(change.what, business(change.tab));
        }
        case "storefront.hours.update":
            return line("changed the opening hours", business("hours"));
        case "organization.module.enabled":
            return line(
                `switched on ${moduleName(meta, event.targetId)}`,
                MODULES,
            );
        case "organization.module.disabled":
            return line(
                `switched off ${moduleName(meta, event.targetId)}`,
                MODULES,
            );
        case "organization.plan.changed": {
            const from = text(meta.from);
            const to = text(meta.to);
            if (from && to)
                return line(`moved the plan from ${from} to ${to}`, PLAN);
            if (to) return line(`moved the business to the ${to} plan`, PLAN);
            return line("changed the plan", PLAN);
        }
        case "membership.invite": {
            const as = role(meta.role);
            return line(
                `invited ${target ?? "someone"}${as ? ` as ${as}` : ""}`,
                TEAM(),
            );
        }
        case "membership.accept": {
            const as = role(meta.role);
            return line(`joined the team${as ? ` as ${as}` : ""}`, TEAM());
        }
        case "membership.role.update": {
            const from = role(meta.from);
            const to = role(meta.to);
            const whom = target ?? "someone";
            if (from && to && from !== to) {
                return line(`moved ${whom} from ${from} to ${to}`, TEAM());
            }
            if (to) return line(`made ${whom} ${to}`, TEAM());
            return line(`changed ${whom}'s role`, TEAM());
        }
        case "membership.remove":
            return line(`removed ${target ?? "someone"} from the team`, TEAM());
        case "product.sold-out.mark":
        case "product.sold-out.clear": {
            const product = text(meta.product) ?? "a product";
            const at = text(meta.storefront);
            const where = at ? ` at ${at}` : "";
            return line(
                event.action === "product.sold-out.mark"
                    ? `marked ${product} sold out${where}`
                    : `marked ${product} available again${where}`,
                productPlace(event.targetId, meta),
            );
        }
        case "product.stock-tracking.on":
        case "product.stock-tracking.off": {
            const on = event.action === "product.stock-tracking.on";
            const product = text(meta.product) ?? "a product";
            const how =
                on && meta.startedWithCount === true
                    ? " with its first count"
                    : "";
            return line(
                `turned Track stock ${on ? "on" : "off"} for ${product}${how}${trackingTail(on, meta)}`,
                productPlace(event.targetId, meta),
            );
        }
        case "business.stock-tracking.on":
        case "business.stock-tracking.off": {
            const on = event.action === "business.stock-tracking.on";
            return line(
                `turned Track stock ${on ? "on" : "off"} for the business`,
                PRODUCTS,
            );
        }
        default:
            return null;
    }
}

export function roleName(key: unknown, roleLabels: RoleLabels): string | null {
    return typeof key === "string"
        ? (roleLabels[key] ?? BUILT_IN_ROLES[key] ?? null)
        : null;
}

/** The events as lines, newest first as they came, dropping the untold. */
export function activityLines(
    events: readonly AuditEventRow[],
    roleLabels?: RoleLabels,
): ActivityLine[] {
    return events.flatMap((event) => {
        const line = activityLine(event, roleLabels);
        return line ? [line] : [];
    });
}
