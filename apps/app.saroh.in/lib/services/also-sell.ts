import type { ModuleView } from "@/lib/modules/schema";

/**
 * "Also sell" on Bookings › Services (E12, "Saroh Bookings" design): Courses
 * and Class packs switched on or off where a bookings business thinks about
 * them. It flips the same module switch as Settings › Modules — the API's
 * module lifecycle — so the two always agree.
 */
export type AlsoSellKey = "COURSES" | "CLASS_PACKS";

export interface AlsoSellFeature {
    key: AlsoSellKey;
    label: string;
    note: string;
    on: boolean;
}

/** The design's order, names and notes. */
const FEATURES: readonly Omit<AlsoSellFeature, "on">[] = [
    {
        key: "COURSES",
        label: "Courses",
        note: "A fixed run of dated sessions with seats — e.g. a 6-week programme.",
    },
    {
        key: "CLASS_PACKS",
        label: "Class packs",
        note: "A number of visits bought up front and used over time.",
    },
];

/**
 * What the card offers, or null for no card: the module list could not be
 * read, or this person can't switch modules (`module:manage`, owners and
 * admins). A module Saroh hasn't rolled out here (its rollout flag is off)
 * is left out: switching it on would change nothing the merchant can see.
 */
export function alsoSellFeatures(
    modules: readonly ModuleView[] | null,
): AlsoSellFeature[] | null {
    if (!modules?.some((m) => m.canManage)) return null;
    const features = FEATURES.flatMap((f) => {
        const view = modules.find((m) => m.key === f.key);
        if (!view) return [];
        if (view.blockers.some((b) => b.code === "ROLLOUT_DISABLED")) return [];
        return [{ ...f, on: view.lifecycle === "ENABLED" }];
    });
    return features.length > 0 ? features : null;
}

/** What flipping one says. Only what is true today: the menu, and nothing sold lost. */
export function alsoSellToast(label: string, turnedOn: boolean): string {
    return turnedOn
        ? `${label} is on — it's in the Bookings menu now. Settings › Modules shows the same switch.`
        : `${label} is off — it's gone from the Bookings menu, and nothing already sold changes. Settings › Modules shows the same switch.`;
}
