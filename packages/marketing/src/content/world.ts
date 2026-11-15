import type { DrawnPhotoKind } from "../kit/drawn-photo";
/**
 * The example world (DEC-221): one set of facts every drawing on an
 * edition's site reads, so a name, a number, a time or an address is the
 * same on every page. Each edition writes its own (`apps/saroh.in/content/
 * world.ts`, India, from WORLD.md's LOCKED table; `apps/saroh.tech/content/
 * world.ts`, Global, from `db:seed:global`), and the kit's components take
 * a world's values as props: they never hold Rye & Co. themselves.
 *
 * Everything is an example and is labelled as one. Times are "HH:MM",
 * 24-hour (the kit writes them "9:14 am"); money is already written the
 * way the edition writes it ("₹1,450", "$42.00"), so the kit never formats
 * a currency.
 */
import type { SiteLook } from "../kit/site-drawing";
import { hourAnchor } from "../kit/time";

/** The trades a page's example follows (`?trade=`), in the switcher's order. */
export const WORLD_TRADES = ["bakery", "salon", "gym", "florist"] as const;
export type WorldTrade = (typeof WORLD_TRADES)[number];

export interface WorldPerson {
    name: string;
    /** Their story in a line, for whoever writes the scene. */
    note?: string;
}

/** A thing the business sells, as its site prices it. */
export interface WorldItem {
    key: string;
    name: string;
    /** "₹360"; a variant's own price goes in its own item. */
    price: string;
    /** "box of 6", "12 stems". */
    unit?: string;
    /** The drawn stand-in photo (`kit/drawn-photo`) where a drawing shows it. */
    photo?: DrawnPhotoKind;
}

export interface WorldOrder {
    id: string;
    customer: string;
    items: string;
    total: string;
    /** "WhatsApp, typed in at 9:14 am", "Her website at 10:14 am". */
    placed: string;
    /** "Today 5 pm (moved from 4 pm at 9:20 am)". */
    pickup: string;
    paid: string;
    /** The invoice number, or what happens instead ("issued at pick-up"). */
    invoice: string;
    /** Anything the kitchen must know: "nut allergy". */
    note?: string;
}

/** One hour of the business's canonical day, and its anchor. */
export interface WorldHour {
    /** "HH:MM", 24-hour; the anchor is its hour ("9am") unless `anchor` says. */
    at: string;
    /** "tue7am" for the next morning. */
    anchor?: string;
    /** "Tue 7 am", where the hour label alone would be wrong. */
    label?: string;
    /** What happens, in a line. */
    line: string;
    /** The feature page it shows, by slug. */
    feature?: string;
}

/** How the money moves: the words a `MoneyPath` draws. */
export interface WorldMoney {
    /** "Razorpay", "Stripe". */
    provider: string;
    /** The other providers it could be: "Cashfree, or Stripe abroad". */
    otherProviders?: string;
    /** How the customer pays: "UPI", "card". */
    method: string;
    /** The tax and its wording: "GST", "Sales tax". */
    taxName: string;
    /** "CGST + SGST", "5.5%". */
    taxLine?: string;
    /** The sample tax number, if the edition shows one. */
    taxId?: string;
}

export interface WorldBusiness {
    key: string;
    trade: WorldTrade;
    name: string;
    /** "home bakery", "salon". */
    kind: string;
    owner: string;
    staff?: readonly WorldPerson[];
    /** "Hill Road, Bengaluru". */
    place: string;
    /** "rye-and-co.saroh.app". */
    site: string;
    /** Its own domain, an example: "ryeandco.in". */
    domain?: string;
    /** The plan it is on, as the page may name it (behind a claim switch). */
    plan?: string;
    /** Its trade page: "/for/home-bakers". */
    tradePage?: string;
    /** The drawn stand-in for the business's own photo (`kit/drawn-photo`). */
    photo?: DrawnPhotoKind;
    look?: SiteLook;
    customers: readonly WorldPerson[];
    items: readonly WorldItem[];
    orders?: readonly WorldOrder[];
    /** Its day, in order, where one is written. */
    day?: readonly WorldHour[];
    /** Its order numbers' range, for writing a new one: ["ORD-1041", "ORD-1090"]. */
    orderRange?: readonly [string, string];
    invoiceRange?: readonly [string, string];
}

export interface World {
    edition: "india" | "global";
    /** "Monday 16 Nov 2026": the day every drawing is on. */
    today: string;
    /** The same, as a date: "2026-11-16". */
    date: string;
    /** "Open 7 am to 8 pm", the lead business's hours. */
    hours?: string;
    money: WorldMoney;
    /** The lead example: every story's home. */
    lead: WorldBusiness;
    /** The others, one per trade the switcher offers. */
    others: readonly WorldBusiness[];
}

/**
 * The example for a trade, for `?trade=`: the world's business of that
 * trade, else the lead. Anything unknown (a typo, an old link) gets the lead,
 * never an error or an empty page.
 */
export function exampleFor(world: World, trade?: string | null): WorldBusiness {
    if (!trade) return world.lead;
    return (
        [world.lead, ...world.others].find((b) => b.trade === trade) ??
        world.lead
    );
}

/** `?trade=` as the page got it: one value, a known trade, or none. */
export function tradeParam(
    value: string | string[] | undefined,
): WorldTrade | null {
    const v = Array.isArray(value) ? value[0] : value;
    return (WORLD_TRADES as readonly string[]).includes(v ?? "")
        ? (v as WorldTrade)
        : null;
}

/** The day link for an hour: "/for/home-bakers#9am". */
export function dayLink(business: WorldBusiness, hour: WorldHour): string {
    return `${business.tradePage ?? "/for"}#${hour.anchor ?? hourAnchor(hour.at)}`;
}
