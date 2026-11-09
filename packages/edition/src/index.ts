/**
 * The editions: India on saroh.in, Global on saroh.tech (DEC-204). Code asks
 * here what it needs, never "is this India?", so another edition or domain
 * means another entry. A business's edition lives on the business; addresses
 * only say where each edition is served.
 */
export const EDITIONS = ["INDIA", "GLOBAL"] as const;
export type Edition = (typeof EDITIONS)[number];

/** Whether a stored value names an edition. */
export function isEdition(value: unknown): value is Edition {
    return (EDITIONS as readonly unknown[]).includes(value);
}

export type DeployEnvironment = "production" | "development";

/**
 * What code asks of an edition (DEC-204 item 7). Each fact is a question some
 * code answers by reading it, never "is this India?"; a new edition fills
 * every one, or the build fails.
 */
export interface EditionProfile {
    /** GST (registration, GSTIN, CGST/SGST/IGST, April to March), or one named tax line ("VAT 20%") with a numbering year the business picks. */
    taxSystem: "gst" | "named-line";
    /** "How to pay us": UPI and an IFSC-backed bank account, or a bank account with an optional bank code and no UPI. */
    payInstructions: "upi-and-ifsc" | "bank-code";
    /**
     * Whether a business offers "How to pay us" at all: its settings, Home's
     * step, and the bank details its customers see. Off for Global, which
     * takes payment through Stripe only, until each country's transfer
     * conventions are researched (owner, 6 Nov 2026, DEC-208); its
     * per-country bank rules (`bank-details.ts`) stay, off.
     */
    payInstructionsOffered: boolean;
    /** An address's last lines: an Indian state and six-digit PIN, both required, or a free region and postcode with a country. */
    address: "indian-state-and-pin" | "country-and-region";
    /** A phone without "+" reads as Indian, or every number starts with its country code. */
    phoneNumbers: "indian" | "with-country-code";
    /** The business's country: India, never asked, or asked once at setup, where it suggests the currency. */
    businessCountry: "india-only" | "asked-at-setup";
    /** Whether Saroh bills the business itself, through a billing profile. */
    sarohBilling: boolean;
    /** Whether people can sign in to Saroh with a phone (each code costs money). */
    phoneSignIn: boolean;
    /** The higher, struck-through price: India's printed MRP, or an original price. */
    struckPrice: "mrp" | "original-price";
    /** Whether the site has each tool's own page, or only the tools hub. */
    toolPages: "own" | "hub";
    /** Help and docs on the edition's own addresses, or the shared ones. */
    helpAndDocs: "own-addresses" | "shared";
    /** How numbers group: lakh and crore (DEC-079), or thousands. */
    numberLocale: "en-IN" | "en-US";
    /** Whether customers pay by UPI: a way a payment taken by hand is recorded, and named where they pay. A payment already recorded as UPI still reads "UPI". */
    upi: boolean;
    /** The payment providers a business may connect to take its customers' money; no two editions share one. */
    paymentProviders: readonly ("RAZORPAY" | "CASHFREE" | "STRIPE")[];
    /**
     * Whether a business takes its customers' money online whatever Saroh
     * plan it is on: its plan's online payments row, and its room for its
     * own accounts when it connects a payment provider, are not asked
     * (owner, 6 Nov 2026, DEC-208). Memberships and its own email stay the
     * plan's to say.
     */
    onlinePaymentsOnEveryPlan: boolean;
    /**
     * The suffix on the env names an edition sets for itself (its GitHub
     * sign-in app, its senders): India's are the original names, Global's
     * end in `_GLOBAL` (stage 10, KTD5 and KTD6).
     */
    envSuffix: "" | "_GLOBAL";
    /** Saroh's senders on the edition's own domain, until their env names are set. */
    defaultSenders: { mail: string; codes: string };
    /**
     * The zone a business's times are written in when nothing better is
     * known (no profile, an unreadable zone): India's own, or UTC where the
     * edition spans many. A business's stored zone always wins.
     */
    defaultZone: string;
}

