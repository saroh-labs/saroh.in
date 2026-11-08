import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { checkPostcode, checkRegion, editionProfile } from "@saroh/edition";

import {
    bpsToRate,
    isGstRate,
    notGstRateMessage,
    rateToBps,
} from "../invoices/gst";
import type { GstPriceMode, PriceTerms } from "../invoices/gst-price";
import { businessPriceMode } from "../invoices/gst-price";
import { gstinProblem, stateCode, stateName } from "../invoices/gst-states";
import type {
    NumberFormat,
    NumberPart,
    NumberRestart,
    NumberSeparator,
} from "../invoices/numbering";
import {
    defaultNumberFormat,
    numberFormatFor,
    numberFormatProblem,
    prefixProblem,
    readNumberFormat,
} from "../invoices/numbering";
import type { UpdateOrganizationDto } from "./dto";

/**
 * A business's GST settings and registered address (ADR-008): how they read,
 * and what a PATCH to them may write. Pure — the settings service reads the
 * stored profile and writes the result.
 */

export interface TaxSettingsView {
    registered: boolean;
    /** A GST state code, e.g. "29", and its name. */
    state: string | null;
    stateName: string | null;
    invoicePrefix: string | null;
    /** The GST rate on delivery, in percent ("18"). */
    deliveryRate: string;
    deliverySac: string | null;
    /**
     * How its prices carry GST (`invoices/gst-price.ts`): INCLUDED until
     * the business says GST is added. Read only while it is registered.
     */
    priceMode: GstPriceMode;
    /** A Global business's tax line (DEC-204); null until it's set. */
    taxName: string | null;
    taxRate: string | null;
    /** The month its numbering year starts: April, unless it chose January. */
    yearStartMonth: number;
    /** How invoice numbers are built, and where their counters stand. */
    invoiceNumber: InvoiceNumberView;
}

/**
 * The business's number format — the one it chose, else the default for its
 * standing (`custom: false`) — and, for the preview of the next number, the
 * last number its invoice series took in the current period for each way of
 * restarting (0: none yet). The financial year is April–March, fixed.
 */
export interface InvoiceNumberView {
    parts: NumberPart[];
    separator: NumberSeparator;
    digits: number;
    restart: NumberRestart;
    custom: boolean;
    counters: Record<NumberRestart, number>;
}

export interface RegisteredAddressView {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postalCode: string | null;
    /** A GST state code and its name: the same as `tax.state`. */
    state: string | null;
    stateName: string | null;
    /** Global's state, province or region (DEC-204): "TX"; null in India. */
    region: string | null;
}

/** The profile columns a tax or address PATCH writes. */
export type TaxData = Partial<{
    gstRegistered: boolean;
    gstState: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    region: string | null;
    invoicePrefix: string | null;
    invoiceNumberFormat: Prisma.InputJsonObject;
    deliveryGstRate: string;
    deliverySacCode: string | null;
    gstPriceMode: GstPriceMode;
    taxName: string | null;
    taxRate: string | null;
    yearStartMonth: number;
}>;

/** The stored profile, as far as the tax and address read it. */
export interface TaxProfileColumns {
    gstRegistered: boolean;
    gstState: string | null;
    invoicePrefix: string | null;
    /** As stored; absent on a profile read without it: the default. */
    invoiceNumberFormat?: unknown;
    deliveryGstRate: { toString(): string };
    deliverySacCode: string | null;
    taxName?: string | null;
    taxRate?: { toString(): string } | null;
    yearStartMonth?: number | null;
    /** As stored; absent on a profile read without it: INCLUDED. */
    gstPriceMode?: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    /** Global's address region (DEC-204); absent on a read without it. */
    region?: string | null;
}

/** What the checks read of the stored profile. */
export const TAX_CURRENT_SELECT = {
    gstRegistered: true,
    gstState: true,
    taxId: true,
    country: true,
    invoicePrefix: true,
    invoiceNumberFormat: true,
    gstPriceMode: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
    region: true,
} as const;

export interface TaxCurrent {
    gstRegistered: boolean;
    gstState: string | null;
    taxId: string | null;
    country: string | null;
    invoicePrefix?: string | null;
    invoiceNumberFormat?: unknown;
    /** As stored; absent or null: INCLUDED. */
    gstPriceMode?: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    region?: string | null;
}

