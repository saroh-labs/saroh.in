import { isLink } from "../qr";

/**
 * The menu QR code (design MenuQr*.dc.html): the code points to a link the
 * business already has (its website, a shared Drive file, a delivery app
 * page). Nothing is uploaded or hosted: a menu that is only a PDF or photo
 * needs a home first, and the tool says how. The card can list a few
 * favourites, printed beside the code; they are never in the code.
 */

export const MAX_FAVOURITES = 8;

export const SOURCES = [
    { value: "link", label: "A link I have" },
    { value: "file", label: "A PDF or photo" },
] as const;

export type Source = (typeof SOURCES)[number]["value"];

export type MenuLinkProblem = "not-link" | null;

export const menuLinkProblem = (value: string): MenuLinkProblem =>
    isLink(value) ? null : "not-link";

/** Drive and Docs files open for customers only when shared with anyone with the link. */
export const isDriveLink = (value: string) =>
    /^https?:\/\/(drive|docs)\.google\.com\//i.test(value.trim());

/** The link as the card prints it: without https:// and www. */
export const shortLink = (value: string) =>
    value
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/$/, "");

export interface Favourite {
    name: string;
    price: string;
}

/** The favourites the card prints: named ones, up to 8, with a price only when one was typed. */
export function cardFavourites(rows: readonly Favourite[]) {
    return rows
        .filter((r) => r.name.trim())
        .slice(0, MAX_FAVOURITES)
        .map((r) => {
            const p = r.price.replace(/[₹,\s]/g, "");
            return {
                name: r.name.trim(),
                price: /^\d+(\.\d{1,2})?$/.test(p)
                    ? `₹${Number(p).toLocaleString("en-IN")}`
                    : null,
            };
        });
}

export const WORDS = {
    form: "Your menu",
    name: "Business name",
    source: "Your menu is",
    sourceHint: {
        link: "Your website, a Google Drive file, or your delivery app page.",
        file: "A PDF or photo needs a home first: put it on Google Drive, set sharing to Anyone with the link, and paste that link.",
    },
    link: "Menu link",
    linkHint: "Your website, a Google Drive file, or your delivery app page.",
    linkBad:
        "That isn't a link yet. Paste the full address, starting with https://",
    drive: "Drive files open for customers only when sharing is Anyone with the link. Scan it once on a phone that isn't signed in.",
    table: "Table number (optional)",
    tableHint:
        "Prints on the card. Leave it empty for one card that suits every table.",
    favourites: "Favourites on the card (optional, up to 8)",
    add: "Add an item",
    full: "The card fits 8 favourites. The rest stay on your menu link.",
    eyebrow: "Scan for the full menu",
    today: "Today's favourites",
    sample: "A sample. Paste your menu link to make yours.",
    gate: "Get your table card",
    gateButton: "Get my card",
    after: "You get a PNG of the code and the table card to print or save as a PDF.",
    png: "Download PNG",
    print: "Print the table card",
} as const;
