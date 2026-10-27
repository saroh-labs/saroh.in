import { isLink } from "../qr";
import { isUpiId, upiLink } from "../upi-qr-code-generator/logic";

/**
 * The link-in-bio page (design LinkInBio*.dc.html): one page of buttons,
 * built in the browser and downloaded as a single HTML file the merchant
 * puts on any web host. No hosting here, and no Saroh branding on the
 * page: it is theirs. Everything typed is escaped into the file; only
 * links this file checks (https, wa.me, upi://pay) become buttons.
 */

export const KINDS = {
    whatsapp: { label: "WhatsApp number", placeholder: "+91 99999 99999" },
    booking: { label: "Booking link", placeholder: "https://…" },
    maps: {
        label: "Google Maps link",
        placeholder: "https://maps.app.goo.gl/…",
    },
    upi: { label: "UPI ID", placeholder: "name@bank" },
    link: { label: "Link", placeholder: "https://…" },
} as const;

export type Kind = keyof typeof KINDS;

export interface BioLink {
    kind: Kind;
    text: string;
    value: string;
}

export const START_LINKS: readonly BioLink[] = [
    { kind: "whatsapp", text: "Chat on WhatsApp", value: "" },
    { kind: "booking", text: "Book a time", value: "" },
    { kind: "maps", text: "Find us", value: "" },
    { kind: "upi", text: "Pay by UPI", value: "" },
];

export const MAX_LINKS = 8;

export const COLOURS = [
    { value: "#1C1C1A", label: "Ink" },
    { value: "#0F5C5C", label: "Teal" },
    { value: "#5B2A4E", label: "Plum" },
    { value: "#8A3B12", label: "Clay" },
] as const;

export type Colour = (typeof COLOURS)[number]["value"];

/** wa.me wants the country code and the number, digits only. */
export function whatsappNumber(value: string): string | null {
    const v = value.trim();
    const digits = v.replace(/\D/g, "");
    if (v.startsWith("+") && !v.startsWith("+91"))
        return digits.length >= 8 && digits.length <= 15 ? digits : null;
    const local = digits.replace(/^(91|0)(?=\d{10}$)/, "");
    return /^[6-9]\d{9}$/.test(local) ? `91${local}` : null;
}

/** The button's address, or null while the value isn't one. */
export function hrefOf(l: BioLink, name: string): string | null {
    const v = l.value.trim();
    if (!v) return null;
    if (l.kind === "whatsapp") {
        const n = whatsappNumber(v);
        return n ? `https://wa.me/${n}` : null;
    }
    if (l.kind === "upi")
        return isUpiId(v) ? upiLink({ upiId: v, name: name || v }) : null;
    return isLink(v) ? v : null;
}

/** What's wrong with a typed value, or null. */
export function linkProblem(l: BioLink): string | null {
    if (!l.value.trim() || hrefOf(l, "x")) return null;
    if (l.kind === "whatsapp")
        return "Type a 10-digit mobile number, with +91 if you like.";
    if (l.kind === "upi")
        return "That isn't a UPI ID yet. It looks like name@bank, with one @.";
    return "That isn't a full link yet. Start it with https://";
}

/** Up to two initials, for the circle when there's no photo. */
export const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => [...w][0] ?? "")
        .join("")
        .toUpperCase();

/** Photos the file may carry: raster images only (an SVG could hold a script). */
export const PHOTO_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_URL = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

const esc = (v: string) =>
    v
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/** The buttons as the page draws them: those with a working address, in order. */
export function pageButtons(links: readonly BioLink[], name: string) {
    return links.flatMap((l) => {
        const href = hrefOf(l, name.trim());
        return href && l.text.trim()
            ? [
                  {
                      kind: l.kind,
                      text: l.text.trim(),
                      href,
                      upi: l.kind === "upi" ? l.value.trim() : null,
                  },
              ]
            : [];
    });
}

const ICONS: Record<Kind, string> = {
    whatsapp:
        '<path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/>',
    booking:
        '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    maps: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    upi: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

export interface BioPage {
    name: string;
    about: string;
    /** A data: URL of a raster image, or null for initials. */
    photo: string | null;
    links: readonly BioLink[];
    colour: Colour;
}

/** The whole page, one self-contained HTML file. */
export function pageHtml(p: BioPage): string {
    const name = p.name.trim();
    const about = p.about.trim();
    const colour = COLOURS.some((c) => c.value === p.colour)
        ? p.colour
        : COLOURS[0].value;
    const photo =
        p.photo && PHOTO_URL.test(p.photo)
            ? `<img class="av" src="${p.photo}" alt="${esc(name)}">`
            : `<div class="av" aria-hidden="true">${esc(initials(name))}</div>`;
    const buttons = pageButtons(p.links, name)
        .map(
            (b) =>
                `<a class="b" href="${esc(b.href)}"${b.kind === "upi" ? "" : ' target="_blank" rel="noopener"'}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[b.kind]}</svg>${esc(b.text)}</a>` +
                (b.upi ? `<p class="u">UPI ID: ${esc(b.upi)}</p>` : ""),
        )
        .join("\n");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
${about ? `<meta name="description" content="${esc(about)}">\n` : ""}<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#FAF8F4;color:#1C1C1A;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center}
main{width:100%;max-width:420px;padding:48px 20px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.av{width:88px;height:88px;border-radius:999px;object-fit:cover;background:${colour};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700}
h1{margin:4px 0 0;font-size:26px;letter-spacing:-0.02em}
.a{margin:0;font-size:15px;line-height:1.5;color:#43403A}
nav{width:100%;margin-top:8px;display:flex;flex-direction:column;gap:10px}
.b{min-height:52px;border-radius:12px;background:${colour};color:#FFFFFF;font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;padding:0 16px}
.b:focus-visible{outline:3px solid #F0A92B;outline-offset:2px}
.u{margin:-4px 0 4px;font-size:13px;color:#43403A;user-select:all}
</style>
</head>
<body>
<main>
${photo}
<h1>${esc(name)}</h1>
${about ? `<p class="a">${esc(about)}</p>\n` : ""}<nav>
${buttons}
</nav>
</main>
</body>
</html>
`;
}

/** A short file name from the business name. */
export const fileName = (name: string) =>
    name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "my-page";

export const WORDS = {
    form: "Your page",
    name: "Business name",
    about: "One line about you (optional)",
    photo: "Photo or logo (optional)",
    photoHint: "It stays in your browser until you download the page.",
    photoBad: "Pick a PNG, JPG, WebP or GIF image.",
    photoBig: "That photo is over 2 MB. Pick a smaller one.",
    photoRemove: "Remove photo",
    links: "Your links",
    buttonText: "Button text",
    remove: (text: string) => `Remove ${text || "this link"}`,
    add: "Add a link",
    full: "A page fits 8 buttons. Keep the ones customers use most.",
    colour: "Button colour",
    colourHint:
        "Your page, your colours. Each one keeps the button text easy to read.",
    preview: "Preview",
    empty: "Type your business name to start yours.",
    upiNote: (name: string) =>
        `On a phone this opens their UPI app to pay ${name}. On a computer it shows your UPI ID to copy.`,
    gate: "Get your page as one file",
    gateButton: "Email it",
    host: "You put the file on any web host, then paste its link in your Instagram bio.",
    download: "Download the page (HTML)",
} as const;