/**
 * How the business prices before and after a tax save
 * (`invoices/gst-price.ts`), and whether the save adds GST to prices that
 * had none added: switching to "GST is added", or becoming registered (a
 * product can already be set to "GST is added" on its own, and a business
 * that registered before keeps the choice it made then).
 *
 * "Registered" is `loadPriceTerms`' test: the switch, a GSTIN and a state.
 * A save that adds GST can take products above their MRP, so the settings
 * service counts them first (`products/over-mrp.ts`). Going back to
 * "includes GST", or deregistering, never does.
 */
export function priceTermsChange(
    current: TaxCurrent | null,
    data: TaxData,
    sentTaxId: string | undefined,
): { before: PriceTerms; after: PriceTerms; addsGst: boolean } {
    const terms = (
        registered: boolean,
        taxId: string | null | undefined,
        state: string | null | undefined,
        mode: unknown,
    ): PriceTerms => ({
        registered: Boolean(registered && taxId?.trim() && state),
        mode: businessPriceMode(mode),
    });
    const before = terms(
        current?.gstRegistered ?? false,
        current?.taxId,
        current?.gstState,
        current?.gstPriceMode,
    );
    const after = terms(
        data.gstRegistered ?? current?.gstRegistered ?? false,
        sentTaxId ?? current?.taxId,
        data.gstState !== undefined ? data.gstState : current?.gstState,
        data.gstPriceMode ?? current?.gstPriceMode,
    );
    return {
        before,
        after,
        addsGst:
            after.registered &&
            (!before.registered ||
                (before.mode !== "ADDED" && after.mode === "ADDED")),
    };
}

const NO_COUNTERS: Record<NumberRestart, number> = {
    FY: 0,
    MONTH: 0,
    NEVER: 0,
};

export function taxView(
    p: TaxProfileColumns | null,
    counters: Record<NumberRestart, number> = NO_COUNTERS,
): TaxSettingsView {
    const bps = rateToBps(p?.deliveryGstRate ?? "18") ?? 1800;
    const registered = p?.gstRegistered ?? false;
    const format = numberFormatFor(p?.invoiceNumberFormat, registered);
    return {
        registered: p?.gstRegistered ?? false,
        state: p?.gstState ?? null,
        stateName: stateName(p?.gstState),
        invoicePrefix: p?.invoicePrefix ?? null,
        deliveryRate: bpsToRate(bps),
        deliverySac: p?.deliverySacCode ?? null,
        priceMode: businessPriceMode(p?.gstPriceMode),
        taxName: p?.taxName ?? null,
        taxRate: p?.taxRate == null ? null : String(Number(p.taxRate)),
        yearStartMonth: p?.yearStartMonth ?? 4,
        invoiceNumber: {
            ...format,
            custom: readNumberFormat(p?.invoiceNumberFormat) !== null,
            counters,
        },
    };
}

export function addressView(
    p: TaxProfileColumns | null,
): RegisteredAddressView {
    return {
        line1: p?.addressLine1 ?? null,
        line2: p?.addressLine2 ?? null,
        city: p?.city ?? null,
        postalCode: p?.postalCode ?? null,
        state: p?.gstState ?? null,
        stateName: stateName(p?.gstState),
        region: p?.region ?? null,
    };
}

/** An Indian PIN code: six digits, never starting with 0. */
const PIN_SHAPE = /^[1-9][0-9]{5}$/;

type AddressInput = UpdateOrganizationDto["registeredAddress"];
type AddressData = Pick<
    TaxData,
    "addressLine1" | "addressLine2" | "city" | "postalCode" | "region"
>;

/** The address lines a PATCH sent, as columns; "" clears one. */
function reduceAddress(address: AddressInput): AddressData {
    if (!address) return {};
    const data: AddressData = {};
    const put = (key: keyof AddressData, value: string | undefined) => {
        if (value !== undefined) data[key] = value === "" ? null : value;
    };
    put("addressLine1", address.line1);
    put("addressLine2", address.line2);
    put("city", address.city);
    // "560 038" is how a PIN is often written; it is stored bare. Any
    // other postal code is kept as typed.
    const bare = address.postalCode?.replace(/\s+/g, "");
    put("postalCode", bare && /^\d{6}$/.test(bare) ? bare : address.postalCode);
    put("region", address.region);
    return data;
}

function taxError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

