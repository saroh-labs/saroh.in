import { z } from "zod";

import {
    ADDRESS_API_KEY,
    ADDRESS_KEYS,
    registeredAddressShape,
} from "@/components/organizations/registered-address-shape";
import {
    GST_STATES,
    isHsnSac,
    PREFIX_SHAPE,
    rateOption,
} from "@/lib/invoices/gst";
import { gstinProblem } from "@/lib/invoices/gstin";
import {
    defaultNumberFormat,
    formatFields,
    formatOf,
    nextInvoiceNumber,
    prefixOf,
} from "@/lib/invoices/invoice-number";
import { phoneLabel, phoneProblem } from "@/lib/organizations/business-phone";
import type { BusinessSheet } from "@/lib/organizations/business-rows";
import {
    BUSINESS_TYPE_VALUES,
    businessTypeOf,
} from "@/lib/organizations/business-types";
import { kindOf, ORGANIZATION_KINDS } from "@/lib/organizations/kind";
import { addressProblems } from "@/lib/organizations/registered-address";
import type {
    OrganizationSettings,
    OrganizationSettingsInput,
} from "@/lib/organizations/settings-service";

/**
 * What Settings › Business's sheets hold and send: the one schema every
 * sheet checks its draft against (a rule that spans two rows, such as a
 * GST-registered business needing its registered address, holds whichever
 * sheet is open), the saved settings as a draft, and the patch a save
 * sends. Pure, so a sheet only draws fields.
 */

/** Allow an empty string (field left blank / cleared) or a valid value. */
const optionalText = (schema: z.ZodString) =>
    z.union([z.literal(""), schema]).optional();

export const formSchema = z
    .object({
        name: z.string().trim().min(1, { message: "Name is required" }),
        // What is being set up (DEC-070): words and defaults only.
        kind: z.enum(ORGANIZATION_KINDS),
        legalName: z.string().optional(),
        type: z.enum(BUSINESS_TYPE_VALUES).optional(),
        country: z.string().optional(),
        taxId: z.string().optional(),
        contactEmail: optionalText(z.string().email("Enter a valid email")),
        website: optionalText(z.string().url("Enter a valid URL")),
        // The public phone (DEC-053): E.164 once saved; the API judges it.
        phone: z.string().superRefine((v, ctx) => {
            const problem = phoneProblem(v);
            if (problem) ctx.addIssue({ code: "custom", message: problem });
        }),
        // An IANA zone, or "" for none; the API checks it's a real one.
        timezone: z.string(),
        // GST (ADR-008). The API checks the GSTIN's state and check
        // character; here only its shape.
        gstRegistered: z.boolean(),
        gstState: z.string(),
        invoicePrefix: z
            .string()
            .trim()
            .refine(
                (v) => v === "" || PREFIX_SHAPE.test(v.toUpperCase()),
                "One to three letters or digits, like RC.",
            ),
        deliveryRate: z.string(),
        deliverySac: z
            .string()
            .trim()
            .refine(
                (v) => v === "" || isHsnSac(v),
                "A SAC code is 4 to 8 digits.",
            ),
        // How invoice numbers are built (`invoice-number.ts`): the parts
        // list as one value, "PREFIX,FY,!YEAR,!MONTH", and the rest.
        numberParts: z.string(),
        numberSeparator: z.string(),
        numberDigits: z.string(),
        numberRestart: z.string(),
        // The registered address (CGST rule 46); its state is gstState.
        ...registeredAddressShape,
    })
    .superRefine((v, ctx) => {
        // Which part of the GSTIN is short or wrong, not just "15 characters".
        const gstin = v.gstRegistered ? gstinProblem(v.taxId ?? "") : null;
        if (gstin) {
            ctx.addIssue({ code: "custom", path: ["taxId"], message: gstin });
        }
        for (const { path, message } of addressProblems(v)) {
            ctx.addIssue({ code: "custom", path: [path], message });
        }
        // The number format's rules are not here: they apply only when the
        // save changes it, the prefix or the registration, which the schema
        // cannot see (`numberFormatProblemOnSave`, in the sheet).
    });

export type FormValues = z.infer<typeof formSchema>;
export type FormField = keyof FormValues;

const PROFILE_KEYS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
    "timezone",
    "phone",
] as const;

/** Where the API names a refused field, the form field it belongs on. */
export const FIELD_OF: Record<string, FormField> = {
    taxId: "taxId",
    gstState: "gstState",
    invoicePrefix: "invoicePrefix",
    deliveryRate: "deliveryRate",
    deliverySac: "deliverySac",
    invoiceNumberParts: "numberParts",
    invoiceNumberRestart: "numberRestart",
    invoiceNumberDigits: "numberDigits",
    addressLine1: "addressLine1",
    addressLine2: "addressLine2",
    city: "city",
    postalCode: "postalCode",
    name: "name",
    kind: "kind",
    timezone: "timezone",
    phone: "phone",
};