export const EDITION_PROFILES: Record<Edition, EditionProfile> = {
    INDIA: {
        taxSystem: "gst",
        payInstructions: "upi-and-ifsc",
        payInstructionsOffered: true,
        address: "indian-state-and-pin",
        phoneNumbers: "indian",
        businessCountry: "india-only",
        sarohBilling: true,
        phoneSignIn: true,
        struckPrice: "mrp",
        toolPages: "own",
        helpAndDocs: "own-addresses",
        numberLocale: "en-IN",
        upi: true,
        paymentProviders: ["RAZORPAY", "CASHFREE"],
        onlinePaymentsOnEveryPlan: false,
        envSuffix: "",
        defaultSenders: {
            mail: "Saroh <noreply@saroh.in>",
            codes: "codes@saroh.in",
        },
        defaultZone: "Asia/Kolkata",
    },
    GLOBAL: {
        taxSystem: "named-line",
        payInstructions: "bank-code",
        payInstructionsOffered: false,
        address: "country-and-region",
        phoneNumbers: "with-country-code",
        businessCountry: "asked-at-setup",
        sarohBilling: false,
        phoneSignIn: false,
        struckPrice: "original-price",
        toolPages: "hub",
        helpAndDocs: "shared",
        numberLocale: "en-US",
        upi: false,
        paymentProviders: ["STRIPE"],
        onlinePaymentsOnEveryPlan: true,
        envSuffix: "_GLOBAL",
        defaultSenders: {
            mail: "Saroh <noreply@saroh.tech>",
            codes: "codes@saroh.tech",
        },
        defaultZone: "UTC",
    },
};

/** An edition's profile. Unset is India, as every business was before Global. */
export const editionProfile = (
    edition: Edition | null | undefined,
): EditionProfile => EDITION_PROFILES[edition ?? "INDIA"];

export interface EditionHosts {
    /** The marketing site. saroh.in redirects to `www`; saroh.tech has none. */
    site: string;
    app: string;
    api: string;
    accounts: string;
    admin: string;
}

/**
 * Global's development addresses are a deployment setting, never written in
 * this public repo. Unset, they're a name that can't resolve.
 */
const globalDevelopmentHosts = (): EditionHosts => {
    const domain = process.env.GLOBAL_DEV_DOMAIN?.trim()
        ? process.env.GLOBAL_DEV_DOMAIN.trim()
        : "global-dev.invalid";
    return {
        site: domain,
        app: `app.${domain}`,
        api: `api.${domain}`,
        accounts: `accounts.${domain}`,
        admin: `admin.${domain}`,
    };
};

const FIXED_HOSTS: Record<
    Edition,
    Partial<Record<DeployEnvironment, EditionHosts>>
> = {
    INDIA: {
        production: {
            site: "www.saroh.in",
            app: "app.saroh.in",
            api: "api.saroh.in",
            accounts: "accounts.saroh.in",
            admin: "admin.saroh.in",
        },
        development: {
            site: "www.saroh.io",
            app: "app.saroh.io",
            api: "api.saroh.io",
            accounts: "accounts.saroh.io",
            admin: "admin.saroh.io",
        },
    },
    GLOBAL: {
        production: {
            site: "saroh.tech",
            app: "app.saroh.tech",
            api: "api.saroh.tech",
            accounts: "accounts.saroh.tech",
            admin: "admin.saroh.tech",
        },
    },
};

/** Merchant sites are one place for both editions, and so is their API. */
const MERCHANT_SITES: Record<DeployEnvironment, { root: string; api: string }> =
    {
        production: { root: "saroh.app", api: "api.saroh.app" },
        development: { root: "saroh.dev", api: "api.saroh.dev" },
    };

export const hostsFor = (
    edition: Edition,
    environment: DeployEnvironment,
): EditionHosts =>
    FIXED_HOSTS[edition][environment] ?? globalDevelopmentHosts();

export const merchantSitesFor = (environment: DeployEnvironment) =>
    MERCHANT_SITES[environment];

