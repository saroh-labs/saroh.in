import type { ClaimSwitch, ReleaseSwitch } from "../content/feature-switches";

/**
 * /features, "How it works" (DEC-221; boards HWDesk and HWPhone2): the
 * words each edition's `content/how-it-works.ts` gives the shared page.
 * Words only; every name, number, time and address in a drawing comes from
 * the edition's world. `**bold**` marks the board's bold words. A line or
 * row with a gate shows only while its claim switch or its feature's
 * release switch is on.
 */

/** Shown only while its claim switch, or its feature's release switch, is on. */
export interface Gate {
    claim?: ClaimSwitch;
    release?: ReleaseSwitch;
}

/** A line that may grow a gated sentence at its end. */
export interface GatedText {
    text: string;
    tails?: readonly ({ text: string } & Gate)[];
}

export interface Caption {
    title: string;
    body: GatedText;
    /** The caption drawn instead while `gate` is off. */
    off?: { gate: Gate; title: string; body: string };
}

export interface ReadMore extends Gate {
    label: string;
    href: string;
}

export type GroupId = "records" | "reach" | "ask";
export type ChapterId = "shop" | "site" | "posts" | "money" | "ai" | "data";

export interface Chapter extends Gate {
    id: ChapterId;
    group: GroupId;
    /** The h2, with its full stop. */
    title: string;
    /** The contents list's name for it, and its line. */
    name: string;
    line: string;
    /** The phone chip's name. */
    chip: string;
    lead: GatedText;
    captions: readonly [Caption, Caption, Caption];
    more: readonly ReadMore[];
    /** A link at the end of the Read more row ("Browse templates …"). */
    aside?: ReadMore;
}

export interface IndexItem extends Gate {
    name: string;
    line: string;
    /** A feature page, by slug; or `href` for a page that isn't one. */
    feature?: string;
    href?: string;
}

export interface YoursRow extends Gate {
    name: string;
    body: GatedText;
    /** `{domain}` and `{site}` are the example's. */
    chip: string;
}

/** The drawings' own words: the app's labels, as its screens show them. */
export interface PanelWords {
    product: {
        title: string;
        meta: string;
        name: string;
        price: string;
        stock: string;
        shows: (address: string) => string;
        save: string;
    };
    booking: {
        meta: string;
        places: (booked: number, of: number) => string;
        pay: (price: string) => string;
    };
    home: {
        title: string;
        toBake: (n: number) => string;
        unpaid: (name: string) => string;
        sendLink: string;
        low: (item: string) => string;
        left: (left: number, of: number, note: string) => string;
    };
    template: {
        title: string;
        meta: (trade: string) => string;
        /** The trade, as "For bakeries" names it. */
        plural: Readonly<Record<string, string>>;
        caption: string;
    };
    address: {
        title: string;
        live: string;
        then: string;
        connected: string;
        comes: string;
    };
    draft: { changes: string; publish: string; versions: string };
    share: { title: string; meta: string; button: string };
    cards: {
        title: string;
        meta: string;
        kinds: readonly string[];
        offer: string;
        note: string;
    };
    shareTo: {
        title: string;
        apps: readonly string[];
        social: string;
        addOn: string;
        slots: readonly { day: string; at: string; where: string }[];
    };
    payments: {
        title: string;
        own: (business: string) => string;
        connected: string;
        connect: string;
        /** The other providers a business may connect, each with its line. */
        others: readonly { name: string; line: string }[];
    };
    paying: { label: string; paidBy: (method: string) => string };
    paidOrder: {
        paid: string;
        paidInto: string;
        payoutTo: string;
        herBank: string;
        invoice: string;
        /** The invoice row's value; by default "INV-0321 · GST". */
        invoiceLine?: (invoice: string, tax: string) => string;
        sarohHolds: string;
        nothing: string;
    };
    askList: {
        title: string;
        button: string;
        about: string;
        questions: readonly {
            q: string;
            from: string;
            claim?: ClaimSwitch;
            /** Shown only while this claim is off, in its place. */
            off?: ClaimSwitch;
        }[];
    };
    answer: {
        /** The question in the edition's other language, while languages are on. */
        question: { hinglish: string; english: string };
        reply: {
            hinglish: (item: string, n: number) => string;
            english: (item: string, n: number) => string;
        };
        head: readonly string[];
        readFrom: string;
        sources: readonly string[];
    };
    assistant: {
        title: string;
        on: string;
        ask: string;
        meta: (business: string) => string;
        reply: string;
        added: (n: number, owner: string) => string;
        undo: string;
    };
    insights: {
        title: string;
        meta: string;
        question: string;
        week: (takings: string, change: string) => string;
        weeks: readonly string[];
    };
    key: {
        title: string;
        button: string;
        name: string;
        token: string;
        scopes: readonly string[];
        made: (owner: string) => string;
    };
    webhook: {
        title: string;
        events: readonly { name: string; line: string; took: string }[];
        signed: string;
    };
}

export interface HowItWorksWords {
    href: string;
    seoTitle: string;
    seoDescription: string;
    /** The h1, around the one word the Saffron mark sits under. */
    title: { before: string; mark: string; after: string };
    /** `{business}` and `{street}` are the lead example's. */
    lede: string;
    examplesLegend: string;
    trades: Readonly<Record<string, string>>;
    contentsLabel: string;
    chaptersLabel: string;
    yoursLink: string;
    readMore: string;
    /** "Orders and 6 more", the phone's folded Read more row. */
    andMore: (first: string, n: number) => string;
    newTag: string;
    of: string;
    /** The hero's drawing: the example's site, and a paid order over it. */
    hero: {
        live: string;
        paid: string;
        nav: readonly string[];
        paidInto: string;
        sarohHolds: string;
        nothing: string;
        account: (business: string, provider: string) => string;
        /** Each example's site headline, by the world's business key. */
        siteLine: Readonly<Record<string, string>>;
        label: (business: string) => string;
    };
    groups: Readonly<
        Record<GroupId, { name: string; line: string; indexLine: string }>
    >;
    chapters: readonly Chapter[];
    panels: PanelWords;
    /** How money moves, drawn on the ledger band. */
    money: {
        label: string;
        /** On a phone, the money's path is cut; this opens it. */
        more: string;
        /** When the example's customer pays ("HH:MM"). */
        at: string;
        pays: (name: string, amount: string) => string;
        by: (method: string, order: string) => string;
        yourAccount: string;
        inName: (owner: string, provider: string) => string;
        yourBank: string;
        bank: (owner: string) => string;
        schedule: (provider: string) => string;
        saroh: string;
        hears: (
            order: string,
            invoice: string,
            tax: string,
            owner: string,
        ) => string;
        holds: string;
        zero: string;
    };
    yours: {
        id: string;
        title: string;
        lead: (n: string) => string;
        foldMore: (n: number) => string;
        rows: readonly YoursRow[];
    };
    day: { lead: string; link: (business: string) => string };
    index: {
        id: string;
        title: string;
        lead: string;
        groups: Readonly<Record<GroupId, readonly IndexItem[]>>;
    };
    close: { title: string; pricing: string; note: string };
}
