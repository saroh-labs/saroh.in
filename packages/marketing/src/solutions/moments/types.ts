import type { SiteLook } from "../../kit/site-drawing";

/**
 * The moment library (board SLLibrary): one data shape per kind of moment a
 * trade's day draws. A moment component takes only these, already worded,
 * so the same component draws Rye & Co.'s 9 am, Petal Lane's 9 am, or
 * saroh.tech's Global day from its own world. Nothing here names a
 * business.
 */

/** A row's state pill: its words say it, the colour only follows. */
export type MomentTone = "new" | "prep" | "ready" | "paid" | "warn" | "plain";

/** The small drawn icons a moment uses, by name (`moment-icon.tsx`). */
export type MomentIcon =
    | "order"
    | "customer"
    | "stock"
    | "bill"
    | "calendar"
    | "check"
    | "warn"
    | "doc"
    | "chat"
    | "mail"
    | "site"
    | "phone"
    | "whatsapp";

/** Home at the start of the day: "Needs you", then today's list (`home`). */
export interface HomeMoment {
    kind: "home";
    /** The drawing's alt text. */
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    /** The phone's clock: "7:02". */
    clock: string;
    greeting: string;
    place: string;
    needsTitle: string;
    needs: readonly {
        icon: MomentIcon;
        title: string;
        line: string;
        /** The row's button: "Send pay link". */
        action?: string;
        warn?: boolean;
    }[];
    todayTitle?: string;
    todayDay?: string;
    today?: readonly { at: string; line: string }[];
}

/** What's left on the shelf, counted (`shelf`). */
export interface ShelfMoment {
    kind: "shelf";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    title?: string;
    rows: readonly {
        name: string;
        line: string;
        level: string;
        low?: boolean;
    }[];
    foot?: string;
}

/** An order taken while busy: the list, the message it came from, the order (`order`). */
export interface OrderMoment {
    kind: "order";
    label: string;
    address: string;
    title: string;
    open: string;
    rows: readonly {
        customer: string;
        status: string;
        tone: MomentTone;
        line: string;
        total: string;
        note: string;
    }[];
    message: {
        channel: "whatsapp" | "phone";
        from: string;
        text: string;
        at: string;
    };
    detail: {
        title: string;
        at: string;
        item: string;
        how: string;
        note: string;
        flag?: string;
        initials: string;
        customer: string;
    };
    /** "See the whole order list": the rows past the crop, on a phone. */
    more: string;
}

/** An order on the business's own site, landing in Saroh (`site-order`). */
export interface SiteOrderMoment {
    kind: "site-order";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    look: SiteLook;
    address: string;
    name: string;
    nav: readonly string[];
    cta: string;
    hero: { title: string; line: string };
    items: readonly { name: string; price: string }[];
    card: {
        title: string;
        at: string;
        item: string;
        meta: string;
        lines: readonly (readonly [string, string])[];
        paid: string;
        after: string;
    };
}

/** A product turned into a post in the business's own look (`post`). */
export interface PostMoment {
    kind: "post";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    look: SiteLook;
    item: string;
    itemLine: string;
    pickTitle: string;
    styles: readonly string[];
    chosen: string;
    captionTitle: string;
    caption: string;
    captionNote: string;
    channels: readonly string[];
    card: {
        business: string;
        item: string;
        price: string;
        unit?: string;
        site: string;
    };
}

/** The money's path, as `MoneyPath` draws it (`payment`). */
export interface PaymentMoment {
    kind: "payment";
    label: string;
    from: { label: string; title: string; line: string };
    via: { label: string; title: string; line: string };
    to: { label: string; title: string; line: string };
    wires: readonly [string, string];
    saroh: { title: string; line: string };
    paid: string;
    at: string;
    after: string;
}

/** A numbered bill, with its tax lines (`bill`). */
export interface BillMoment {
    kind: "bill";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    title: string;
    state: string;
    tone: MomentTone;
    from: string;
    lines: readonly { name: string; sub?: string; amount: string }[];
    tax: readonly { name: string; amount: string }[];
    totalLabel: string;
    total: string;
    foot?: string;
    /** The words beside it: "A bill for every order, without the Sunday." */
    aside?: { title: string; body: string };
}

/** Claude or ChatGPT does a task through Saroh; changes wait as drafts (`ai-app`). */
export interface AiAppMoment {
    kind: "ai-app";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    app: string;
    connected: string;
    ask: string;
    acts: readonly string[];
    answer: string;
    drafts?: {
        title: string;
        rows: readonly { name: string; line: string; state: string }[];
        action?: string;
        foot: string;
    };
}

/** Ask AI's answer, with the rows behind it (`ask`). */
export interface AskMoment {
    kind: "ask";
    label: string;
    /** On a phone, the second picture folds behind this ("See the whole …"). */
    more?: string;
    question: string;
    answer: string;
    head: readonly string[];
    rows: readonly (readonly string[])[];
    total?: readonly string[];
    sourcesLabel: string;
    sources: readonly string[];
    open?: string;
    change?: {
        ask: string;
        title: string;
        item: string;
        from: string;
        to: string;
        note: string;
        confirm: string;
        cancel: string;
        undo: string;
    };
    foot?: string;
}

/** The next morning's slip: what happened while away (`waiting`). */
export interface WaitingMoment {
    kind: "waiting";
    label: string;
    business: string;
    when: string;
    rows: readonly {
        icon: MomentIcon;
        title: string;
        line: string;
        tone?: MomentTone;
    }[];
}

/** An enquiry, answered, with its follow-up (`enquiry`). */
export interface EnquiryMoment {
    kind: "enquiry";
    label: string;
    title: string;
    at: string;
    customer: string;
    what: string;
    said: string;
    lines: readonly (readonly [string, string])[];
    follow: {
        title: string;
        state: string;
        reply: string;
        replyMeta: string;
        steps: readonly { at: string; line: string; next?: boolean }[];
        next: string;
    };
}

export type MomentData =
    | HomeMoment
    | ShelfMoment
    | OrderMoment
    | SiteOrderMoment
    | PostMoment
    | PaymentMoment
    | BillMoment
    | AiAppMoment
    | AskMoment
    | WaitingMoment
    | EnquiryMoment;