/**
 * A Global business's own address against its country's rules (KTD-A): the
 * postcode's shape, and the region from its list, each required where the
 * country needs one once any of the address is in (an address being cleared
 * whole needs nothing). Checked only when the address is sent; what was sent
 * is written as the rules store it ("k1a0b1" is "K1A 0B1", "Texas" is "TX").
 */
function countryAddress(
    country: string,
    current: TaxCurrent | null,
    sent: AddressData,
): AddressData {
    if (Object.keys(sent).length === 0) return {};
    const now = {
        addressLine1: current?.addressLine1 ?? null,
        city: current?.city ?? null,
        postalCode: current?.postalCode ?? null,
        region: current?.region ?? null,
        ...sent,
    };
    const typed = Object.values(now).some((v) => !!v?.trim());
    const required = typed ? undefined : false;
    const postcode = checkPostcode(country, now.postalCode, required);
    if ("problem" in postcode) taxError(postcode.problem, "postalCode");
    const region = checkRegion(country, now.region, required);
    if ("problem" in region) taxError(region.problem, "region");
    return {
        ...(sent.postalCode !== undefined
            ? { postalCode: postcode.value || null }
            : {}),
        ...(sent.region !== undefined ? { region: region.value || null } : {}),
    };
}

/** What a PATCH sent that the tax checks read. */
export interface TaxSent {
    tax: UpdateOrganizationDto["tax"];
    taxId: string | undefined;
    country: string | undefined;
    address: AddressInput;
}

/** Whether a PATCH touches anything the tax checks judge. */
export function touchesTax(sent: TaxSent): boolean {
    return (
        sent.tax !== undefined ||
        sent.taxId !== undefined ||
        sent.country !== undefined ||
        Object.keys(reduceAddress(sent.address)).length > 0
    );
}

/**
 * The GST settings a PATCH asks for, checked against what is stored
 * (ADR-008). Registering needs a GSTIN — the profile's tax ID, sent in the
 * same PATCH or already saved — in the register's shape, with its check
 * character, from the state chosen (or, with none chosen, its own). A
 * registered business cannot clear its GSTIN. The number format — the one
 * sent, else the one stored, else the default — must suit the business as
 * it will be ({@link numberFormatProblem}): changing the prefix or the
 * registration re-checks it, and nothing else does.
 *
 * The registered address goes with them: a registered business needs a
 * first line, a city and a PIN (CGST rule 46), and an Indian business's
 * PIN is six digits. Its state is `gstState`, registered or not.
 */
