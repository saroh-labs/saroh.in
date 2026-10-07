import { cleanAddressInput } from "@/lib/organizations/address";

import { blockerSentence } from "./blocker-copy";
import { isHiddenByRollout } from "./rollout";
import type { ModuleView } from "./schema";
import { listWords } from "./switch-plan";
import type { FieldErrors } from "./turn-on-errors";
import type {
    AppointmentsSetup,
    CommerceSetup,
    Fulfilment,
    SetupByKey,
    SetupDefaults,
    WebsiteSetup,
} from "./turn-on-schema";
import { FALLBACK_SETUP, FULFILMENTS, hasSetup } from "./turn-on-schema";

/**
 * The rules of the "Turn on" sheet (DEC-068), pure so they are tested
 * without a browser: what turns on and in which order, what the sheet says
 * comes with it, the draft and what it sends, the problems it finds before
 * sending, where the merchant lands and what the toast says is left.
 */

type Node = Pick<ModuleView, "key" | "lifecycle" | "dependencies" | "blockers">;

/** What each module is called in the app: the rail's words, not the API's. */
const NAME: Readonly<Partial<Record<string, string>>> = {
    COMMERCE: "Sell",
    APPOINTMENTS: "Bookings",
    CRM: "Contacts",
    WEBSITE: "Website",
    PAYMENTS: "Payments",
    COMMUNICATIONS: "Communications",
    INSIGHTS: "Insights",
    COURSES: "Courses",
    CLASS_PACKS: "Class packs",
    AUTOMATIONS: "Automations",
};

export function moduleName(
    key: string,
    modules?: readonly { key: string; label?: string }[],
): string {
    return NAME[key] ?? modules?.find((m) => m.key === key)?.label ?? key;
}

/** The two whose minimum is a provider, connected now or later. */
export const CONNECT_KEYS: ReadonlySet<string> = new Set([
    "PAYMENTS",
    "COMMUNICATIONS",
]);

/** Where "Connect now" goes. */
export const PROVIDERS_HREF = "/settings/providers";

export interface TurnOnPlan {
    /** Every module to turn on, what is needed before what needs it. */
    order: string[];
    /** The ones in `order` nobody picked: they come with a pick. */
    comesWith: string[];
    /** Website, turned on because Sell sells online (DEC-069). */
    websiteForShop: boolean;
}

/**
 * What turning `picked` on switches on, in the order the API accepts:
 * each module after what it needs. Dependencies come from the module list
 * (the API's registry); where a module isn't in it, from what
 * `setup-defaults` said. What is on already is left alone.
 *
 * Selling online makes the website (DEC-069): when Sell sells by delivery
 * or shipping and Website is off, Website turns on after Sell, so the
 * location it sells from exists when the site is made.
 */
export function turnOnPlan({
    picked,
    modules,
    apiDeps = {},
    sellsOnline = false,
}: {
    picked: readonly string[];
    modules: readonly Node[];
    apiDeps?: Readonly<Partial<Record<string, readonly string[]>>>;
    sellsOnline?: boolean;
}): TurnOnPlan {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    const on = (k: string) => byKey.get(k)?.lifecycle === "ENABLED";
    const needs = (k: string) => byKey.get(k)?.dependencies ?? apiDeps[k] ?? [];
    const order: string[] = [];
    const visit = (k: string, path: readonly string[]) => {
        if (path.includes(k)) return; // a cycle is the API's bug, not a hang
        for (const dep of needs(k)) visit(dep, [...path, k]);
        if (!on(k) && !order.includes(k)) order.push(k);
    };
    for (const k of picked) visit(k, []);

    let websiteForShop = false;
    const website = byKey.get("WEBSITE");
    const commerceAt = order.indexOf("COMMERCE");
    if (
        sellsOnline &&
        commerceAt >= 0 &&
        !order.includes("WEBSITE") &&
        !on("WEBSITE") &&
        !(website && isHiddenByRollout(website))
    ) {
        order.splice(commerceAt + 1, 0, "WEBSITE");
        websiteForShop = true;
    }
    return {
        order,
        comesWith: order.filter(
            (k) => !picked.includes(k) && !(websiteForShop && k === "WEBSITE"),
        ),
        websiteForShop,
    };
}

