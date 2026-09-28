import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { appointmentsOpen } from "../bookings/appointments-open";
import type { ModuleKey } from "../capabilities/module-registry";
import { MODULE_BY_KEY } from "../capabilities/module-registry";
import { classPacksOn } from "../class-packs/class-packs-on";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { paymentsOn } from "../invoices/payments-on";
import type { PricesOffer } from "./module-page-sections";
import type { ModulePageKind } from "./page-kinds";
import { MODULE_PAGE_KINDS } from "./page-kinds";
import { commerceOpen, shopRolloutOn } from "./sells-from";

/**
 * Whether a module page kind can be shown for a business (G14): the gate
 * adding one asks, and the one the site will ask at view time (G15, G19).
 * The kinds themselves, their addresses and titles are in `page-kinds.ts`.
 */

/**
 * Whether a kind's module is on for a business:
 * - `on`: it can be added, and a published one shows;
 * - `off`: the merchant switched the module off (`module` names it, for
 *   "Turn on Commerce");
 * - `unavailable`: the module isn't rolled out for the business, so the
 *   kind is shown nowhere and never named (DEC-057).
 */
export type ModulePageState =
    | { state: "on" }
    | { state: "off"; module: string }
    | { state: "unavailable" };

// Stateless (it reads the flag rows on every call).
const flags = new FeatureFlagService();

type ModuleDb = Pick<Prisma.TransactionClient, "organizationModule">;

async function rolledOut(
    key: ModuleKey,
    organizationId: string,
): Promise<boolean> {
    const descriptor = MODULE_BY_KEY.get(key);
    return descriptor
        ? flags.isEnabled(descriptor.rolloutFlag, organizationId)
        : false;
}

function label(key: ModuleKey): string {
    return MODULE_BY_KEY.get(key)?.label ?? key;
}

/**
 * Each kind asks the gate its own public reads ask, so a page can't be added
 * for something its route or blocks would then refuse to show:
 * - Shop: the shop is open (`SITE_SHOP`), Commerce rolled out and on — the
 *   catalogue's `inShop`;
 * - Book: Appointments rolled out and on — the booking page's;
 * - Prices: Payments (plans) or Class packs (packs), rolled out and on;
 * - Journal and Contact: nothing beyond the website itself.
 *
 * A module row that is missing counts as on, as every public gate reads it.
 */
export async function modulePageState(
    kind: ModulePageKind,
    organizationId: string,
    db: ModuleDb = prisma,
): Promise<ModulePageState> {
    switch (kind) {
        case "SHOP": {
            const [shop, commerce] = await Promise.all([
                shopRolloutOn(organizationId),
                rolledOut("COMMERCE", organizationId),
            ]);
            if (!shop || !commerce) return { state: "unavailable" };
            return (await commerceOpen(db, organizationId))
                ? { state: "on" }
                : { state: "off", module: label("COMMERCE") };
        }
        case "BOOK": {
            if (!(await rolledOut("APPOINTMENTS", organizationId))) {
                return { state: "unavailable" };
            }
            return (await appointmentsOpen(organizationId))
                ? { state: "on" }
                : { state: "off", module: label("APPOINTMENTS") };
        }
        case "PRICES": {
            const [payments, packs] = await Promise.all([
                rolledOut("PAYMENTS", organizationId),
                rolledOut("CLASS_PACKS", organizationId),
            ]);
            if (!payments && !packs) return { state: "unavailable" };
            const [paymentsIsOn, packsIsOn] = await Promise.all([
                payments ? paymentsOn(db, organizationId) : false,
                packs ? classPacksOn(db, organizationId) : false,
            ]);
            if (paymentsIsOn || packsIsOn) return { state: "on" };
            // Only what is rolled out is named.
            const named = [
                ...(payments ? [label("PAYMENTS")] : []),
                ...(packs ? [label("CLASS_PACKS")] : []),
            ];
            return { state: "off", module: named.join(" or ") };
        }
        case "JOURNAL":
        case "CONTACT":
            return { state: "on" };
    }
}

/**
 * What a new Prices page can offer (G20), each asked as the page's own gate
 * asks it: single visits with Appointments rolled out and on, plans with
 * Payments, packs with Class packs. Its default sections follow, so none
 * names a module that is off or not rolled out (DEC-057).
 */
export async function pricesOffer(
    organizationId: string,
    db: ModuleDb = prisma,
): Promise<PricesOffer> {
    const [book, payments, packs] = await Promise.all([
        modulePageState("BOOK", organizationId, db),
        rolledOut("PAYMENTS", organizationId),
        rolledOut("CLASS_PACKS", organizationId),
    ]);
    const [plansOn, packsOn] = await Promise.all([
        payments ? paymentsOn(db, organizationId) : false,
        packs ? classPacksOn(db, organizationId) : false,
    ]);
    return { once: book.state === "on", plans: plansOn, packs: packsOn };
}

/** The kinds a site could add now: on, and not on the site yet. */
export async function addableModulePageKinds(
    organizationId: string,
    present: readonly string[],
): Promise<ModulePageKind[]> {
    const have = new Set(present);
    const missing = MODULE_PAGE_KINDS.filter((kind) => !have.has(kind));
    const states = await Promise.all(
        missing.map((kind) => modulePageState(kind, organizationId)),
    );
    return missing.filter((_, i) => states[i]?.state === "on");
}

/**
 * A published module page's state as the live site reads it (G15): `on`
 * draws it; `off` takes it out of the menu and shows "This isn't available
 * right now" at its address. A module that isn't rolled out for the
 * business is `off` too: the site never shows it (DEC-057), and never says
 * which module it was.
 */
export type PublicModulePageState = "on" | "off";

export type PublicModulePageStates = Partial<
    Record<ModulePageKind, PublicModulePageState>
>;

/** The module page kinds a publication snapshot holds, in the menu's order. */
export function snapshotModulePageKinds(snapshot: unknown): ModulePageKind[] {
    const pages = (snapshot as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return [];
    const present = new Set<string>();
    for (const page of pages) {
        const kind = (page as { kind?: unknown } | null)?.kind;
        if (typeof kind === "string") present.add(kind);
    }
    return MODULE_PAGE_KINDS.filter((kind) => present.has(kind));
}

/**
 * Each module page's state, for the kinds a publication holds (G15). Read
 * with the publication on every public read, so turning a module off takes
 * its page off the site at once, without a republish.
 *
 * A snapshot with no module pages asks nothing and gets null, so a site
 * without them reads exactly as it did before. A state that can't be read
 * is left out, and the renderer then shows the page: it never guesses a
 * module off, as the workspace's module gate fails open.
 */
export async function publicModulePageStates(
    snapshot: unknown,
    organizationId: string,
): Promise<PublicModulePageStates | null> {
    const kinds = snapshotModulePageKinds(snapshot);
    if (kinds.length === 0) return null;
    const states = await Promise.all(
        kinds.map((kind) =>
            modulePageState(kind, organizationId).catch(() => null),
        ),
    );
    const out: PublicModulePageStates = {};
    kinds.forEach((kind, i) => {
        const state = states[i];
        if (state) out[kind] = state.state === "on" ? "on" : "off";
    });
    return out;
}
