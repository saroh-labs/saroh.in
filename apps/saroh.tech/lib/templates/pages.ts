import { COMBOS, COUNTRIES, DOCUMENTS, TRADES } from "@/content/templates";
import type {
    Combo,
    CountryEntry,
    CountryFact,
    DocumentData,
    DocumentSlug,
    Example,
    ExampleItem,
    FieldNote,
    PageWords,
    Payment,
    TradeEntry,
} from "@/content/templates/types";
import { isDate } from "@/lib/tools/dates";
import type { DocDraft, DocumentView } from "@/lib/tools/document";
import { documentView, TERM_LABELS, totals } from "@/lib/tools/document";
import { carryHref } from "@/lib/tools/handoff";
import { formatPlain, parseNumber, toCents } from "@/lib/tools/money";

const REVIEW_DATE = "2026-11-02";

const INVOICES =
    "Numbered invoices in your currency, with your own tax line and number, and a record of what's paid.";

/**
 * The closing band says what Saroh does, so it's one per document and never
 * per page: the app's claims live here, not in the template data.
 */
const BAND: Record<DocumentSlug, { title: string; line: string }> = {
    invoice: { title: "Write your next invoice in Saroh.", line: INVOICES },
    estimate: {
        title: "Agreed the job? Bill it in Saroh.",
        line: `Saroh doesn't make estimates. It's where the invoice comes next. ${INVOICES}`,
    },
    quote: {
        title: "Agreed the job? Bill it in Saroh.",
        line: `Saroh doesn't make quotes. It's where the invoice comes next. ${INVOICES}`,
    },
    receipt: {
        title: "Record a payment, and the invoice becomes a receipt.",
        line: "In Saroh, an invoice reads as a receipt once it's paid. Share it by link or on WhatsApp.",
    },
    "credit-note": { title: "Keep your invoices in Saroh.", line: INVOICES },
    "price-list": {
        title: "Put your services on your own site.",
        line: "Publish a site on a saroh.app address, with your live services, hours and booking page.",
    },
    "proforma-invoice": {
        title: "Once it's agreed, write the invoice in Saroh.",
        line: INVOICES,
    },
    "payment-reminder-letter": {
        title: "See what's overdue in Saroh.",
        line: "Share an invoice by link, or open WhatsApp with the words typed. You press send.",
    },
};

/** How each document differs from an invoice or a quote, and where "Fill it online" goes. */
const LOOK: Record<
    DocumentSlug,
    {
        base: "invoice" | "quote";
        tool: string;
        toolName: string;
        guide: string;
        guideName: string;
        due: string;
        terms?: boolean;
        total?: string;
        stamp?: string;
    }
> = {
    invoice: {
        base: "invoice",
        tool: "/tools/invoice-generator",
        toolName: "invoice generator",
        guide: "/guides/how-to-write-an-invoice",
        guideName: "How to write an invoice",
        due: "Due",
        terms: true,
    },
    estimate: {
        base: "quote",
        tool: "/tools/quote-maker",
        toolName: "quote maker",
        guide: "/guides/quote-vs-estimate",
        guideName: "Quote vs estimate",
        due: "Valid until",
    },
    quote: {
        base: "quote",
        tool: "/tools/quote-maker",
        toolName: "quote maker",
        guide: "/guides/charge-a-deposit",
        guideName: "How to charge a deposit",
        due: "Valid until",
    },
    receipt: {
        base: "invoice",
        tool: "/tools/receipt-maker",
        toolName: "receipt maker",
        guide: "/guides/how-to-write-an-invoice",
        guideName: "How to write an invoice",
        due: "",
        total: "Amount received",
        stamp: "PAID",
    },
    "proforma-invoice": {
        base: "invoice",
        tool: "/tools/invoice-generator",
        toolName: "invoice generator",
        guide: "/guides/payment-terms",
        guideName: "Net 30 and other payment terms",
        due: "Pay by",
        total: "Total to pay",
    },
    "credit-note": {
        base: "invoice",
        tool: "/tools/invoice-generator",
        toolName: "invoice generator",
        guide: "/guides/vat-and-sales-tax-basics",
        guideName: "VAT and sales tax basics",
        due: "",
        total: "Total credit",
    },
    "payment-reminder-letter": {
        base: "invoice",
        tool: "/tools/payment-reminder",
        toolName: "payment reminder",
        guide: "/guides/ask-client-for-payment",
        guideName: "How to ask a client for payment",
        due: "Pay by",
        total: "Total overdue",
    },
    "price-list": {
        base: "invoice",
        tool: "/tools/quote-maker",
        toolName: "quote maker",
        guide: "/guides/set-your-rate",
        guideName: "How to set your freelance rate",
        due: "Valid until",
    },
};

export const toolOf = (slug: DocumentSlug) => LOOK[slug];