/** Why a module brings another, in the words of the first-run cards. */
const WHY: Readonly<Record<string, string>> = {
    "APPOINTMENTS>CRM":
        "Bookings need someone to book, so Contacts comes with it.",
    "COMMUNICATIONS>CRM":
        "Messages go to your contacts, so Contacts comes with it.",
    "COURSES>APPOINTMENTS":
        "A course's sessions are bookings, so Bookings comes with it.",
    "CLASS_PACKS>APPOINTMENTS":
        "Class packs are visits people book, so Bookings comes with it.",
};

/**
 * "What comes with it": one line for each module that comes with a pick,
 * saying which pick needs it and why. Named in the app's words.
 */
export function comesWithLines(
    plan: TurnOnPlan,
    modules: readonly Node[],
    apiDeps: Readonly<Partial<Record<string, readonly string[]>>> = {},
): string[] {
    const needs = (k: string) =>
        modules.find((m) => m.key === k)?.dependencies ?? apiDeps[k] ?? [];
    return plan.comesWith.map((dep) => {
        const needer = plan.order.find((k) => needs(k).includes(dep));
        const said = needer ? WHY[`${needer}>${dep}`] : undefined;
        if (said) return said;
        const name = moduleName(dep, modules);
        return needer
            ? `${moduleName(needer, modules)} needs ${name}, so ${name} comes with it.`
            : `${name} comes with it.`;
    });
}

/** What turning each one on gives, said once in the sheet. Only what is true. */
export const GIVES: Readonly<Record<string, string>> = {
    COMMERCE: "Orders, products and customers, sold from your first location.",
    APPOINTMENTS: "A calendar people book into, with your first service.",
    CRM: "Contacts, leads and a pipeline, ready to use.",
    WEBSITE: "A starter site at your web address, ready for you to publish.",
    PAYMENTS:
        "Subscriptions, plans, and pay links on your invoices. Online payment stays off until you connect a provider.",
    COMMUNICATIONS:
        "Email and WhatsApp to your customers and leads. Nothing is sent until you connect a provider.",
    INSIGHTS: "Figures across whatever else is turned on.",
    COURSES: "A run of dated sessions with seats and a price.",
    CLASS_PACKS: "A number of visits bought up front and used over time.",
};

// ---------------------------------------------------------------- the draft

/** One day of the week in the hours editor. */
export interface DayDraft {
    weekday: number;
    on: boolean;
    open: string;
    close: string;
}

export interface TurnOnDraft {
    COMMERCE: CommerceSetup;
    APPOINTMENTS: {
        days: DayDraft[];
        name: string;
        /** As typed, in minutes. */
        duration: string;
        /** As typed, in rupees. */
        price: string;
    };
    WEBSITE: WebsiteSetup;
    /** "Connect now" for Payments and Communications; false is "Later". */
    connect: Record<string, boolean>;
}

/** The editor's week: Monday first, Sunday last. */
export const WEEK: readonly { weekday: number; short: string; long: string }[] =
    [
        { weekday: 1, short: "Mon", long: "Monday" },
        { weekday: 2, short: "Tue", long: "Tuesday" },
        { weekday: 3, short: "Wed", long: "Wednesday" },
        { weekday: 4, short: "Thu", long: "Thursday" },
        { weekday: 5, short: "Fri", long: "Friday" },
        { weekday: 6, short: "Sat", long: "Saturday" },
        { weekday: 0, short: "Sun", long: "Sunday" },
    ];

function daysFrom(hours: AppointmentsSetup["hours"]): DayDraft[] {
    return WEEK.map(({ weekday }) => {
        const row = hours.find((h) => h.weekday === weekday);
        return row
            ? { weekday, on: true, open: row.open, close: row.close }
            : { weekday, on: false, open: "10:00", close: "19:00" };
    });
}

