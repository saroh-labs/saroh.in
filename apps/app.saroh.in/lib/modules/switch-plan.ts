import type { ModuleView } from "./schema";

/**
 * What flipping one module's switch really does, worked out from the
 * dependencies the API sends (`ModuleView.dependencies`, from its module
 * registry) — never from a list kept here, so it cannot drift from the rule
 * the API enforces.
 *
 * The API refuses to turn a module off while one that needs it is on, and to
 * turn one on before what it needs. The screen does the ordering for the
 * merchant instead of handing them the refusal: switching Appointments off
 * takes Courses with it first, and "Turn on Appointments and Courses" turns
 * both on in the order the API accepts.
 */

type Node = Pick<ModuleView, "key" | "lifecycle" | "dependencies">;

/**
 * Every module that is on and needs `key`, directly or through another, in
 * the order to turn them off: a module before anything it needs.
 */
export function enabledDependents(modules: Node[], key: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>([key]);
    const visit = (of: string) => {
        for (const m of modules) {
            if (seen.has(m.key) || !m.dependencies.includes(of)) continue;
            seen.add(m.key);
            // Post-order: what needs `m` goes before `m` itself.
            visit(m.key);
            if (m.lifecycle === "ENABLED") out.push(m.key);
        }
    };
    visit(key);
    return out;
}

/**
 * What turning `key` off turns off with it (F13, DEC-067): every module that
 * is on and needs it, in the order to turn them off — and only ones the
 * business can see (`shown`), so each is named in the confirmation. One
 * Saroh hasn't rolled out (DEC-057) is left as it is, never switched off
 * unnamed; `kept` lists them, for a test to say so.
 */
export function offPlan(
    shown: Node[],
    all: Node[],
    key: string,
): { off: string[]; kept: string[] } {
    const visible = new Set(shown.map((m) => m.key));
    const every = enabledDependents(all, key);
    return {
        off: every.filter((k) => visible.has(k)),
        kept: every.filter((k) => !visible.has(k)),
    };
}

/**
 * Every module `key` needs, directly or through another, that is not on — in
 * the order to turn them on: a module after everything it needs.
 */
export function missingDependencies(modules: Node[], key: string): string[] {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    const out: string[] = [];
    const seen = new Set<string>([key]);
    const visit = (of: string) => {
        for (const dep of byKey.get(of)?.dependencies ?? []) {
            if (seen.has(dep)) continue;
            seen.add(dep);
            visit(dep);
            if (byKey.get(dep)?.lifecycle !== "ENABLED") out.push(dep);
        }
    };
    visit(key);
    return out;
}

/** "Sell, Storefront and Products" — a sentence, not a comma-separated dump. */
export function listWords(words: readonly string[]): string {
    if (words.length <= 1) return words[0] ?? "";
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Said when the API couldn't be asked what turning it off touches. */
export const IMPACT_UNREAD = "We couldn't count what this touches right now.";

/**
 * What turning a module off changes, said when someone asks to ("Turn off
 * Appointments? …"). First the API's lines, with real counts (F13: "3
 * upcoming bookings stay booked; the booking page stops taking new ones"),
 * then what this screen knows itself: the modules that go with it and the
 * rows that leave the rail. It ends "Nothing is deleted". A module with
 * none of these (it works in the background) gets no sentence rather than
 * an invented consequence, and so goes off without being asked about.
 */
export function offImpact({
    rows,
    dependents,
    lines = [],
}: {
    /** The rail rows that leave: this module's and its dependents'. */
    rows: readonly string[];
    /** Labels of the modules that turn off with it. */
    dependents: readonly string[];
    /**
     * The API's sentences, each already a sentence; null when the API
     * couldn't be asked, which is said rather than passed over.
     */
    lines?: readonly string[] | null;
}): string | null {
    const parts: string[] = [];
    if (dependents.length > 0) {
        parts.push(
            `${listWords(dependents)} ${dependents.length === 1 ? "turns" : "turn"} off with it`,
        );
    }
    if (rows.length > 0) {
        parts.push(
            `${listWords(rows)} ${rows.length === 1 ? "leaves" : "leave"} the rail`,
        );
    }
    const said = parts.join(", and ");
    const sentences = [
        ...(lines ?? [IMPACT_UNREAD]),
        ...(said ? [`${said.charAt(0).toUpperCase()}${said.slice(1)}.`] : []),
    ];
    if (sentences.length === 0) return null;
    return `${sentences.join(" ")} Nothing is deleted.`;
}

/**
 * The button beside a setup step, by the API's blocker code. A code without a
 * verb here still shows its sentence; it just gets no button, so a new code
 * can never produce a button that says the wrong thing.
 */
const SETUP_ACTION: Record<string, string> = {
    CRM_NO_PIPELINE: "Add a lead",
    WEBSITE_NO_SITE: "Create a site",
    WEBSITE_NO_PUBLICATION: "Publish your site",
    WEBSITE_SHOP_NOT_CHOSEN: "Choose location",
    APPOINTMENTS_NO_SERVICE: "Add a service",
    APPOINTMENTS_NO_AVAILABILITY: "Set availability",
    COURSES_NO_COURSE: "Make a course",
    COURSES_NONE_OPEN: "Open a course",
    CLASS_PACKS_NO_PACK: "Make a pack",
    CLASS_PACKS_NONE_ON_SALE: "Go to Class packs",
    COMMERCE_NO_CATALOG: "Add a product",
    PAYMENTS_NO_PROVIDER: "Connect a provider",
    PAYMENTS_PROVIDER_DISABLED: "Go to Providers",
    PAYMENTS_WEBHOOK_SECRET_MISSING: "Add webhook secret",
    PAYMENTS_KEYS_REFUSED: "Enter keys again",
    COMMUNICATIONS_NO_PROVIDER: "Connect a provider",
    COMMUNICATIONS_PROVIDER_DISABLED: "Go to Providers",
    COMMUNICATIONS_KEYS_REFUSED: "Enter keys again",
};

export function setupActionLabel(code: string): string | null {
    return SETUP_ACTION[code] ?? null;
}

/** The button beside something that refuses a turn-off, by its code. */
const REFUSAL_ACTION: Record<string, string> = {
    COMMERCE_OPEN_ORDERS: "Go to Orders",
};

export function refusalActionLabel(code: string): string | null {
    return REFUSAL_ACTION[code] ?? null;
}