/** One template page, with every layer resolved. */
export interface TemplatePage extends PageWords {
    /** The name of its files in public/templates. */
    key: string;
    path: string;
    h1: string;
    /** On a card and a link. */
    name: string;
    document: DocumentData;
    trade?: TradeEntry;
    country?: CountryEntry;
    band: { title: string; line: string };
    items: ExampleItem[];
    payment: Payment;
    fields: FieldNote[];
    facts: CountryFact[];
    example: Example;
    paper: "a4" | "letter";
    dateLocale: "en-GB" | "en-US";
}

const lower = (d: DocumentData) => d.name.toLowerCase();

const documentPage = (d: DocumentData): TemplatePage => ({
    ...d,
    band: BAND[d.slug],
    key: d.slug,
    path: `/templates/${d.slug}`,
    h1: `${d.name} template`,
    name: `${d.name} template`,
    document: d,
    facts: [],
    paper: "a4",
    dateLocale: "en-GB",
});

function comboPage(c: Combo): TemplatePage {
    const document = DOCUMENTS.find((d) => d.slug === c.document);
    if (!document) throw new Error(`no document "${c.document}"`);
    const trade = TRADES.find((t) => t.slug === c.trade);
    const country = COUNTRIES.find((x) => x.slug === c.country);
    const own = trade ?? country;
    if (!own)
        throw new Error(`combo for ${c.document} has no trade or country`);
    const layer = trade?.data ?? country?.data;
    const lowerName = lower(document);
    return {
        lede: c.lede,
        tips: c.tips,
        faqs: c.faqs,
        band: BAND[c.document],
        reviewed: c.reviewed,
        key: `${document.slug}-${own.slug}`,
        path: `/templates/${document.slug}/${own.slug}`,
        h1: trade
            ? `${document.name} template for ${trade.plural}`
            : `${own.name} ${lowerName} template`,
        name: trade
            ? `${document.name} for ${trade.plural}`
            : `${own.name} ${lowerName}${country?.tax ? ` (${country.tax})` : ""}`,
        document,
        trade,
        country,
        items: c.items ?? trade?.data?.items ?? document.items,
        payment: c.payment ?? layer?.payment ?? document.payment,
        fields: c.fields ?? layer?.fields ?? document.fields,
        facts: country?.data?.facts ?? [],
        example: { ...document.example, ...layer?.example, ...c.example },
        paper: country?.data?.paper ?? "a4",
        dateLocale: country?.data?.dateLocale ?? "en-GB",
    };
}

export const templatePages: TemplatePage[] = [
    ...DOCUMENTS.map(documentPage),
    ...COMBOS.map(comboPage),
];

export const templateAt = (path: string) =>
    templatePages.find((p) => p.path === path);

/** Every word on a page that isn't shared with the template around it. */
export function pageText(p: TemplatePage): string {
    return [
        p.lede,
        ...p.items.flatMap((i) => [i.line, i.billedBy, i.description]),
        p.payment.text,
        ...p.payment.points,
        ...p.fields.flatMap((f) => [f.name, f.why]),
        ...p.facts.flatMap((f) => [f.label, f.value]),
        ...p.tips.flatMap((t) => [t.title, t.text]),
        ...p.faqs.flatMap((f) => [f.question, f.answer]),
        p.example.letter ?? "",
        p.example.note ?? "",
        p.example.termsText ?? "",
    ]
        .filter(Boolean)
        .join("\n");
}

function draftOf(p: TemplatePage): DocDraft {
    const e = p.example;
    return {
        number: e.number,
        issued: e.issued,
        due: e.due,
        terms: e.terms,
        currency: e.currency,
        clientName: e.client.name,
        clientEmail: e.client.email ?? "",
        clientAddress: e.client.address ?? "",
        items: p.items.map((i, n) => ({
            id: String(n),
            description: i.description,
            qty: i.qty,
            rate: i.rate,
        })),
        taxes: (e.taxes ?? []).map((t, n) => ({ id: String(n), ...t })),
        discount: null,
        discountMode: "percent",
        depositPaid: e.depositPaid ?? null,
        payLink: "",
        bank: "",
        note: e.note ?? "",
        style: "plain",
        estimate: p.document.slug === "estimate",
        depositPlan: e.depositPlan ?? "none",
        depositAmount: "",
        termsText: e.termsText ?? "",
        signLine: true,
    };
}