/** The draft the sheet opens with, from what `setup-defaults` said. */
export function draftFrom(defaults: readonly SetupDefaults[]): TurnOnDraft {
    const of = <K extends keyof SetupByKey>(key: K): SetupByKey[K] =>
        (defaults.find((d) => d.key === key)?.defaults as
            SetupByKey[K] | null | undefined) ?? FALLBACK_SETUP[key];
    const bookings = of("APPOINTMENTS");
    return {
        // Copies: the draft is edited, the defaults stay as read.
        COMMERCE: {
            ...of("COMMERCE"),
            fulfilment: [...of("COMMERCE").fulfilment],
        },
        APPOINTMENTS: {
            days: daysFrom(bookings.hours),
            name: bookings.service.name,
            duration: String(bookings.service.durationMinutes),
            price: bookings.service.price,
        },
        WEBSITE: { ...of("WEBSITE") },
        connect: { PAYMENTS: true, COMMUNICATIONS: true },
    };
}

export function sellsOnline(draft: TurnOnDraft): boolean {
    return draft.COMMERCE.fulfilment.some((f) => f !== "PICKUP");
}

/** The days the API is sent, in the order they are sent (their index). */
export function openDays(draft: TurnOnDraft): DayDraft[] {
    return draft.APPOINTMENTS.days.filter((d) => d.on);
}

/**
 * "My Shop!" → "my-shop": what an address can hold, as it is typed — the
 * setup form's rule, so `--` never shows and it stops at 57 (DEC-071).
 */
export function tidyAddress(typed: string): string {
    return cleanAddressInput(typed);
}

/** What `PUT …/modules/:key` is sent as `setup`. */
export function setupFor(key: string, draft: TurnOnDraft): object {
    if (key === "COMMERCE") {
        const chosen = new Set<Fulfilment>(draft.COMMERCE.fulfilment);
        return {
            storefrontName: draft.COMMERCE.storefrontName.trim(),
            fulfilment: FULFILMENTS.filter((f) => chosen.has(f)),
        } satisfies CommerceSetup;
    }
    if (key === "APPOINTMENTS") {
        const b = draft.APPOINTMENTS;
        return {
            hours: openDays(draft).map(({ weekday, open, close }) => ({
                weekday,
                open,
                close,
            })),
            service: {
                name: b.name.trim(),
                durationMinutes: Number(b.duration.trim()),
                price: b.price.trim(),
            },
        } satisfies AppointmentsSetup;
    }
    if (key === "WEBSITE") {
        const { templateId } = draft.WEBSITE;
        return {
            siteName: draft.WEBSITE.siteName.trim(),
            address: draft.WEBSITE.address.trim(),
            // Only a choice made in the sheet; else the API picks the kind's.
            ...(templateId ? { templateId } : {}),
        } satisfies WebsiteSetup;
    }
    return {};
}

const PRICE = /^\d{1,7}(\.\d{1,2})?$/;
// 3 to 57 characters (DEC-071), never `--`; the API judges again.
const ADDRESS = /^[a-z0-9](?:[a-z0-9-]{1,55}[a-z0-9])$/;

/**
 * What must be fixed before sending, by module and field path (the same
 * paths a 400 names). The API judges again; this only saves a round trip
 * for what is plainly missing.
 */
export function problemsOf(
    draft: TurnOnDraft,
    order: readonly string[],
): Partial<Record<string, FieldErrors>> {
    const out: Partial<Record<string, FieldErrors>> = {};
    const put = (key: string, path: string, message: string) => {
        out[key] = { ...(out[key] ?? {}), [path]: message };
    };
    if (order.includes("COMMERCE")) {
        const c = draft.COMMERCE;
        if (!c.storefrontName.trim()) {
            put("COMMERCE", "storefrontName", "Give your location a name.");
        }
        if (c.fulfilment.length === 0) {
            put(
                "COMMERCE",
                "fulfilment",
                "Pick at least one way orders leave.",
            );
        }
    }
    if (order.includes("APPOINTMENTS")) {
        const b = draft.APPOINTMENTS;
        const days = openDays(draft);
        if (days.length === 0) {
            put("APPOINTMENTS", "hours", "Open on at least one day.");
        }
        days.forEach((d, i) => {
            if (d.close <= d.open) {
                put("APPOINTMENTS", `hours.${i}`, "Close after you open.");
            }
        });
        if (!b.name.trim()) {
            put("APPOINTMENTS", "service.name", "Name your first service.");
        }
        const minutes = Number(b.duration.trim());
        if (!/^\d+$/.test(b.duration.trim()) || minutes < 5 || minutes > 1440) {
            put(
                "APPOINTMENTS",
                "service.durationMinutes",
                "Say how long it takes, from 5 to 1440 minutes.",
            );
        }
        if (!PRICE.test(b.price.trim())) {
            put(
                "APPOINTMENTS",
                "service.price",
                "Write the price in rupees, like 500 or 499.50.",
            );
        }
    }
    if (order.includes("WEBSITE")) {
        const w = draft.WEBSITE;
        if (!w.siteName.trim()) {
            put("WEBSITE", "siteName", "Give your site a name.");
        }
        const address = w.address.trim();
        if (!ADDRESS.test(address)) {
            put(
                "WEBSITE",
                "address",
                "Use 3 to 57 letters, numbers or hyphens, not starting or ending with a hyphen.",
            );
        } else if (address.includes("--")) {
            put(
                "WEBSITE",
                "address",
                "An address can't have two hyphens in a row.",
            );
        }
    }
    return out;
}

