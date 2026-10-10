import type {
    QrCodeView,
    QrPlace,
    QrRefusalReason,
    QrResult,
    QrTargetKind,
} from "./types";

/**
 * The QR codes screen's words: where a code goes, what its label says, what
 * a row reads, and a refusal in plain words beside the control it is about.
 * Pure.
 */

/** Where it goes, in the design's order. "Other…" asks for a few words. */
export const QR_PLACES: readonly { place: QrPlace; name: string }[] = [
    { place: "COUNTER", name: "Counter" },
    { place: "MIRROR", name: "Mirror" },
    { place: "CARD", name: "Visiting card" },
    { place: "FLYER", name: "Flyer" },
    { place: "OTHER", name: "Other…" },
];

/** "Counter", "Visiting card", or what the merchant wrote for Other. */
export function placeWords(
    code: Pick<QrCodeView, "place" | "placeNote">,
): string {
    if (code.place === "OTHER") {
        // Nothing written, or only spaces, reads as "Other".
        const note = (code.placeNote ?? "").trim();
        return note === "" ? "Other" : note;
    }
    return (
        QR_PLACES.find((p) => p.place === code.place)?.name ?? "Somewhere else"
    );
}

/** The label under the code: the design's three, in its order. */
export const QR_LABELS = ["Scan to book", "Scan to order", "Scan to visit"];

/** The label a new code starts with, by what it opens. */
export function defaultLabel(kind: QrTargetKind): string {
    if (kind === "BOOK") return "Scan to book";
    if (kind === "SHOP" || kind === "PRODUCT") return "Scan to order";
    return "Scan to visit";
}

/** What the Opens column says for a target that is gone. */
export const TARGET_GONE = "Page gone · opens your home page";

/** A row's Opens cell. */
export function opensWords(code: Pick<QrCodeView, "target">): string {
    if (code.target.missing) return TARGET_GONE;
    return code.target.kind === "SHOP" ? "Online shop" : code.target.name;
}

/** `https://glow.saroh.app/q/h7c` → `glow.saroh.app/q/h7c`. */
export function linkWords(link: string): string {
    return link.replace(/^https?:\/\//, "");
}

/**
 * Bookings and orders made from the page a code opened. Zero is "none
 * counted", not a measurement, so it reads as a dash (07 §5): the count is
 * only of people who booked or ordered on the very page the code opened.
 */
export function madeWords(code: Pick<QrCodeView, "bookings" | "orders">): {
    bookings: string;
    orders: string | null;
} {
    return {
        bookings: code.bookings > 0 ? String(code.bookings) : "–",
        orders:
            code.orders > 0
                ? `${code.orders} ${code.orders === 1 ? "order" : "orders"}`
                : null,
    };
}

/** Said under the list, never in a tooltip: what the Bookings column counts. */
export const MADE_NOTE =
    "Bookings counts those made on the page a code opened. Someone who looks around first isn't counted.";

const BY_REASON: Partial<Record<QrRefusalReason, string>> = {
    "booking-closed":
        "Your booking page isn't open, so a code can't open it yet.",
    "shop-closed":
        "Your online shop isn't open on this site, so a code can't open it yet.",
    "product-missing":
        "That product isn't in your online shop any more. Pick something else.",
    "page-missing":
        "That page isn't on your published site. Publish it, or pick something else.",
    unknown: "Choose what this code opens.",
    "too-light":
        "This colour is too light to scan reliably. Pick a darker one.",
    format: "Pick one of the colours shown.",
    retired: "This code is retired, so it can't be changed.",
    "too-many":
        "This site has as many QR codes as it can hold. Point one you no longer use somewhere new.",
    "no-free-code": "We couldn't make a code just now. Try again.",
};

/** The design's alert for a colour a phone can't read. */
export const TOO_LIGHT =
    "This colour is too light to scan reliably. Pick a darker one.";

export interface QrRefusalWords {
    /** Beside which control it is said. */
    where: "target" | "color" | "general";
    text: string;
}

/**
 * A refused save in plain words. The API's own sentence when it sent one
 * (they are written for the merchant); else ours for the reason; else a
 * calm fallback. Never a status code or a raw body.
 */
export function refusalWords(
    res: Extract<QrResult<unknown>, { ok: false }>,
): QrRefusalWords {
    const where =
        res.field === "target" || res.field === "color"
            ? res.field
            : res.reason === "too-light" || res.reason === "format"
              ? "color"
              : "general";
    const known = res.reason ? BY_REASON[res.reason] : undefined;
    const said = res.error.trim();
    // A bare validation failure carries no sentence worth showing.
    const usable = said !== "" && !/^validation failed$/i.test(said);
    return {
        where,
        text:
            (res.reason === "too-light" ? TOO_LIGHT : undefined) ??
            (usable ? said : undefined) ??
            known ??
            "That didn't save. Try again.",
    };
}
