import type { TemplateKind } from "@saroh/templates";
import { tradeOf } from "@saroh/templates";

/**
 * The kind of place a business is (DEC-216): one of the template kinds
 * (`TEMPLATE_KINDS` in `@saroh/templates`), stored on the business. Setup
 * asks it on its first step and Settings › Business changes it. It picks
 * the website templates and sample services offered first, and nothing
 * else. Pure and client-safe.
 */
export type Trade = TemplateKind;

/** A trade as the API sent it; anything unknown or absent is none. */
export { tradeOf };

/**
 * The categories a business picks from, in the boards' order (TPLD1,
 * TPLD2), Other last: choosing it asks the trade in words (owner, 12 Nov
 * 2026). "Creator" isn't offered to a business: Just me and A site for my
 * work keep the kind alone.
 */
export const TRADE_CHOICES: readonly { value: Trade; label: string }[] = [
    { value: "salon", label: "Salon" },
    { value: "gym", label: "Gym or studio" },
    { value: "clinic", label: "Clinic" },
    { value: "coach", label: "Dietician or coach" },
    { value: "food", label: "Bakery or food" },
    { value: "shop", label: "Shop" },
    { value: "other", label: "Other" },
];

/**
 * The trade as a row says it: "Salon", "Creator", or for Other the trade
 * typed beside it ("Bakery"); null for none.
 */
export function tradeLabel(
    trade: unknown,
    typed?: string | null,
): string | null {
    const t = tradeOf(trade);
    if (!t) return null;
    if (t === "creator") return "Creator";
    if (t === "other" && typed?.trim()) return typed.trim();
    return TRADE_CHOICES.find((c) => c.value === t)?.label ?? null;
}

/** The field Other shows: the trade in the merchant's own words. */
export const TRADE_OTHER_LABEL = "Your trade";
export const TRADE_OTHER_PLACEHOLDER = "Bakery, tailor, tuition…";
/** The typed trade's length, as the API checks it. */
export const TRADE_OTHER_MIN = 2;
export const TRADE_OTHER_MAX = 60;

/** What is wrong with the typed trade beside Other; null when it's fine. */
export function tradeOtherProblem(
    trade: unknown,
    typed: string | null | undefined,
): string | null {
    if (tradeOf(trade) !== "other") return null;
    const text = (typed ?? "").trim();
    if (text.length === 0) return "Say what your trade is.";
    if (text.length < TRADE_OTHER_MIN) return "Use at least 2 characters.";
    if (text.length > TRADE_OTHER_MAX) return "Keep it to 60 characters.";
    return null;
}

/** Only a business is asked its trade (TPLD1, TPLD2). */
export function asksTradeOf(kind: unknown): boolean {
    return kind === "BUSINESS";
}

/** Setup's line under the chips (TPLD1). */
export const TRADE_SETUP_HINT =
    "Saroh suggests a website for it. A salon or gym also gets sample services to edit.";

/** Settings' line under the sheet's title (TPLD2). */
export const TRADE_SETTINGS_NOTE =
    "What Saroh suggests first: your starter website and sample services. It never limits what you can use.";

/** The row's label in Settings › Business › Identity (TPLD2). */
export const TRADE_ROW_LABEL = "Kind of place";

/**
 * DEC-189's Bookings trade, from the stored one: a salon or a gym starts
 * Bookings with sample services in place of a typed first service.
 */
export function bookingsPreset(trade: unknown): "SALON" | "GYM" | undefined {
    const t = tradeOf(trade);
    if (t === "salon") return "SALON";
    if (t === "gym") return "GYM";
    return undefined;
}

/**
 * The trade a gallery template points at (DEC-216): its first kind a
 * business can pick, so `?template=salon` starts setup on Salon.
 */
export function tradeOfTemplate(
    kinds: readonly string[] | null | undefined,
): Trade | null {
    for (const kind of kinds ?? []) {
        const t = tradeOf(kind);
        if (t && TRADE_CHOICES.some((c) => c.value === t)) return t;
    }
    return null;
}

/** A gallery template as setup reads it: its id, name and kinds. */
interface GalleryEntry {
    id: string;
    name: string;
    slug?: string;
    kinds?: readonly string[];
}

/**
 * The template `?template=` names (by id or slug) among those offered, as
 * setup says it (DEC-216); null for none, or one Saroh doesn't offer.
 */
export function galleryTemplateOf(
    asked: string | string[] | undefined,
    templates: readonly GalleryEntry[],
): { id: string; name: string; trade: Trade | null } | null {
    const value = (Array.isArray(asked) ? asked[0] : asked)?.trim();
    if (!value) return null;
    const found = templates.find(
        (t) => t.id === value || (t.slug ?? t.id) === value,
    );
    return found
        ? {
              id: found.id,
              name: found.name,
              trade: tradeOfTemplate(found.kinds),
          }
        : null;
}

/** The panel's heading for a gallery template's trade (TPLD1). */
const PANEL_HEADING: Partial<Record<Trade, string>> = {
    salon: "A salon, ready to take bookings.",
    gym: "A gym, ready to take bookings.",
    clinic: "A clinic, ready to take bookings.",
    coach: "A practice, ready to take bookings.",
    food: "A bakery, ready to take orders.",
    shop: "A shop, ready to sell.",
};

export function galleryPanelHeading(trade: Trade | null): string {
    return (trade && PANEL_HEADING[trade]) ?? "Your website, ready to fill in.";
}
