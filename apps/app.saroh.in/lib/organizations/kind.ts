/**
 * What is being set up (DEC-070): a business, just me, or a site for my work.
 *
 * The kind changes Saroh's WORDS and DEFAULTS only — never what a business
 * can do. Every module stays available to every kind, and nothing here may
 * hide, gate or refuse one (R3). The API is the authority on the stored value
 * (`organizations/organization-kind.ts`); this file mirrors its three values
 * and says what each one means on screen.
 *
 * Pure and client-safe: the setup form, Home and Settings all read it.
 */

/** BUSINESS: today's flow. SOLO: "Just me". WORK: "A site for my work". */
export const ORGANIZATION_KINDS = ["BUSINESS", "SOLO", "WORK"] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

/**
 * A kind as the API sent it. Unknown or absent — an API older than DEC-070,
 * or a value this app does not know yet — reads as BUSINESS, so nothing
 * changes until the API says otherwise.
 */
export function kindOf(raw: unknown): OrganizationKind {
    return typeof raw === "string" &&
        (ORGANIZATION_KINDS as readonly string[]).includes(raw)
        ? (raw as OrganizationKind)
        : "BUSINESS";
}

/** The three answers to "What are you setting up?", with DEC-070's examples. */
export const KIND_CHOICES: {
    kind: OrganizationKind;
    label: string;
    examples: string;
}[] = [
    {
        kind: "BUSINESS",
        label: "A business",
        examples: "Shop, studio, practice",
    },
    {
        kind: "SOLO",
        label: "Just me",
        examples: "Freelancer, consultant, creator",
    },
    {
        kind: "WORK",
        label: "A site for my work",
        examples: "Portfolio, blog, projects",
    },
];

/** The words a kind speaks in (plan KTD-5). */
export interface KindWords {
    /** "your business" / "you", mid-sentence. */
    owner: string;
    /** The same at the start of a sentence. */
    Owner: string;
    /** The people it deals with: "customers" / "clients" / "readers". */
    people: string;
    People: string;
    /** One of them. */
    person: string;
    /** The setup form's name label. */
    nameLabel: string;
    /** Settings' Business tab. */
    settingsTab: string;
    /** What the address printed on invoices is called. */
    registeredAddress: string;
}

const WORDS: Record<OrganizationKind, KindWords> = {
    BUSINESS: {
        owner: "your business",
        Owner: "Your business",
        people: "customers",
        People: "Customers",
        person: "customer",
        nameLabel: "What is it called?",
        settingsTab: "Business",
        registeredAddress: "registered address",
    },
    SOLO: {
        owner: "you",
        Owner: "You",
        people: "clients",
        People: "Clients",
        person: "client",
        nameLabel: "Your name or brand",
        settingsTab: "Your details",
        registeredAddress: "your address",
    },
    WORK: {
        owner: "you",
        Owner: "You",
        people: "readers",
        People: "Readers",
        person: "reader",
        nameLabel: "Your name or brand",
        settingsTab: "Your details",
        registeredAddress: "your address",
    },
};

/** The words for a kind; anything unknown speaks as a business. */
export function kindWords(kind: unknown): KindWords {
    return WORDS[kindOf(kind)];
}

/**
 * A first-run job with no module behind it: "Invoice a client" links to a
 * new invoice, which needs no module (DEC-070 Decision 5).
 */
export const INVOICE_JOB = "INVOICE";

/** The defaults a kind picks (plan KTD-6). None of them turns anything off. */
export interface KindDefaults {
    /**
     * Home's first-run jobs, in order: module keys, plus {@link INVOICE_JOB}.
     * Sell is never left out, only moved (R3).
     */
    firstRunOrder: readonly string[];
    /** The module `/onboarding/modules` pre-selects, if any. */
    preselect: string | null;
    /** Whether setup asks "Is it registered as a company?". */
    asksRegistered: boolean;
    /** The site template a new site starts from (K15). */
    starterTemplate: string;
    /** The setup name field's example. */
    namePlaceholder: string;
}

const DEFAULTS: Record<OrganizationKind, KindDefaults> = {
    BUSINESS: {
        firstRunOrder: ["COMMERCE", "APPOINTMENTS", "WEBSITE", "CRM"],
        preselect: "COMMERCE",
        asksRegistered: true,
        starterTemplate: "starter",
        namePlaceholder: "Rye & Co. Bakery",
    },
    SOLO: {
        firstRunOrder: [
            "APPOINTMENTS",
            INVOICE_JOB,
            "CRM",
            "WEBSITE",
            "COMMERCE",
        ],
        preselect: null,
        asksRegistered: true,
        starterTemplate: "personal",
        namePlaceholder: "Asha Rao",
    },
    WORK: {
        firstRunOrder: ["WEBSITE", "CRM", "APPOINTMENTS", "COMMERCE"],
        preselect: "WEBSITE",
        // Asked in Settings, and in place before a first invoice (DEC-068 M3).
        asksRegistered: false,
        starterTemplate: "portfolio",
        namePlaceholder: "Asha Rao Studio",
    },
};

/** The defaults for a kind; anything unknown gets a business's. */
export function kindDefaults(kind: unknown): KindDefaults {
    return DEFAULTS[kindOf(kind)];
}

/** Home's first-run jobs for a kind, in order (K3 reads it). */
export function firstRunOrder(kind: unknown): readonly string[] {
    return kindDefaults(kind).firstRunOrder;
}

/** What `/onboarding/modules` pre-selects for a kind (K3 reads it). */
export function preselect(kind: unknown): string | null {
    return kindDefaults(kind).preselect;
}
