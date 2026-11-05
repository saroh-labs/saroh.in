import type { Faq } from "@/components/shared/faq-list";
import type { DepositPlan, Terms } from "@/lib/tools/document";
import type { Currency } from "@/lib/tools/money";

export type DocumentSlug =
    | "invoice"
    | "estimate"
    | "quote"
    | "receipt"
    | "proforma-invoice"
    | "credit-note"
    | "payment-reminder-letter"
    | "price-list";

export type TradeSlug =
    | "photographer"
    | "graphic-designer"
    | "web-developer"
    | "cleaner"
    | "contractor"
    | "plumber"
    | "electrician"
    | "tutor"
    | "personal-trainer"
    | "consultant"
    | "makeup-artist"
    | "event-planner"
    | "landscaper"
    | "salon";

export type CountrySlug =
    "uk" | "us" | "canada" | "australia" | "uae" | "singapore";

/** One line of work. Amounts are round and always shown as an example. */
export interface ExampleItem {
    /** "What's on it" table: the kind of line. */
    line: string;
    /** "What's on it" table: the unit, in the trade's own words. */
    billedBy: string;
    /** What the preview and the files print. */
    description: string;
    qty: string;
    rate: string;
}

export interface Payment {
    text: string;
    points: string[];
}

/** A field this trade or document needs that a blank invoice forgets. */
export interface FieldNote {
    name: string;
    why: string;
}

export interface Tip {
    title: string;
    text: string;
}

/** The filled-in document. Anything left out comes from the layer below. */
export interface Example {
    /** Replaces the document's own word: "Tax invoice" in Australia. */
    heading?: string;
    number: string;
    /** yyyy-mm-dd */
    issued: string;
    /** yyyy-mm-dd; "" when the document has no due date. */
    due: string;
    terms: Terms;
    currency: Currency;
    from: {
        name: string;
        email: string;
        address: string;
        taxId?: string;
        /** "VAT no." or "ABN"; else the first tax line's name. */
        taxIdLabel?: string;
    };
    client: { name: string; email?: string; address?: string };
    /** The trade's own fields beside the dates: shoot date, job address. */
    facts?: { label: string; value: string }[];
    taxes?: { name: string; rate: string }[];
    depositPaid?: string;
    depositLabel?: string;
    depositPlan?: DepositPlan;
    /** Printed under the totals. */
    note?: string;
    /** A quote's or estimate's terms. */
    termsText?: string;
    /** A reminder letter's words, printed under the totals. */
    letter?: string;
}

/** The words only this page has. All of it counts for the quality gate. */
export interface PageWords {
    /** One or two sentences under the H1. */
    lede: string;
    /** Exactly 3. */
    tips: Tip[];
    /** 3 to 5. No question or answer may repeat on a sibling page. */
    faqs: Faq[];
    /** A person read this page and it passes the gate. Until then: noindex. */
    reviewed: boolean;
}

export interface DocumentData extends PageWords {
    slug: DocumentSlug;
    name: string;
    /** The gallery's chip: "Proforma", "Reminder letter". */
    chip: string;
    /** One line on a card: what the document is for. */
    line: string;
    items: ExampleItem[];
    payment: Payment;
    fields: FieldNote[];
    example: Example;
}

/** What every page for a trade starts from. A combo can replace any of it. */
export interface TradeData {
    /** The trade hub's words under the H1. */
    lede: string;
    items: ExampleItem[];
    payment: Payment;
    fields: FieldNote[];
    example: Partial<Example>;
    /** Trade hub only: a person read it. */
    reviewed: boolean;
}

/** A fact is sourced and dated, or it's general advice that says to check. Never a claim of law with no source. */
export type CountryFact =
    | {
          label: string;
          value: string;
          source: { name: string; url: string };
          /** yyyy-mm-dd; recheck every 6 months. */
          checkedOn: string;
      }
    | { label: string; value: string; general: true };

export interface CountryData {
    lede: string;
    paper: "a4" | "letter";
    /** The US writes Mar 14, 2026; the rest 14 Mar 2026. */
    dateLocale: "en-GB" | "en-US";
    facts: CountryFact[];
    payment: Payment;
    fields: FieldNote[];
    example: Partial<Example>;
    reviewed: boolean;
}

/** Document x trade. Leave out what the trade file already says. */
interface ComboBase extends PageWords {
    document: DocumentSlug;
    items?: ExampleItem[];
    payment?: Payment;
    fields?: FieldNote[];
    example?: Partial<Example>;
}

export type Combo =
    | (ComboBase & { trade: TradeSlug; country?: undefined })
    | (ComboBase & { country: CountrySlug; trade?: undefined });

export interface TradeEntry {
    slug: TradeSlug;
    name: string;
    plural: string;
    /** Nearest trades first: the "similar work" links. */
    near: TradeSlug[];
    data?: TradeData;
}

export interface CountryEntry {
    slug: CountrySlug;
    name: string;
    /** As a sentence says it: "the UK". */
    place: string;
    /** The tax it names: "VAT" in the UK. */
    tax: string;
    data?: CountryData;
}
