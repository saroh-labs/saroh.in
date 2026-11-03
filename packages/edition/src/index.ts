/**
 * The editions: India on saroh.in, Global on saroh.tech (DEC-204). Code asks
 * here what it needs, never "is this India?", so another edition or domain
 * means another entry. A business's edition lives on the business; addresses
 * only say where each edition is served.
 */
export const EDITIONS = ["INDIA", "GLOBAL"] as const;
export type Edition = (typeof EDITIONS)[number];

export type DeployEnvironment = "production" | "development";

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
    const domain = process.env.GLOBAL_DEV_DOMAIN ?? "global-dev.invalid";
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
    edition === "INDIA" ? "en-IN" : "en-US";

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
