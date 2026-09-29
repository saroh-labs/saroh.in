import { gstinProblem } from "@/lib/invoices/gstin";

import type { RegisteredAddressValues } from "./registered-address";
import { PIN_SHAPE } from "./registered-address";
import type {
    OrganizationSettings,
    OrganizationSettingsInput,
} from "./settings-service";

/**
 * "Add your business details" (DEC-068): the registered address, and a
 * GST-registered business's GSTIN, asked in place where the merchant meets
 * the API's refusal — Issue, Send, New order with a pay link, connecting a
 * payment provider — then the action they started carries on.
 *
 * The API refuses with 409 `{ reason: "BUSINESS_DETAILS_MISSING", missing:
 * ["address", "gstin"] }`; `missingDetailsOf` reads it off a failure, the
 * rest is the step's form: its values, what it must fix, and what it saves.
 */

export const BUSINESS_DETAILS_MISSING = "BUSINESS_DETAILS_MISSING";

export type BusinessDetail = "address" | "gstin";

const DETAILS: readonly BusinessDetail[] = ["address", "gstin"];

/**
 * What is missing, from a refusal's `details`; undefined for any other
 * failure, so it is shown as it always was.
 */
export function missingDetailsOf(
    details: unknown,
): BusinessDetail[] | undefined {
    if (!details || typeof details !== "object") return undefined;
    const d = details as { reason?: unknown; missing?: unknown };
    if (d.reason !== BUSINESS_DETAILS_MISSING) return undefined;
    const missing = Array.isArray(d.missing)
        ? DETAILS.filter((k) => (d.missing as unknown[]).includes(k))
        : [];
    // A refusal that names nothing asks for the address, the one every
    // invoice needs.
    return missing.length > 0 ? missing : ["address"];
}

/** The step's fields, as its form holds them. */
export interface BusinessDetailsValues extends RegisteredAddressValues {
    gstState: string;
    gstRegistered: boolean;
    taxId: string;
}

/** What is on file now, for the step to start from. */
export function detailsValuesOf(
    settings: Pick<
        OrganizationSettings,
        "profile" | "tax" | "registeredAddress"
    > | null,
): BusinessDetailsValues {
    const a = settings?.registeredAddress;
    return {
        addressLine1: a?.line1 ?? "",
        addressLine2: a?.line2 ?? "",
        city: a?.city ?? "",
        postalCode: a?.postalCode ?? "",
        gstState: settings?.tax?.state ?? a?.state ?? "",
        gstRegistered: settings?.tax?.registered ?? false,
        taxId: settings?.profile?.taxId ?? "",
    };
}

/** An address outside India has no Indian state to choose. */
export function inIndia(country: string | null | undefined): boolean {
    return ["", "IN", "INDIA"].includes((country ?? "").trim().toUpperCase());
}

/**
 * What the step must fix before it saves, on the field it is about. Every
 * invoice prints the address, so its first line, city and PIN are needed
 * whether or not the business is registered, and an Indian address its
 * state; a registered business's state is its GSTIN's.
 */
export function detailsProblems(
    v: BusinessDetailsValues,
    opts: { inIndia: boolean },
): { path: keyof BusinessDetailsValues; message: string }[] {
    const problems: { path: keyof BusinessDetailsValues; message: string }[] =
        [];
    const needed = [
        ["addressLine1", "Add the first line of your address."],
        ["city", "Add the city."],
        ["postalCode", "Add the PIN code."],
    ] as const;
    for (const [path, message] of needed) {
        if (!v[path].trim()) problems.push({ path, message });
    }
    const pin = v.postalCode.replace(/\s+/g, "");
    if (pin && (opts.inIndia || v.gstRegistered) && !PIN_SHAPE.test(pin)) {
        problems.push({
            path: "postalCode",
            message: "A PIN code is six digits, like 560038.",
        });
    }
    if (v.gstRegistered) {
        const gstin = gstinProblem(v.taxId);
        if (gstin) problems.push({ path: "taxId", message: gstin });
    } else if (opts.inIndia && !v.gstState) {
        problems.push({ path: "gstState", message: "Choose your state." });
    }
    return problems;
}

/**
 * The save: the address in full and the GST standing, as Settings ›
 * Business sends them. A registered business's state is its GSTIN's, and
 * its GSTIN goes with it (the API checks the pair). The registration goes
 * only when it changed: sending it re-checks the invoice number's format,
 * which a GSTIN or address save never does (DEC-028).
 */
export function detailsInput(
    v: BusinessDetailsValues,
    was: Pick<BusinessDetailsValues, "gstRegistered">,
): OrganizationSettingsInput {
    const gstin = v.taxId.trim().toUpperCase();
    return {
        registeredAddress: {
            line1: v.addressLine1.trim(),
            line2: v.addressLine2.trim(),
            city: v.city.trim(),
            postalCode: v.postalCode.trim(),
        },
        tax: {
            ...(v.gstRegistered !== was.gstRegistered
                ? { registered: v.gstRegistered }
                : {}),
            ...(v.gstRegistered
                ? { state: gstin.slice(0, 2) }
                : v.gstState
                  ? { state: v.gstState }
                  : {}),
        },
        ...(v.gstRegistered ? { profile: { taxId: gstin } } : {}),
    };
}

/** The sheet's line under its title: why it is asking, and what happens next. */
export function detailsWhy(
    missing: readonly BusinessDetail[],
    then: string,
): string {
    const address = missing.includes("address");
    const gstin = missing.includes("gstin");
    const what =
        address && gstin
            ? "your registered address and GSTIN"
            : gstin
              ? "your GSTIN"
              : "your registered address";
    return `Every invoice prints ${what}. Add ${address && gstin ? "them" : "it"} once and we'll ${then}.`;
}