/** The field paths each form draws, so any other error is said at the top. */
export function drawnField(key: string, path: string): boolean {
    if (key === "COMMERCE") {
        return path === "storefrontName" || path.startsWith("fulfilment");
    }
    if (key === "APPOINTMENTS") {
        return path.startsWith("hours") || path.startsWith("service.");
    }
    if (key === "WEBSITE") return path === "siteName" || path === "address";
    return false;
}

/**
 * An hours error, by the weekday it is about: `hours.2.open` is the third
 * open day, as the API counts them. `hours` alone is the week's.
 */
export function hoursErrorsByWeekday(
    errors: FieldErrors,
    draft: TurnOnDraft,
): Map<number, string> {
    const days = openDays(draft);
    const out = new Map<number, string>();
    for (const [path, said] of Object.entries(errors)) {
        const m = /^hours\.(\d+)/.exec(path);
        const day = m ? days[Number(m[1])] : undefined;
        if (day && !out.has(day.weekday)) out.set(day.weekday, said);
    }
    return out;
}

// ------------------------------------------------------------ after success

/** Each module's first screen, where the merchant lands once it is on. */
const FIRST_SCREEN: Readonly<Record<string, string>> = {
    COMMERCE: "/commerce/products",
    APPOINTMENTS: "/bookings",
    CRM: "/contacts",
    WEBSITE: "/sites",
    PAYMENTS: "/billing/subscriptions",
    INSIGHTS: "/analytics",
    COURSES: "/courses",
    CLASS_PACKS: "/class-packs",
};

/**
 * Where to go once it is on: Settings › Providers when "Connect now" was
 * chosen, else the first picked module's own screen. Null for a module
 * with none (Communications works in the background): stay where you are.
 */
export function landingHref(
    picked: readonly string[],
    plan: TurnOnPlan,
    draft: TurnOnDraft,
): string | null {
    if (plan.order.some((k) => CONNECT_KEYS.has(k) && draft.connect[k])) {
        return PROVIDERS_HREF;
    }
    for (const k of picked) {
        const href = FIRST_SCREEN[k];
        if (href) return href;
    }
    return null;
}

/** The gates, which are not setup a merchant can finish. */
const GATES = new Set([
    "UNAUTHORIZED",
    "ROLLOUT_DISABLED",
    "ORG_MODULE_DISABLED",
    "PROJECT_MODULE_UNSELECTED",
    "ENTITLEMENT_REQUIRED",
]);

/**
 * The "Finish setup" items left, from the readiness blockers of the modules
 * just turned on, in the app's words (never a code, DEC-057).
 */
export function finishSetupItems(
    views: readonly (ModuleView | null)[],
): string[] {
    const out: string[] = [];
    for (const view of views) {
        if (!view || view.readiness === "ACTIVE") continue;
        for (const b of view.blockers) {
            if (GATES.has(b.code)) continue;
            const said = blockerSentence(b);
            if (!out.includes(said)) out.push(said);
        }
    }
    return out;
}

/** "Bookings and Contacts are on. Finish setup: Add a bookable service." */
export function turnedOnToast(names: readonly string[], items: string[]) {
    const on = `${listWords(names)} ${names.length === 1 ? "is" : "are"} on.`;
    return items.length > 0 ? `${on} Finish setup: ${items.join(" ")}` : on;
}

export { hasSetup };
