import { rupee } from "../../money";
import { readNumber } from "../no-show-cost-calculator/logic";

/**
 * The salon rate card maker's rules (design SalonRateCard*.dc.html,
 * generator genB/gen.py `rate_card`): ticked services with a price go on
 * the card, by section; a ticked service with no price shows "[price]",
 * never ₹0. Pure, so the tests pin the boards' Rye Studio card.
 */

export interface Service {
    id: string;
    section: string;
    name: string;
    /** As typed: "850", "₹1,400". */
    price: string;
    time: string;
    on: boolean;
    /** Added by them: its name is a field too. */
    own?: boolean;
}

/** Common services, ticked, with times and no prices (the Empty board). */
export const STARTERS: readonly Service[] = [
    ["Hair", "Haircut and blow-dry", "45 min"],
    ["Hair", "Hair spa", "60 min"],
    ["Hair", "Global colour", "120 min"],
    ["Skin", "Clean-up", "40 min"],
    ["Skin", "Hydrating facial", "60 min"],
    ["Hands and feet", "Manicure", "30 min"],
    ["Hands and feet", "Pedicure", "45 min"],
].map(([section = "", name = "", time = ""], i) => ({
    id: `s${i}`,
    section,
    name,
    price: "",
    time,
    on: true,
}));

export const OWN_SECTION = "More services";

export const SIZES = [
    { value: "a5", label: "A5 print" },
    { value: "a4", label: "A4 print" },
] as const;
export type Size = (typeof SIZES)[number]["value"];

/** How many services fit on A5 before it runs onto a second page. */
export const A5_FITS = 16;

/** A typed price as the card prints it: "1400" → "₹1,400"; null when it isn't one. */
export function price(v: string): string | null {
    const n = readNumber(v);
    return n === null ? null : rupee(n);
}

export interface CardLine {
    name: string;
    time: string;
    /** "₹850", or "[price]" when it's still missing or not a number. */
    price: string;
}

/** The card's sections, in order, with only the ticked, named services. */
export function cardSections(services: readonly Service[]) {
    const out: { section: string; lines: CardLine[] }[] = [];
    for (const s of services) {
        if (!s.on || !s.name.trim()) continue;
        let sec = out.find((x) => x.section === s.section);
        if (!sec) {
            sec = { section: s.section, lines: [] };
            out.push(sec);
        }
        sec.lines.push({
            name: s.name.trim(),
            time: s.time.trim(),
            price: price(s.price) ?? "[price]",
        });
    }
    return out;
}

export const ticked = (services: readonly Service[]) =>
    services.filter((s) => s.on && s.name.trim()).length;

export const WORDS = {
    form: "Your rate card",
    biz: "Business name",
    tag: "Line under the name",
    phone: "Phone for bookings",
    priceOf: (name: string) => `${name} price in rupees`,
    timeOf: (name: string) => `${name} time`,
    ownName: "Service name",
    add: "Add a service",
    remove: (name: string) => `Remove ${name || "this service"}`,
    size: "Size",
    gst: "Add “Prices include 18% GST” [to confirm]",
    gstHint:
        "Salon services are usually 18%. Check with your CA. Leave it off if you are not registered.",
    gstLine: "Prices include 18% GST.",
    noPrice: (name: string) => `Add a price for ${name}, or untick it.`,
    tooLong: (n: number) =>
        `${n} services won't fit on A5. Switch to A4, or the card goes over two pages.`,
    toA4: "Switch to A4",
    out: "Your rate card",
    caption: {
        a5: "A5, prints well in colour or black and white.",
        a4: "A4, prints well in colour or black and white.",
    },
    emptyCaption: "Add your prices to fill it in.",
    rateCard: "Rate card",
    gate: "Get your rate card",
    gateButton: "Get my PDF",
    gateAfter:
        "Print it, or save it as a PDF to send on WhatsApp. Change a price later and make it again.",
    print: "Print or save as PDF",
} as const;
