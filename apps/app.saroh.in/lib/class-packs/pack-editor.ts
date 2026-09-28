import type { EditorCopy, EditorProblem } from "@/lib/editor-shell/types";

/*
 * The Pack Editor's rules, pure (round-2 E18, after Saroh Pack Editor.dc.html):
 * what the pack's values are, its kinds and services, the kind lock, what
 * stops Publish and what an autosave may send. "When you publish" and the
 * side column's figures are in `pack-editor-words.ts`. The editor
 * (`components/class-packs/pack-editor/`) draws them on the shared shell (D6).
 *
 * The values are E14's `PackValues` (`GET class-packs/:id/draft`), except
 * that the price is kept as typed ("4500", "4500.5") until it is sent.
 */

/** What a pack's credits pay for (E13, default 45). */
export type PackKind = "CLASSES" | "ONE_TO_ONE";

/** A pack's publishable values, as the editor holds them. */
export interface PackValues extends Record<string, unknown> {
    name: string;
    description: string | null;
    /** How many classes or sessions; null while not set. */
    credits: number | null;
    /** Days to use it in; null while not set. */
    validityDays: number | null;
    /** As typed; null while not set. */
    price: string | null;
    currency: string;
    /** The services a credit pays for, sorted. */
    serviceIds: string[];
    kind: PackKind;
    firstPackOnly: boolean;
}

/** A service the pack can pay for, as the picker and the figures need it. */
export interface PackServiceOption {
    id: string;
    name: string;
    /** More than one person at a time is a class (E13's `packKindFor`). */
    capacity: number;
    priceCents: number | null;
    currency: string | null;
    /** Taking bookings; a paused one is offered only if the pack names it. */
    active: boolean;
}

/** The API's limits (E13 `dto.ts`): a week at least, and the DTO's maxima. */
export const MIN_VALIDITY_DAYS = 7;
export const MAX_VALIDITY_DAYS = 3650;
export const MAX_CREDITS = 500;
export const MAX_DESCRIPTION = 500;

/** "Use within", as the design offers it, then "Other…". */
export const VALIDITY_CHIPS = [21, 30, 60, 90, 180] as const;

export const KIND_OPTIONS: readonly { value: PackKind; label: string }[] = [
    { value: "CLASSES", label: "Classes" },
    { value: "ONE_TO_ONE", label: "One-to-one sessions" },
];

/** E13's words when a sold pack's kind would change (`pack-kind.ts`). */
export const KIND_LOCKED =
    "This pack has been sold, so it stays the kind it was sold as.";

export const unitsOf = (kind: PackKind) =>
    kind === "ONE_TO_ONE" ? "sessions" : "classes";
export const unitOf = (kind: PackKind) =>
    kind === "ONE_TO_ONE" ? "session" : "class";

/** The kind of pack that pays for a service (E13's `packKindFor`). */
export function kindOfService(s: { capacity: number }): PackKind {
    return s.capacity > 1 ? "CLASSES" : "ONE_TO_ONE";
}

/**
 * Whether Pack Detail (`/class-packs/:id`, E16) exists, so the editor offers
 * "View pack" for a live pack as the design does. E16 builds the page and
 * turns this on; until then the link would lead nowhere, so it isn't shown.
 */
export const PACK_DETAIL_PAGE = false as boolean;

/** The header's and the leave dialog's words for a pack (D6's `EditorCopy`). */
export const PACK_COPY: EditorCopy = {
    noun: "pack",
    liveLabel: "On sale",
    liveClean: "On sale · no changes",
    draftSaved: "Draft · saved — not on the booking page",
    draftFirstSaved:
        "Saved as a draft — not on sale, only your team can see it. Delete draft if you change your mind.",
    notStarted: "Not saved yet — start with a name",
    viewLabel: "View pack",
};

/** A field's name in the leave dialog ("Your changes to price aren't saved"). */
export const PACK_FIELD_LABELS: Partial<Record<keyof PackValues, string>> = {
    name: "name",
    description: "description",
    credits: "how many",
    validityDays: "use within",
    price: "price",
    serviceIds: "what it's good for",
    kind: "what credits are for",
    firstPackOnly: "who can buy it",
};

// — Reading what is typed ——————————————————————————————————————————————

/** Digits only, as the design's number fields take them; "" is not set. */
export function parseWhole(text: string): number | null {
    const digits = text.replace(/[^0-9]/g, "").slice(0, 6);
    return digits ? Number(digits) : null;
}

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * A typed price as the API takes it ("4,500." → "4500"), or null when it
 * isn't one yet. Money stays a string (frontend-forms.md).
 */
export function normalPrice(text: string | null): string | null {
    if (text === null) return null;
    const t = text.trim().replace(/,/g, "").replace(/\.$/, "");
    return MONEY.test(t) ? t : null;
}

/** The price as a number for the figures; null when not a price yet. */
export function priceAmount(text: string | null): number | null {
    const p = normalPrice(text);
    return p === null ? null : Number(p);
}