/** https://… for a host. */
export const urlOf = (host: string) => `https://${host}`;

/**
 * The edition serving a business in this country (ISO 3166-1 alpha-2). A blank
 * country is refused rather than guessed: the edition is set once.
 */
export function editionForCountry(country: string): Edition {
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
        throw new Error(`Not a country code: "${country}"`);
    }
    return code === "IN" ? "INDIA" : "GLOBAL";
}

/**
 * The edition an address belongs to, or null for one that belongs to neither:
 * merchant sites' API and anything unknown. Which edition a request is about
 * comes from the business; this is only for checking the two agree.
 */
export function editionOfHost(host: string): Edition | null {
    const name = host.trim().toLowerCase().replace(/:\d+$/, "");
    if (!name) return null;
    for (const edition of EDITIONS) {
        for (const environment of ["production", "development"] as const) {
            const hosts = hostsFor(edition, environment);
            if (Object.values(hosts).includes(name)) return edition;
        }
    }
    return null;
}

/** Which environment an edition's address belongs to, or null for neither. */
export function environmentOfHost(host: string): DeployEnvironment | null {
    const name = host.trim().toLowerCase().replace(/:\d+$/, "");
    for (const environment of ["production", "development"] as const) {
        for (const edition of EDITIONS) {
            const hosts = hostsFor(edition, environment);
            if (Object.values(hosts).includes(name)) return environment;
        }
    }
    return null;
}

/** The marketing site people are sent to. Its pages exist only in production. */
export const siteUrlOf = (edition: Edition) =>
    urlOf(hostsFor(edition, "production").site);

/**
 * The edition a deployment serves, from `NEXT_PUBLIC_EDITION`. Unset is India,
 * as every deployment was before there were two; a misspelling is refused
 * rather than quietly serving the wrong edition's links.
 */
export function parseEdition(value: string | undefined): Edition {
    if (!value) return "INDIA";
    const edition = EDITIONS.find((e) => e === value);
    if (!edition) throw new Error(`Not an edition: "${value}"`);
    return edition;
}

/**
 * How an edition groups numbers: lakh and crore in India (DEC-079), thousands
 * elsewhere. Dates are written day first everywhere, so they don't vary.
 */
export const numberLocaleOf = (edition: Edition) =>
    editionProfile(edition).numberLocale;

/**
 * The same for an amount where one deployment serves both editions, as the
 * API's mail does. A business sells in one currency, so the currency says.
 */
export const moneyLocaleOf = (currency: string | null | undefined) =>
    currency === "INR" ? "en-IN" : "en-US";

const EURO_COUNTRIES =
    "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ");

/** What a Global business is offered at setup. Stripe takes all of these. */
export const GLOBAL_CURRENCIES = [
    "USD",
    "EUR",
    "GBP",
    "CAD",
    "AUD",
    "NZD",
    "SGD",
    "AED",
    "ZAR",
] as const;

const COUNTRY_CURRENCY: Record<string, (typeof GLOBAL_CURRENCIES)[number]> = {
    GB: "GBP",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    SG: "SGD",
    AE: "AED",
    ZA: "ZAR",
};

/** The currency setup suggests for a country; the business can pick another. */
export function currencyForCountry(country: string): string {
    const code = country.trim().toUpperCase();
    if (code === "IN") return "INR";
    if (EURO_COUNTRIES.includes(code)) return "EUR";
    return COUNTRY_CURRENCY[code] ?? "USD";
}

export * from "./address-rules";
export * from "./bank-details";
export * from "./country-words";
export * from "./country-zones";

/**
 * Where a Stripe business's customers pay (owner, 8 Nov 2026, DEC-208):
 * Stripe's hosted Checkout page (the default) or Saroh's own card window on
 * the business's page. Kept per Stripe connection; null reads as hosted.
 * Shared by the API's DTO and the workspace.
 */
export const STRIPE_CHECKOUT_STYLES = ["HOSTED", "WINDOW"] as const;
export type StripeCheckoutStyle = (typeof STRIPE_CHECKOUT_STYLES)[number];