/** The filled document: the preview, the PDF, the Word file and the sheet all draw this. */
export function templateView(p: TemplatePage): DocumentView {
    const e = p.example;
    const look = LOOK[p.document.slug];
    const taxIdLabel = e.from.taxIdLabel;
    const base = documentView(look.base, draftOf(p), {
        logo: "",
        name: e.from.name,
        email: e.from.email,
        address: e.from.address,
        taxId: taxIdLabel ? "" : (e.from.taxId ?? ""),
    });
    const date = (iso: string) =>
        isDate(iso)
            ? new Intl.DateTimeFormat(p.dateLocale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
              }).format(Date.parse(iso))
            : "";
    const priceList = p.document.slug === "price-list";
    const named = base.parties.filter((party) => party.lines.length);
    const relabel = (label: string, strong?: boolean) => {
        if (label === "Deposit paid") return e.depositLabel ?? label;
        if (!strong) return label;
        if (e.depositPaid !== undefined && !look.total) return "Balance due";
        return look.total ?? label;
    };
    return {
        ...base,
        heading: e.heading ?? p.document.name,
        stamp: look.stamp,
        parties:
            taxIdLabel && e.from.taxId
                ? named.map((party, i) =>
                      i === 0
                          ? {
                                ...party,
                                lines: [
                                    ...party.lines,
                                    `${taxIdLabel} ${e.from.taxId}`,
                                ],
                            }
                          : party,
                  )
                : named,
        facts: [
            { label: "Issued", value: date(e.issued) },
            { label: look.due, value: look.due ? date(e.due) : "" },
            ...(look.terms && e.terms !== "custom"
                ? [{ label: "Terms", value: TERM_LABELS[e.terms] }]
                : []),
            ...(e.facts ?? []),
        ].filter((f) => f.value !== ""),
        rows: priceList
            ? p.items.map((i) => ({
                  description: i.description,
                  qty: i.billedBy.toLowerCase(),
                  rate: "",
                  amount: formatPlain(toCents(parseNumber(i.rate))),
              }))
            : base.rows,
        headers: priceList
            ? { qty: "Unit", rate: "", amount: "Price" }
            : undefined,
        totals: priceList
            ? []
            : base.totals
                  // With no tax, a "Total" repeats the subtotal.
                  .filter((t) => t.label !== "Total" || e.taxes?.length)
                  .map((t) => ({
                      ...t,
                      label: relabel(t.label, t.strong),
                  })),
        blocks: [
            ...(e.letter ? [{ label: "", lines: [e.letter] }] : []),
            ...base.blocks,
        ],
        signLine: base.signLine,
        fileName: `${p.key}.pdf`,
    };
}

const FILES = "/templates";

export const downloads = (p: TemplatePage) => ({
    pdf: `${FILES}/${p.key}.pdf`,
    word: `${FILES}/${p.key}.docx`,
    sheets: `${FILES}/${p.key}.xlsx`,
});

/** "Fill it online": the right tool, already holding this page's example. */
export function fillHref(p: TemplatePage): string {
    const e = p.example;
    const slug = p.document.slug;
    const tool = LOOK[slug].tool;
    const draft = draftOf(p);
    const amount = formatPlain(totals(draft).total);
    if (slug === "receipt") {
        return carryHref(tool, {
            number: e.number,
            receivedFrom: e.client.name,
            amount,
            currency: e.currency,
            paidFor: p.items.map((i) => i.line).join(", "),
        });
    }
    if (slug === "payment-reminder-letter") {
        return carryHref(tool, {
            number: e.number,
            client: e.client.name,
            sender: e.from.name,
            amount: `${amount} ${e.currency}`,
        });
    }
    return carryHref(tool, {
        items: p.items.map(({ description, qty, rate }) => ({
            description,
            qty,
            rate,
        })),
        currency: e.currency,
        ...(e.taxes && { taxes: e.taxes }),
        ...(slug === "estimate" && { estimate: true }),
        ...(e.depositPaid && { depositPaid: e.depositPaid }),
    });
}

export interface TemplateCardData {
    href: string;
    title: string;
    doc: string;
    lines: string[];
}

export const cardOf = (p: TemplatePage): TemplateCardData => ({
    href: p.path,
    title: p.name,
    doc: p.document.name,
    lines: p.items.slice(0, 3).map((i) => i.line),
});

const documentPages = templatePages.filter((p) => !p.trade && !p.country);

/** What a hub lists: its own pages first, then the plain documents they don't cover yet. */
function hubPages(own: TemplatePage[]): TemplatePage[] {
    const covered = new Set(own.map((p) => p.document.slug));
    return [
        ...own,
        ...documentPages.filter((p) => !covered.has(p.document.slug)),
    ];
}

export const tradeHubPages = (slug: string) =>
    hubPages(templatePages.filter((p) => p.trade?.slug === slug));

export const countryHubPages = (slug: string) =>
    hubPages(templatePages.filter((p) => p.country?.slug === slug));

export interface RelatedLink {
    title: string;
    line: string;
    href: string;
}

/** Multiples of 3, so the grid is never left with a gap. */
const threes = <T>(list: T[]) =>
    list.slice(0, Math.max(3, Math.floor(list.length / 3) * 3)).slice(0, 6);

