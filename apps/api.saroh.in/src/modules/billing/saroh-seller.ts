import { env } from "../../env";
import { stateCode } from "../invoices/gst-states";

/**
 * Saroh as the seller on its own invoices to businesses (pricing catalogue
 * U17). Every value is configuration, read at use from `env.ts` and never
 * written into the code: the legal name, GSTIN, state, address, contact
 * email, SAC and the series prefix (`docs/architecture/ENVIRONMENT.md`).
 *
 * Copied onto each invoice when it is written, so a later change of
 * configuration never rewrites a paper already issued.
 */
export interface SarohSeller {
    /** The brand the paper is headed with. */
    name: string;
    legalName: string | null;
    gstin: string | null;
    /** GST state code ("29"); from the GSTIN when not set on its own. */
    state: string | null;
    address: string | null;
    email: string | null;
    sac: string | null;
    /** The series prefix: SRH → SRH/26-27/00001. */
    prefix: string;
}

export const DEFAULT_SAROH_INVOICE_PREFIX = "SRH";

/** The env values the seller is read from (a subset of `env`). */
export interface SellerEnv {
    SAROH_LEGAL_NAME?: string;
    SAROH_GSTIN?: string;
    SAROH_GST_STATE?: string;
    SAROH_REGISTERED_ADDRESS?: string;
    SAROH_BILLING_EMAIL?: string;
    SAROH_INVOICE_SAC?: string;
    SAROH_INVOICE_PREFIX?: string;
}

const clean = (v: string | undefined): string | null => {
    const t = v?.trim();
    return t === undefined || t === "" ? null : t;
};

/**
 * Saroh as seller, from configuration. Values are checked again here, since
 * `SKIP_ENV_VALIDATION` hands `env` over unchecked: a prefix that isn't one
 * to three capitals or digits falls back to the default, and a state that
 * isn't a GST state code is read from the GSTIN instead.
 */
export function sarohSeller(source: SellerEnv = env): SarohSeller {
    const gstin = clean(source.SAROH_GSTIN)?.toUpperCase() ?? null;
    const prefix = clean(source.SAROH_INVOICE_PREFIX);
    return {
        name: "Saroh",
        legalName: clean(source.SAROH_LEGAL_NAME),
        gstin,
        state:
            stateCode(clean(source.SAROH_GST_STATE)) ??
            stateCode(gstin?.slice(0, 2)) ??
            null,
        address: clean(source.SAROH_REGISTERED_ADDRESS),
        email: clean(source.SAROH_BILLING_EMAIL),
        sac: clean(source.SAROH_INVOICE_SAC),
        prefix:
            prefix && /^[A-Z0-9]{1,3}$/.test(prefix)
                ? prefix
                : DEFAULT_SAROH_INVOICE_PREFIX,
    };
}

/** What the seller is missing for a tax invoice; empty when nothing. */
export function sellerGaps(seller: SarohSeller): string[] {
    return [
        seller.legalName ? null : "SAROH_LEGAL_NAME",
        seller.gstin ? null : "SAROH_GSTIN",
        seller.state ? null : "SAROH_GST_STATE",
        seller.address ? null : "SAROH_REGISTERED_ADDRESS",
        seller.sac ? null : "SAROH_INVOICE_SAC",
    ].filter((x): x is string => x !== null);
}