/** The server's "4500.00" as the field shows it: "4500". */
export function tidyPrice(price: string | null): string | null {
    if (price === null) return null;
    return price.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

// — Services ——————————————————————————————————————————————————————————

/**
 * The services the picker offers for a kind: those taking bookings, and any
 * the pack already names, so a paused one stays chosen rather than vanishing.
 */
export function servicesFor(
    kind: PackKind,
    services: readonly PackServiceOption[],
    chosen: readonly string[],
): PackServiceOption[] {
    return services.filter(
        (s) => chosen.includes(s.id) || (s.active && kindOfService(s) === kind),
    );
}

/** The services a new pack of this kind starts with: every one on offer. */
export function defaultServiceIds(
    kind: PackKind,
    services: readonly PackServiceOption[],
): string[] {
    return services
        .filter((s) => s.active && kindOfService(s) === kind)
        .map((s) => s.id)
        .sort();
}

/** A new pack's values, before anything is typed (the design's defaults). */
export function newPackValues(
    kind: PackKind,
    services: readonly PackServiceOption[],
    currency: string,
): PackValues {
    return {
        name: "",
        description: null,
        credits: kind === "ONE_TO_ONE" ? 5 : 10,
        validityDays: 90,
        price: null,
        currency,
        serviceIds: defaultServiceIds(kind, services),
        kind,
        firstPackOnly: false,
    };
}

/** Switching the kind swaps what it is good for: credits never mix. */
export function switchKind(
    kind: PackKind,
    services: readonly PackServiceOption[],
): Pick<PackValues, "kind" | "serviceIds"> {
    return { kind, serviceIds: defaultServiceIds(kind, services) };
}

/** Add or take away one service; the set stays sorted, as the API keeps it. */
export function toggleService(ids: readonly string[], id: string): string[] {
    return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].sort();
}

// — The kind lock (E13) ———————————————————————————————————————————————

/**
 * Whether the kind can't change: a live pack that has been sold, or whose
 * sales couldn't be counted (the server would refuse it either way).
 */
export function kindLocked(live: boolean, sold: number | null): boolean {
    return live && sold !== 0;
}

/** The line under "Credits are for". */
export function kindNote(live: boolean, sold: number | null): string {
    if (live && sold === null) {
        return "Locked — we couldn't check whether it has been sold. Class and one-to-one credits never mix.";
    }
    if (live && sold !== null && sold > 0) {
        return `Locked — ${sold} already sold. Class and one-to-one credits never mix.`;
    }
    return "Class credits and one-to-one credits never mix.";
}

// — What stops Publish ————————————————————————————————————————————————

/**
 * Every rule the values break, beside its field (the API's field names, so
 * a refusal from Publish lands in the same place). Mirrors E14's
 * `packProblems`, in the design's words.
 */
export function packProblems(
    values: PackValues,
    context: {
        /** Null when the services couldn't be read. */
        services: readonly PackServiceOption[] | null;
        sold: number | null;
        published: PackValues | null;
    },
): EditorProblem[] {
    const out: EditorProblem[] = [];
    const units = unitsOf(values.kind);
    if (!values.name.trim()) {
        out.push({ field: "name", message: "Give it a name" });
    }
    if ((values.description?.length ?? 0) > MAX_DESCRIPTION) {
        out.push({
            field: "description",
            message: `Keep the description under ${MAX_DESCRIPTION} characters`,
        });
    }
    if (values.credits === null || values.credits < 1) {
        out.push({ field: "credits", message: `How many ${units}?` });
    } else if (values.credits > MAX_CREDITS) {
        out.push({
            field: "credits",
            message: `${MAX_CREDITS} is the most in one pack`,
        });
    }
    const price = priceAmount(values.price);
    if (values.price?.trim() && price === null) {
        out.push({ field: "price", message: "A price like 4000 or 4000.50" });
    } else if (!price) {
        out.push({ field: "price", message: "Add the price" });
    }
    if (
        values.validityDays === null ||
        values.validityDays < MIN_VALIDITY_DAYS
    ) {
        out.push({
            field: "validityDays",
            message: "Give at least 7 days to use it",
        });
    } else if (values.validityDays > MAX_VALIDITY_DAYS) {
        out.push({
            field: "validityDays",
            message: "A pack lasts 10 years at most",
        });
    }
    const { published, sold, services } = context;
    if (
        published &&
        sold !== null &&
        sold > 0 &&
        values.kind !== published.kind
    ) {
        out.push({ field: "kind", message: KIND_LOCKED });
    }
    if (values.serviceIds.length === 0) {
        out.push({ field: "serviceIds", message: "Pick what it's good for" });
    } else if (
        services &&
        values.serviceIds.some((id) => !services.some((s) => s.id === id))
    ) {
        out.push({
            field: "serviceIds",
            message: `One of the ${units} it paid for has been deleted — pick again`,
        });
    }
    return out;
}

/** Why nothing can be saved yet: a pack needs a name, new or not. */
export function packBlocker(values: PackValues): string | null {
    return values.name.trim() ? null : "Add a name to save the draft";
}

// — What an autosave sends ————————————————————————————————————————————

/**
 * The values as E14's `PATCH :id/draft` takes them. A field emptied is sent
 * as null (a draft not finished yet). A field holding something the API
 * would refuse — "4500.", 5 days, 0 classes — is left out, so the rest still
 * saves; its problem keeps Publish off until it is fixed.
 */
export function packPayload(values: PackValues): Partial<PackValues> {
    const out: Partial<PackValues> = {
        currency: values.currency,
        serviceIds: values.serviceIds,
        kind: values.kind,
        firstPackOnly: values.firstPackOnly,
    };
    const name = values.name.trim();
    if (name) out.name = name.slice(0, 120);
    const description = values.description?.trim() ?? "";
    if (description.length <= MAX_DESCRIPTION) {
        out.description = description || null;
    }
    if (values.credits === null) out.credits = null;
    else if (values.credits >= 1 && values.credits <= MAX_CREDITS) {
        out.credits = values.credits;
    }
    if (values.validityDays === null) out.validityDays = null;
    else if (
        values.validityDays >= MIN_VALIDITY_DAYS &&
        values.validityDays <= MAX_VALIDITY_DAYS
    ) {
        out.validityDays = values.validityDays;
    }
    if (!values.price?.trim()) out.price = null;
    else {
        const price = normalPrice(values.price);
        if (price !== null) out.price = price;
    }
    return out;
}