export const NUMBER_FIELDS = [
    "numberParts",
    "numberSeparator",
    "numberDigits",
    "numberRestart",
] as const;

const ADDRESS_FIELDS = [...ADDRESS_KEYS, "gstState", "country"] as const;

/**
 * The fields each sheet shows, which is where a refusal can be said on its
 * field; one on a field of another row is said in a toast instead. How to
 * pay us, Hours and the logo keep forms of their own.
 */
const SHEET_FIELDS: Partial<Record<BusinessSheet, readonly FormField[]>> = {
    kind: ["kind"],
    name: ["name"],
    legalName: ["legalName"],
    type: ["type"],
    timezone: ["timezone"],
    contactEmail: ["contactEmail"],
    phone: ["phone"],
    website: ["website"],
    gst: ["gstRegistered", "taxId"],
    taxId: ["taxId"],
    numbers: ["invoicePrefix", ...NUMBER_FIELDS],
    delivery: ["deliveryRate", "deliverySac"],
    address: ADDRESS_FIELDS,
};

/**
 * Whether `field` is on `sheet`. `withAddress`: the registration's sheet
 * has taken the address fields in, because turning GST on needs them.
 */
export function onSheet(
    sheet: BusinessSheet,
    field: string,
    withAddress: boolean,
): boolean {
    if ((SHEET_FIELDS[sheet] ?? []).some((f) => f === field)) return true;
    return (
        sheet === "gst" &&
        withAddress &&
        ADDRESS_FIELDS.some((f) => f === field)
    );
}

/** The row a field is edited from, named when its refusal is off screen. */
export function rowTitleOf(field: string): string {
    if (ADDRESS_FIELDS.some((f) => f === field)) return "Registered address";
    if (field === "taxId" || field === "gstRegistered") return "GST";
    if (["invoicePrefix", ...NUMBER_FIELDS].includes(field)) {
        return "Invoice numbers";
    }
    if (field === "deliveryRate" || field === "deliverySac") {
        return "GST on delivery";
    }
    return "Business details";
}

/** The format a business numbers by: its own, else its standing's default. */
function numberFormatOf(settings: OrganizationSettings) {
    const saved = settings.tax?.invoiceNumber;
    return saved
        ? {
              parts: saved.parts,
              separator: saved.separator,
              digits: saved.digits,
              restart: saved.restart,
          }
        : defaultNumberFormat(settings.tax?.registered ?? false);
}

export function valuesOf(settings: OrganizationSettings): FormValues {
    return {
        name: settings.name,
        kind: kindOf(settings.kind),
        legalName: settings.profile?.legalName ?? "",
        type: businessTypeOf(settings.profile?.type),
        country: settings.profile?.country ?? "",
        taxId: settings.profile?.taxId ?? "",
        contactEmail: settings.profile?.contactEmail ?? "",
        website: settings.profile?.website ?? "",
        phone: phoneLabel(settings.profile?.phone),
        timezone: settings.profile?.timezone ?? "",
        gstRegistered: settings.tax?.registered ?? false,
        gstState: settings.tax?.state ?? "",
        invoicePrefix: settings.tax?.invoicePrefix ?? "",
        deliveryRate: settings.tax?.deliveryRate ?? "18",
        deliverySac: settings.tax?.deliverySac ?? "",
        ...formatFields(numberFormatOf(settings)),
        addressLine1: settings.registeredAddress?.line1 ?? "",
        addressLine2: settings.registeredAddress?.line2 ?? "",
        city: settings.registeredAddress?.city ?? "",
        postalCode: settings.registeredAddress?.postalCode ?? "",
    };
}

const stateName = (code: string) =>
    GST_STATES.find((s) => s.value === code)?.label ?? "";

/**
 * The state a GST invoice names: the GSTIN's (the API takes no other for a
 * registered business), else the one stored.
 */
export function gstStateOf(v: Pick<FormValues, "gstState" | "taxId">): {
    name: string;
    fromGstin: boolean;
} {
    const fromId = stateName((v.taxId ?? "").trim().slice(0, 2).toUpperCase());
    if (fromId) return { name: fromId, fromGstin: true };
    return { name: stateName(v.gstState), fromGstin: false };
}

/** A business's state as printed: none for an address outside India. */
export function indianState(
    v: Pick<FormValues, "gstState" | "country">,
): string {
    return ["", "IN"].includes(v.country ?? "") ? stateName(v.gstState) : "";
}