/** The cards under a page: its hub and guide first, as the spec's links out. */
export function relatedOf(p: TemplatePage): RelatedLink[] {
    const look = LOOK[p.document.slug];
    const own = p.trade ?? p.country;
    const guide: RelatedLink = {
        title: look.guideName,
        line: "A short guide, in plain words.",
        href: look.guide,
    };
    const sameOwner = (o: TemplatePage) =>
        o !== p &&
        (p.trade
            ? o.trade === p.trade
            : p.country
              ? o.country === p.country
              : !o.trade && !o.country);
    const others: RelatedLink[] = templatePages.filter(sameOwner).map((o) => ({
        title: o.name,
        line: o.document.line,
        href: o.path,
    }));
    if (!own) return threes([guide, ...others]);
    const plain = documentPages.find((d) => d.document === p.document);
    const audience = p.trade?.plural ?? p.country?.place;
    return threes([
        {
            title: `All templates for ${audience}`,
            line: `Every document we have for ${audience}.`,
            href: p.trade
                ? `/templates/for/${own.slug}`
                : `/templates/in/${own.slug}`,
        },
        guide,
        ...others,
        ...(plain
            ? [
                  {
                      title: plain.name,
                      line: plain.document.line,
                      href: plain.path,
                  },
              ]
            : []),
    ]);
}

/** Pages of the same document for other work or other places, nearest first. */
export function similarOf(p: TemplatePage): { name: string; href: string }[] {
    const same = templatePages.filter(
        (o) => o !== p && o.document === p.document && (o.trade ?? o.country),
    );
    const near = p.trade?.near ?? [];
    const rank = (o: TemplatePage) => {
        const at = o.trade ? near.indexOf(o.trade.slug) : -1;
        return at === -1 ? near.length : at;
    };
    return same
        .filter((o) => !p.trade || o.trade)
        .filter((o) => !p.country || o.country)
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, 6)
        .map((o) => ({
            name: o.trade
                ? `${o.trade.plural[0].toUpperCase()}${o.trade.plural.slice(1)}`
                : (o.country?.name ?? o.name),
            href: o.path,
        }));
}

export interface TemplateEntry {
    path: string;
    type: "template" | "templates";
    title: string;
    description: string;
    h1: string;
    crumb: { name: string; path?: string }[];
    unreviewed?: boolean;
    updated: string;
}

const LONGEST_TITLE = 66;

function entryOf(p: TemplatePage): TemplateEntry {
    const own = p.trade ?? p.country;
    const fuller = `${p.h1}, with example items | Saroh`;
    const what = p.trade
        ? `${lower(p.document)} template for ${p.trade.plural}`
        : p.country
          ? `${p.country.name} ${lower(p.document)} template`
          : `${lower(p.document)} template`;
    return {
        path: p.path,
        type: "template",
        title: fuller.length <= LONGEST_TITLE ? fuller : `${p.h1} | Saroh`,
        description: `Free ${what} with real example line items. Download as PDF, Word, Google Docs or Sheets, or fill it online.`,
        h1: p.h1,
        crumb: own
            ? [
                  { name: "Templates", path: "/templates" },
                  {
                      name: p.document.name,
                      path: `/templates/${p.document.slug}`,
                  },
                  { name: own.name },
              ]
            : [
                  { name: "Home", path: "/" },
                  { name: "Templates", path: "/templates" },
                  { name: p.document.name },
              ],
        ...(p.reviewed ? {} : { unreviewed: true }),
        updated: REVIEW_DATE,
    };
}

const hubCrumb = (name: string) => [
    { name: "Home", path: "/" },
    { name: "Templates", path: "/templates" },
    { name },
];

/** Generated from the data: a page exists only because its data does. */
export const templateEntries = (): TemplateEntry[] => [
    ...templatePages.map(entryOf),
    ...TRADES.map((t): TemplateEntry => ({
        path: `/templates/for/${t.slug}`,
        type: "templates",
        title: `Free templates for ${t.plural} | Saroh`,
        description: `Free invoice, quote and receipt templates for ${t.plural}, with real example line items.`,
        h1: `Templates for ${t.plural}`,
        crumb: hubCrumb(t.name),
        ...(t.data?.reviewed ? {} : { unreviewed: true }),
        updated: REVIEW_DATE,
    })),
    ...COUNTRIES.map((c): TemplateEntry => ({
        path: `/templates/in/${c.slug}`,
        type: "templates",
        title: `Free ${c.name} invoice and quote templates | Saroh`,
        description: `Free invoice and quote templates for ${c.place}, in the local currency and format.`,
        h1: `Templates for ${c.place}`,
        crumb: hubCrumb(c.name),
        ...(c.data?.reviewed ? {} : { unreviewed: true }),
        updated: REVIEW_DATE,
    })),
];
