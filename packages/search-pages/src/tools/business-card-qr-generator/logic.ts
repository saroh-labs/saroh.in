/**
 * The business card QR code (design BusinessCardQr*.dc.html): a vCard 3.0
 * that phones open as a new contact. Only name and phone are needed; every
 * other field is left out of the card when empty. Text values are escaped
 * as RFC 2426 asks (\ , ; and new lines), lines end in CRLF. Pure, so a
 * test pins it and reads the drawn code back.
 */

export interface Contact {
    name: string;
    role: string;
    business: string;
    phone: string;
    email: string;
    website: string;
    address: string;
}

const esc = (v: string) =>
    v
        .trim()
        .replace(/\\/g, "\\\\")
        .replace(/([,;])/g, "\\$1")
        .replace(/\r?\n/g, "\\n");

/** +91 and ten digits for an Indian mobile; another country's number as typed, digits only. */
export function readPhone(value: string): string | null {
    const v = value.trim();
    const digits = v.replace(/\D/g, "");
    if (v.startsWith("+") && !v.startsWith("+91"))
        return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
    const local = digits.replace(/^(91|0)(?=\d{10}$)/, "");
    return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** Why the phone can't go on the card, or null. */
export function phoneProblem(value: string): string | null {
    if (readPhone(value)) return null;
    const v = value.trim();
    if (v.startsWith("+") && !v.startsWith("+91"))
        return "Type the number with its country code, like +44 20 7946 0000.";
    const local = v.replace(/\D/g, "").replace(/^91(?=\d)/, "");
    return local.length === 10
        ? "Indian mobile numbers start with 6, 7, 8 or 9 after +91."
        : `Indian mobile numbers have 10 digits after +91. This one has ${local.length}.`;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A website with https:// in front, as the card links it. */
export const fullUrl = (v: string) =>
    /^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;

export function vcard(c: Contact): string {
    const words = c.name.trim().split(/\s+/);
    const family = words.length > 1 ? (words.pop() ?? "") : "";
    const given = words.join(" ");
    const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${esc(family)};${esc(given)};;;`,
        `FN:${esc(c.name)}`,
    ];
    if (c.business.trim()) lines.push(`ORG:${esc(c.business)}`);
    if (c.role.trim()) lines.push(`TITLE:${esc(c.role)}`);
    const phone = readPhone(c.phone);
    if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
    if (c.email.trim()) lines.push(`EMAIL;TYPE=INTERNET:${c.email.trim()}`);
    if (c.website.trim()) lines.push(`URL:${fullUrl(c.website)}`);
    if (c.address.trim()) lines.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
}

/** Past this a code gets dense: printed small, a camera struggles. */
export const DENSE_CHARS = 320;

/** A short file name from the person's name. */
export const fileName = (name: string) =>
    name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "contact";

export const WORDS = {
    form: "Your contact details",
    name: "Your name",
    namePlaceholder: "As customers know you",
    role: "Role (optional)",
    business: "Business name (optional)",
    phone: "Phone",
    phoneHint: "With +91, so it dials from anywhere.",
    email: "Email (optional)",
    emailBad: "That email looks incomplete. Check it, or leave it empty.",
    website: "Website (optional)",
    address: "Address (optional)",
    addressHint:
        "A long address makes the code denser. Leave it off if your website has it.",
    dense: "The code is getting dense. Print it at least 2.5 cm wide, or leave the address off.",
    eyebrow: "Scan to save the contact",
    check: "Opens as a new contact on iPhone and Android, with every field filled. They tap Save.",
    caption: "The card to print, 85 × 55 mm, ten to an A4 sheet.",
    scanToSave: "Scan to save",
    sample: "A sample. Add a name and phone to make yours.",
    gate: "Get your contact code",
    gateButton: "Get my code",
    after: "You get a PNG of the code, a .vcf contact file and a sheet of ten business cards to print or save as a PDF.",
    png: "Download PNG",
    vcf: "Download contact file (.vcf)",
    print: "Print ten business cards",
} as const;
