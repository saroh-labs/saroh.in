import type { VisitPlace, VisitPlacesRead } from "@/lib/stores/storefronts";

/**
 * What the Visit us panel says about its shop (G8), worked out from the
 * storefront read and the block's own `storeId`. Pure, so every case is
 * tested without a form.
 *
 * The rule is `pickStorefront`'s (ADR-010): with one shop it is chosen for
 * the merchant and named; with several the panel asks which and never
 * guesses; with none it says where to add one. A chosen shop that has since
 * closed, or gone online-only, is said plainly — the live block shows nothing
 * for it.
 */
export type VisitPlaceChoice =
    | { kind: "loading" }
    | { kind: "failed"; forbidden: boolean }
    /** No shop to show: Sell is off, or every storefront is online-only. */
    | { kind: "none" }
    /** The block names a shop that isn't an open shop any more. */
    | { kind: "missing"; places: VisitPlace[] }
    /** The one shop there is: chosen for the merchant, `adopt` when unsaved. */
    | { kind: "only"; place: VisitPlace; adopt: boolean }
    /** Several: `chosen` when the merchant has picked one. */
    | { kind: "pick"; places: VisitPlace[]; chosen: VisitPlace | null };

export function visitPlaceChoice(
    read: VisitPlacesRead | "loading",
    storeId: string | undefined,
): VisitPlaceChoice {
    if (read === "loading") return { kind: "loading" };
    if (read.state === "failed") {
        return { kind: "failed", forbidden: read.forbidden };
    }
    const places = read.state === "ok" ? read.places : [];
    const chosen = storeId
        ? (places.find((p) => p.id === storeId) ?? null)
        : null;
    if (storeId && !chosen) {
        return places.length === 0
            ? { kind: "none" }
            : { kind: "missing", places };
    }
    if (places.length === 0) return { kind: "none" };
    const only = places.length === 1 ? places[0] : undefined;
    if (only) return { kind: "only", place: only, adopt: !storeId };
    return { kind: "pick", places, chosen };
}