export function taxChanges(
    current: TaxCurrent | null,
    sent: TaxSent,
    edition: Edition = "INDIA",
): TaxData {
    const { tax } = sent;
    const addressData = reduceAddress(sent.address);
    const data: TaxData = { ...addressData };

    let state = current?.gstState ?? null;
    if (tax?.state !== undefined) {
        if (tax.state === "") {
            state = null;
        } else {
            state = stateCode(tax.state);
            if (!state) taxError("That is not a state we know", "gstState");
        }
        data.gstState = state;
    }
    // GST is India's, and a tax line is Global's (DEC-204). Neither edition
    // stores the other's for a day it would never come.
    if (editionProfile(edition).taxSystem === "named-line") {
        if (tax?.registered)
            taxError("GST is for businesses in India.", "gstRegistered");
        // GST's state, delivery rate and SAC are India's too (P2 #10).
        if (tax?.state) taxError("GST is for businesses in India.", "state");
        if (tax?.deliveryRate !== undefined) {
            taxError("GST is for businesses in India.", "deliveryRate");
        }
        if (tax?.deliverySac) {
            taxError("GST is for businesses in India.", "deliverySac");
        }
        if (tax?.taxName !== undefined) data.taxName = tax.taxName || null;
        if (tax?.taxRate !== undefined) data.taxRate = tax.taxRate || null;
        if (tax?.yearStartMonth !== undefined) {
            data.yearStartMonth = tax.yearStartMonth;
        }
    } else if (
        tax?.taxName !== undefined ||
        tax?.taxRate !== undefined ||
        tax?.yearStartMonth !== undefined
    ) {
        taxError("Set by GST law for businesses in India.", "yearStartMonth");
    }
    const registered = tax?.registered ?? current?.gstRegistered ?? false;
    if (tax?.registered !== undefined) data.gstRegistered = registered;

    const gstin = (sent.taxId ?? current?.taxId ?? "").trim().toUpperCase();
    if (registered) {
        if (!gstin) {
            taxError(
                "A GST-registered business needs its GSTIN in Tax ID.",
                "taxId",
            );
        }
        if (!state) {
            state = gstin.slice(0, 2);
            data.gstState = state;
        }
        const problem = gstinProblem(gstin, state);
        if (problem) taxError(problem, "taxId");
    }

    const address = {
        addressLine1: current?.addressLine1 ?? null,
        city: current?.city ?? null,
        postalCode: current?.postalCode ?? null,
        ...addressData,
    };
    // "IN" is what the form sends; older profiles say "India". GST means
    // India either way.
    const country = (sent.country ?? current?.country ?? "")
        .trim()
        .toUpperCase();
    const india = country === "IN" || country === "INDIA" || registered;
    if (address.postalCode && india && !PIN_SHAPE.test(address.postalCode)) {
        taxError("A PIN code is six digits, like 560038.", "postalCode");
    }
    if (editionProfile(edition).address === "country-and-region") {
        Object.assign(data, countryAddress(country, current, addressData));
    } else if (addressData.region !== undefined) {
        // India's state is its GST state: one place for it.
        if (addressData.region) {
            taxError("Your state comes from your GST state.", "region");
        }
        delete data.region;
    }
    if (registered) {
        const missing = (["addressLine1", "city", "postalCode"] as const).find(
            (key) => !address[key]?.trim(),
        );
        if (missing) {
            taxError(
                "A GST-registered business needs its registered address: it prints on every tax invoice.",
                missing,
            );
        }
    }

    if (tax?.invoicePrefix !== undefined) {
        const prefix = tax.invoicePrefix.toUpperCase();
        if (prefix === "") {
            data.invoicePrefix = null;
        } else {
            const problem = prefixProblem(prefix);
            if (problem) taxError(problem, "invoicePrefix");
            data.invoicePrefix = prefix;
        }
    }
    const sentFormat = tax?.invoiceNumber;
    let format: NumberFormat | null = null;
    if (sentFormat !== undefined) {
        format = readNumberFormat(sentFormat);
        if (!format) {
            taxError(
                "That is not a number format we know.",
                "invoiceNumberParts",
            );
        }
        data.invoiceNumberFormat = {
            parts: format.parts,
            separator: format.separator,
            digits: format.digits,
            restart: format.restart,
        };
    }
    // Only what can make the number wrong re-checks it: the format, the
    // prefix or the registration. A format saved under older, looser rules
    // keeps numbering as it is and never blocks a GSTIN, country or address
    // save; it is told when it is next changed.
    const recheck =
        sentFormat !== undefined ||
        tax?.invoicePrefix !== undefined ||
        tax?.registered !== undefined;
    const problem = recheck
        ? numberFormatProblem(
              // The stored format as it is, not as numbering would bend it:
              // a business registering with a counter that never restarts
              // is told.
              format ??
                  readNumberFormat(current?.invoiceNumberFormat) ??
                  defaultNumberFormat(registered),
              {
                  registered,
                  prefix:
                      data.invoicePrefix !== undefined
                          ? data.invoicePrefix
                          : (current?.invoicePrefix ?? null),
              },
          )
        : null;
    if (problem) {
        // A prefix that alone makes the number too long is the prefix's.
        const prefixOnly =
            !sentFormat &&
            tax?.invoicePrefix !== undefined &&
            problem.field === "invoiceNumberDigits";
        taxError(problem.message, prefixOnly ? "invoicePrefix" : problem.field);
    }

    if (tax?.deliveryRate !== undefined) {
        if (!isGstRate(tax.deliveryRate)) {
            taxError(notGstRateMessage(tax.deliveryRate), "deliveryRate");
        }
        data.deliveryGstRate = tax.deliveryRate;
    }
    if (tax?.deliverySac !== undefined) {
        data.deliverySacCode = tax.deliverySac === "" ? null : tax.deliverySac;
    }
    // How prices carry GST is a registered business's choice: one that
    // charges no GST is never asked, and a stray request is refused rather
    // than stored for the day it registers.
    if (tax?.priceMode !== undefined) {
        if (!registered) {
            taxError(
                "Only a GST-registered business chooses how its prices carry GST.",
                "priceMode",
            );
        }
        data.gstPriceMode = tax.priceMode;
    }
    return data;
}