export function addressText(v: FormValues): string {
    // As the API prints it: no first line, no address.
    if (!v.addressLine1.trim()) return "";
    return [
        v.addressLine1,
        v.addressLine2,
        [v.city, v.postalCode].filter((x) => x.trim()).join(" "),
        v.gstRegistered ? gstStateOf(v).name : indianState(v),
    ]
        .map((x) => x.trim())
        .filter((x) => x !== "")
        .join("\n");
}

/**
 * What a save sends: only the fields the draft changed. Empty strings are
 * SENT rather than dropped: a cleared field means "remove this value".
 */
export function settingsPatch(
    values: FormValues,
    dirty: Readonly<Partial<Record<FormField, unknown>>>,
): OrganizationSettingsInput {
    const profile: Record<string, string> = Object.fromEntries(
        PROFILE_KEYS.filter((key) => dirty[key]).map((key) => [
            key,
            values[key]?.trim() ?? "",
        ]),
    );
    const tax: NonNullable<OrganizationSettingsInput["tax"]> = {
        ...(dirty.gstRegistered ? { registered: values.gstRegistered } : {}),
        ...(dirty.gstState ? { state: values.gstState } : {}),
        ...(dirty.invoicePrefix
            ? { invoicePrefix: values.invoicePrefix.trim().toUpperCase() }
            : {}),
        ...(dirty.deliveryRate ? { deliveryRate: values.deliveryRate } : {}),
        ...(dirty.deliverySac
            ? { deliverySac: values.deliverySac.trim() }
            : {}),
        // The format goes whole, and only when it was touched: one never
        // chosen keeps following the registration (the API's default).
        ...(NUMBER_FIELDS.some((key) => dirty[key])
            ? { invoiceNumber: formatOf(values) }
            : {}),
    };
    const registeredAddress = Object.fromEntries(
        ADDRESS_KEYS.filter((key) => dirty[key]).map((key) => [
            ADDRESS_API_KEY[key],
            values[key].trim(),
        ]),
    );
    // Turning registration on checks the GSTIN, so send it with it.
    if (values.gstRegistered && dirty.gstRegistered) {
        profile.taxId = values.taxId?.trim().toUpperCase() ?? "";
    }
    // A registered business's state and country are its GSTIN's; a state
    // picked before is replaced, so the API doesn't refuse the pair.
    if (values.gstRegistered && (dirty.gstRegistered || dirty.taxId)) {
        tax.state = (values.taxId ?? "").trim().slice(0, 2).toUpperCase();
        if (values.country !== "IN") profile.country = "IN";
    }
    // Another country's address has no Indian state.
    if (dirty.country && !["", "IN"].includes(values.country ?? "")) {
        tax.state = "";
    }

    return {
        ...(dirty.name ? { name: values.name.trim() } : {}),
        ...(dirty.kind ? { kind: values.kind } : {}),
        ...(Object.keys(profile).length > 0 ? { profile } : {}),
        ...(Object.keys(tax).length > 0 ? { tax } : {}),
        ...(Object.keys(registeredAddress).length > 0
            ? { registeredAddress }
            : {}),
    };
}

/**
 * The next invoice's number in a set of values: the count carries on from
 * where the saved prefix's series stand.
 */
export function nextNumberOf(
    x: FormValues,
    settings: OrganizationSettings,
): string {
    return nextInvoiceNumber(formatOf(x), {
        prefix: prefixOf(x.invoicePrefix),
        last: settings.tax?.invoiceNumber?.counters,
        samePrefix:
            prefixOf(x.invoicePrefix) ===
            prefixOf(settings.tax?.invoicePrefix ?? ""),
        // Dated in the zone on screen, so a zone being tried shows.
        timezone: x.timezone || null,
    });
}

/** What "How it prints" draws for a set of values, saved or being typed. */
export function printOf(x: FormValues, settings: OrganizationSettings) {
    const legal = x.legalName?.trim() ?? "";
    return {
        logoUrl: settings.logo?.url ?? null,
        registered: x.gstRegistered,
        number: nextNumberOf(x, settings),
        legalName: legal || x.name,
        tradingAs: legal && legal !== x.name ? x.name : null,
        address: addressText(x),
        gstin: x.taxId ?? "",
        stateName: x.gstRegistered ? gstStateOf(x).name : indianState(x),
        contact: [x.contactEmail, x.website]
            .filter((c) => c?.trim())
            .join(" · "),
        deliverySac: x.deliverySac,
        deliveryRate: rateOption(x.deliveryRate) || "18",
    };
}
