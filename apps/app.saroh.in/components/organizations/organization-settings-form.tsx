"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { showError, showInfo, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
    BusinessHoursSection,
    HOURS_SECTION,
} from "@/components/organizations/business-hours-section";
import { BusinessLogoRow } from "@/components/organizations/business-logo-row";
import { BusinessPrintPreview } from "@/components/organizations/business-print-preview";
import type { BusinessRow } from "@/components/organizations/business-section";
import { BusinessSection } from "@/components/organizations/business-section";
import { GstinGuide } from "@/components/organizations/gstin-guide";
import { InvoiceNumberFields } from "@/components/organizations/invoice-number-fields";
import {
    ADDRESS_API_KEY,
    ADDRESS_KEYS,
    registeredAddressShape,
} from "@/components/organizations/registered-address-shape";
import { TimeZoneSelect } from "@/components/organizations/time-zone-select";
import {
    LeaveDialog,
    useLeaveGuard,
} from "@/components/organizations/use-leave-guard";
import { countryName, CountrySelect } from "@/components/shared/country-select";
import { OptionSelect } from "@/components/shared/option-select";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import {
    GST_RATE_OPTIONS,
    GST_STATES,
    isHsnSac,
    PREFIX_SHAPE,
    rateOption,
} from "@/lib/invoices/gst";
import { GSTIN_EXAMPLE, gstinProblem } from "@/lib/invoices/gstin";
import {
    defaultNumberFormat,
    formatFields,
    formatOf,
    nextInvoiceNumber,
    numberFormatProblem,
    prefixOf,
    RESTART_LABEL,
} from "@/lib/invoices/invoice-number";
import { addressProblems } from "@/lib/organizations/registered-address";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import { browserZone, zoneLabel } from "@/lib/organizations/time-zones";
import { BUSINESS_TAB_PARAM } from "@/lib/settings/search";
import type { StorefrontHoursRead } from "@/lib/stores/storefronts";

/** Allow an empty string (field left blank / cleared) or a valid value. */
const optionalText = (schema: z.ZodString) =>
    z.union([z.literal(""), schema]).optional();

const formSchema = z
    .object({
        name: z.string().trim().min(1, { message: "Name is required" }),
        legalName: z.string().optional(),
        type: z.enum(["", "individual", "company"]).optional(),
        country: z.string().optional(),
        taxId: z.string().optional(),
        contactEmail: optionalText(z.string().email("Enter a valid email")),
        website: optionalText(z.string().url("Enter a valid URL")),
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
        // The API's rules for the number format, said before Save.
        const problem = numberFormatProblem(formatOf(v), {
            registered: v.gstRegistered,
            prefix: prefixOf(v.invoicePrefix),
        });
        if (problem) {
            ctx.addIssue({
                code: "custom",
                path: [problem.field],
                message: problem.message,
            });
        }
    });

type FormValues = z.infer<typeof formSchema>;

const PROFILE_KEYS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
    "timezone",
] as const;

/** Where the API names a refused field, the form field it belongs on. */
const FIELD_OF: Record<string, keyof FormValues> = {
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
    timezone: "timezone",
};

/** Delivery always carries a rate: no "Not set" row. */
const DELIVERY_RATES = GST_RATE_OPTIONS.filter((o) => o.value !== "");

/** The same vocabulary the API validates (`BUSINESS_TYPES`). */
const TYPES = [
    { value: "", label: "Not set" },
    { value: "individual", label: "Individual" },
    { value: "company", label: "Company" },
] as const;

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

function valuesOf(settings: OrganizationSettings): FormValues {
    const type = settings.profile?.type;
    return {
        name: settings.name,
        legalName: settings.profile?.legalName ?? "",
        type: type === "individual" || type === "company" ? type : "",
        country: settings.profile?.country ?? "",
        taxId: settings.profile?.taxId ?? "",
        contactEmail: settings.profile?.contactEmail ?? "",
        website: settings.profile?.website ?? "",
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

/**
 * The four cards this form saves ("Saroh Settings" design), in the order a
 * customer's invoice reads: who the business is, how to reach it, how it is
 * taxed and numbered, where it is registered. Hours sit between the last
 * two as a tab, but save to the storefronts (`business-hours-section.tsx`).
 */
const SECTIONS = {
    identity: {
        title: "Identity",
        lead: "How the business is named and registered",
        fields: ["name", "legalName", "type", "timezone"],
    },
    contact: {
        title: "Contact",
        lead: "How customers reach you",
        fields: ["contactEmail", "website"],
    },
    tax: {
        title: "Tax and invoices",
        lead: "What every invoice carries",
        fields: [
            "gstRegistered",
            "taxId",
            "invoicePrefix",
            "numberParts",
            "numberSeparator",
            "numberDigits",
            "numberRestart",
            "deliveryRate",
            "deliverySac",
        ],
    },
    address: {
        title: "Address",
        lead: "Printed under your legal name",
        fields: [
            "addressLine1",
            "addressLine2",
            "city",
            "postalCode",
            "gstState",
            "country",
        ],
    },
} as const satisfies Record<
    string,
    { title: string; lead: string; fields: readonly (keyof FormValues)[] }
>;
type SectionKey = keyof typeof SECTIONS;
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

/** The tabs, in the design's order. */
type TabKey = SectionKey | "hours";
const TAB_KEYS: TabKey[] = ["identity", "contact", "tax", "hours", "address"];
const titleOf = (key: TabKey) =>
    key === "hours" ? HOURS_SECTION.title : SECTIONS[key].title;

const sectionOf = (field: string): SectionKey =>
    SECTION_KEYS.find((key) =>
        (SECTIONS[key].fields as readonly string[]).includes(field),
    ) ?? "identity";

/**
 * India's financial year, which invoices are numbered by (`numbering.ts`).
 * GST law fixes it at April to March for every business, so it is said
 * here rather than offered.
 */
const FINANCIAL_YEAR_ROW: BusinessRow = {
    label: "Financial year",
    value: "April – March",
    tag: "Set by GST law",
};

const NUMBER_FIELDS = [
    "numberParts",
    "numberSeparator",
    "numberDigits",
    "numberRestart",
] as const;

const stateName = (code: string) =>
    GST_STATES.find((s) => s.value === code)?.label ?? "";

/**
 * The state a GST invoice names: the GSTIN's (the API takes no other for a
 * registered business), else the one stored.
 */
function gstStateOf(v: Pick<FormValues, "gstState" | "taxId">): {
    name: string;
    fromGstin: boolean;
} {
    const fromId = stateName((v.taxId ?? "").trim().slice(0, 2).toUpperCase());
    if (fromId) return { name: fromId, fromGstin: true };
    return { name: stateName(v.gstState), fromGstin: false };
}

/** A business's state as printed: none for an address outside India. */
function indianState(v: Pick<FormValues, "gstState" | "country">): string {
    return ["", "IN"].includes(v.country ?? "") ? stateName(v.gstState) : "";
}

function addressText(v: FormValues): string {
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
 * Workspace → Business, as the "Saroh Settings" design draws it: four tabs,
 * each one card that reads first and is edited on its own, beside a preview
 * of how an invoice prints.
 *
 * One section is edited at a time: Edit opens its fields, Save sends only
 * what changed in it, Cancel puts it back. Starting another section with an
 * edit unsaved is refused and the open one brought forward — nothing is lost
 * by a stray click. A rule that spans two sections (a GST-registered business
 * needs a registered address) is said in words when the field it names is
 * not on screen.
 *
 * Type and country are pickers, not text: the API accepts only "individual"
 * or "company" and a two-letter country code. Empty strings are SENT rather
 * than dropped: a cleared field means "remove this value".
 */
export function OrganizationSettingsForm({
    settings: initial,
    canEdit,
    hours,
    canEditHours,
}: {
    settings: OrganizationSettings;
    canEdit: boolean;
    /** The storefronts' opening hours, for the Hours tab. */
    hours: StorefrontHoursRead;
    /** May change the storefronts, which is where hours are kept. */
    canEditHours: boolean;
}) {
    const router = useRouter();
    // What the API last said, so the cards read the saved values at once
    // rather than waiting for the page to be fetched again.
    const [settings, setSettings] = useState(initial);
    const savedZone = settings.profile?.timezone ?? "";
    // In the address, so Search settings can open the tab a setting is on.
    const [tab, setTab] = useTabParam(BUSINESS_TAB_PARAM, TAB_KEYS, "identity");
    const [editing, setEditing] = useState<TabKey | null>(null);
    // The Hours card keeps its own form; whether it has changes, from it.
    const [hoursDirty, setHoursDirty] = useState(false);
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: valuesOf(initial),
        mode: "onChange",
    });
    const { isSubmitting, dirtyFields, isDirty, errors } = form.formState;
    // The form holds the saved values while nothing is being edited, so the
    // preview reads it either way.
    const v = useWatch({ control: form.control }) as FormValues;
    const registered = v.gstRegistered;
    // The form re-checks only the field that changed, and a rule that spans
    // fields (a GSTIN or address a registration needs) can leave a refusal
    // standing, and Save off, after everything is filled in. While any
    // refusal shows, each change (and its first showing) re-checks the lot.
    const showing = Object.keys(errors).length > 0;
    const watched = JSON.stringify(v);
    useEffect(() => {
        if (showing) void form.trigger();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per change of the values (or a refusal appearing), not per render
    }, [watched, showing]);
    // Whether the open card has changes, whichever form holds it.
    const editDirty = editing === "hours" ? hoursDirty : isDirty;
    // An open edit with changes holds the way off this page.
    const { leaveTo, stay } = useLeaveGuard(editing !== null && editDirty);
    // The number-format rules span four fields (and the prefix and GST
    // switch), but the form re-checks only the field that changed, so the
    // rule is worked out here from what is on screen: a part ticked in shows
    // the 16-character problem and turns Save off at once.
    const numberProblem =
        editing === "tax"
            ? numberFormatProblem(formatOf(v), {
                  registered: v.gstRegistered,
                  prefix: prefixOf(v.invoicePrefix),
              })
            : null;
    // Turning GST on needs a registered address, which lives on another
    // tab. When the saved one is short, its fields join the Tax card, so
    // one Save covers both rather than neither card being able to.
    const addressInTax =
        editing === "tax" &&
        v.gstRegistered &&
        addressProblems({ ...valuesOf(settings), gstRegistered: true }).length >
            0;
    /** Whether a field is on the card being edited. */
    const onCard = (field: string) =>
        sectionOf(field) === editing ||
        (addressInTax && (ADDRESS_KEYS as readonly string[]).includes(field));

    const startEditing = (key: TabKey) => {
        if (editing && editing !== key && editDirty) {
            showInfo(`Finish or cancel your edit in ${titleOf(editing)} first`);
            setTab(editing);
            return;
        }
        form.reset(valuesOf(settings));
        // No zone saved: the browser's is offered, as a change to save.
        const fromBrowser = key === "identity" && !savedZone && browserZone();
        if (fromBrowser) {
            form.setValue("timezone", fromBrowser, { shouldDirty: true });
        }
        setEditing(key);
        setTab(key);
    };
    const cancel = () => {
        form.reset(valuesOf(settings));
        setEditing(null);
    };

    /** A refusal on a field of another section is said, since it is hidden. */
    function onInvalid(problems: FieldErrors<FormValues>) {
        const first = Object.entries(problems).find(
            ([field]) => !onCard(field),
        );
        if (first) {
            showError(
                `${SECTIONS[sectionOf(first[0])].title}: ${first[1].message ?? "needs attention"}`,
            );
        }
    }

    async function onSubmit(values: FormValues) {
        // Hours save through their own card's form.
        if (!editing || editing === "hours") return;
        const profile = Object.fromEntries(
            PROFILE_KEYS.filter((key) => dirtyFields[key]).map((key) => [
                key,
                values[key]?.trim() ?? "",
            ]),
        );
        const tax = {
            ...(dirtyFields.gstRegistered
                ? { registered: values.gstRegistered }
                : {}),
            ...(dirtyFields.gstState ? { state: values.gstState } : {}),
            ...(dirtyFields.invoicePrefix
                ? { invoicePrefix: values.invoicePrefix.trim().toUpperCase() }
                : {}),
            ...(dirtyFields.deliveryRate
                ? { deliveryRate: values.deliveryRate }
                : {}),
            ...(dirtyFields.deliverySac
                ? { deliverySac: values.deliverySac.trim() }
                : {}),
            // The format goes whole, and only when it was touched: one never
            // chosen keeps following the registration (the API's default).
            ...(NUMBER_FIELDS.some((key) => dirtyFields[key])
                ? { invoiceNumber: formatOf(values) }
                : {}),
        };
        const registeredAddress = Object.fromEntries(
            ADDRESS_KEYS.filter((key) => dirtyFields[key]).map((key) => [
                ADDRESS_API_KEY[key],
                values[key].trim(),
            ]),
        );
        // Turning registration on checks the GSTIN, so send it with it.
        if (values.gstRegistered && dirtyFields.gstRegistered) {
            profile.taxId = values.taxId?.trim().toUpperCase() ?? "";
        }
        // A registered business's state and country are its GSTIN's; a
        // state picked before is replaced, so the API doesn't refuse the pair.
        if (
            values.gstRegistered &&
            (dirtyFields.gstRegistered || dirtyFields.taxId)
        ) {
            tax.state = (values.taxId ?? "").trim().slice(0, 2).toUpperCase();
            if (values.country !== "IN") profile.country = "IN";
        }
        // Another country's address has no Indian state.
        if (dirtyFields.country && !["", "IN"].includes(values.country ?? "")) {
            tax.state = "";
        }

        const result = await saveOrganizationSettings({
            ...(dirtyFields.name ? { name: values.name.trim() } : {}),
            ...(Object.keys(profile).length > 0 ? { profile } : {}),
            ...(Object.keys(tax).length > 0 ? { tax } : {}),
            ...(Object.keys(registeredAddress).length > 0
                ? { registeredAddress }
                : {}),
        });

        if (!result.ok) {
            const field = result.field ? FIELD_OF[result.field] : undefined;
            if (field && onCard(field)) {
                form.setError(field, { message: result.error });
            } else showError(result.error);
            return;
        }

        const title = SECTIONS[editing].title;
        showSuccess(
            editing === "contact"
                ? `${title} saved`
                : `${title} saved — invoices from now on use it`,
        );
        setSettings(result.data);
        form.reset(valuesOf(result.data));
        setEditing(null);
        // The header switcher renders the name — refresh so a rename shows.
        router.refresh();
    }

    const saved = valuesOf(settings);
    const tradingSince = settings.tradingSince
        ? new Date(settings.tradingSince).getUTCFullYear().toString()
        : "";
    // The next invoice's number in a set of values: the count carries on
    // from where the saved prefix's series stand.
    const number = (x: FormValues) =>
        nextInvoiceNumber(formatOf(x), {
            prefix: prefixOf(x.invoicePrefix),
            last: settings.tax?.invoiceNumber?.counters,
            samePrefix:
                prefixOf(x.invoicePrefix) === prefixOf(saved.invoicePrefix),
            // Dated in the zone on screen, so a zone being tried shows.
            timezone: x.timezone || null,
        });
    const savedState = gstStateOf(saved);
    const restartsRow: BusinessRow = {
        label: "Restarts",
        value: RESTART_LABEL[formatOf(saved).restart],
    };

    /**
     * A business that never chose a format numbers by its standing's
     * default, so turning registration on or off in the form moves the
     * untouched format with it — as the API will.
     */
    const followRegistration = (on: boolean) => {
        if (settings.tax?.invoiceNumber?.custom) return;
        if (NUMBER_FIELDS.some((key) => dirtyFields[key])) return;
        const fields = formatFields(defaultNumberFormat(on));
        for (const key of NUMBER_FIELDS) {
            form.setValue(key, fields[key], { shouldDirty: false });
        }
        // Checked together once all four are in: one at a time, the first
        // would be judged against the other three's old values.
        void form.trigger(NUMBER_FIELDS);
    };

    const rows: Record<SectionKey, BusinessRow[]> = {
        identity: [
            { label: "Business name", value: saved.name },
            {
                label: "Legal name",
                value: saved.legalName ?? "",
                empty: "Same as the business name",
            },
            {
                label: "Type",
                value:
                    TYPES.find((t) => t.value && t.value === saved.type)
                        ?.label ?? "",
            },
            {
                label: "Time zone",
                value: saved.timezone ? zoneLabel(saved.timezone) : "",
                empty: "Not set — invoice numbers use India time",
            },
            {
                label: "Trading since",
                value: tradingSince,
                empty: "No orders yet",
                mono: true,
                tag: "From your first order",
            },
            {
                label: "Workspace address",
                value: settings.slug,
                mono: true,
                tag: "Can't be changed",
            },
        ],
        contact: [
            { label: "Contact email", value: saved.contactEmail ?? "" },
            {
                label: "Website",
                value: saved.website ?? "",
                empty: "None outside Saroh",
            },
        ],
        tax: saved.gstRegistered
            ? [
                  { label: "GST", value: "Registered" },
                  { label: "GSTIN", value: saved.taxId ?? "", mono: true },
                  {
                      label: "State",
                      value: savedState.name
                          ? `${savedState.name}${savedState.fromGstin ? " · from the GSTIN" : ""}`
                          : "",
                  },
                  FINANCIAL_YEAR_ROW,
                  {
                      label: "Invoice numbers",
                      value: number(saved),
                      mono: true,
                  },
                  restartsRow,
                  {
                      label: "GST on delivery",
                      value: `${rateOption(saved.deliveryRate) || "18"}%`,
                  },
                  {
                      label: "Delivery SAC",
                      value: saved.deliverySac,
                      mono: true,
                  },
              ]
            : [
                  { label: "GST", value: "Not registered" },
                  {
                      label: "Tax ID",
                      value: saved.taxId ?? "",
                      empty: "None",
                      mono: true,
                  },
                  FINANCIAL_YEAR_ROW,
                  {
                      label: "Invoice numbers",
                      value: number(saved),
                      mono: true,
                  },
                  restartsRow,
              ],
        address: [
            {
                label: "Address",
                value: addressText(saved),
                empty: "No registered address yet",
            },
            {
                label: "Country",
                value: saved.country ? countryName(saved.country) : "",
            },
        ],
    };
    const notes: Partial<Record<SectionKey, string>> = {
        identity:
            "Invoices are issued in the legal name, if you've set one. Your links keep working if you rename the business.",
        address:
            "Printed under your legal name on every invoice and receipt. Invoices already issued keep the address they went out with.",
    };

    // Why Save is off, in the footer's words.
    const sectionErrors =
        (editing ? Object.keys(errors).filter(onCard).length : 0) +
        // The live number-format problem, until Save puts it on a field.
        (numberProblem && !NUMBER_FIELDS.some((key) => errors[key]) ? 1 : 0);
    const saveWhy = !isDirty
        ? "No changes yet"
        : sectionErrors === 1
          ? "1 thing to fix"
          : sectionErrors > 1
            ? `${sectionErrors} things to fix`
            : "";

    const liveState = registered
        ? gstStateOf(v)
        : { name: indianState(v), fromGstin: false };
    const tabIndex = TAB_KEYS.indexOf(tab);
    const onTabKeys = (e: React.KeyboardEvent) => {
        const n = TAB_KEYS.length;
        const next =
            e.key === "ArrowRight"
                ? (tabIndex + 1) % n
                : e.key === "ArrowLeft"
                  ? (tabIndex - 1 + n) % n
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? n - 1
                      : null;
        if (next === null) return;
        e.preventDefault();
        setTab(TAB_KEYS[next]);
        document.getElementById(`business-tab-${TAB_KEYS[next]}`)?.focus();
    };

    /** One field's wrapper, at the width the design gives it. */
    const at = (basis: string, grow = true) => ({
        className: cn(
            "min-w-0",
            grow ? "flex-[1_1_var(--b)]" : "flex-[0_1_var(--b)]",
        ),
        style: { "--b": basis } as React.CSSProperties,
    });

    // States are India's (GST's list); another country's address has none.
    const inIndia = registered || ["", "IN"].includes(v.country ?? "");
    const addressFields = (
        <>
            {(
                [
                    [
                        "addressLine1",
                        "Address line 1",
                        "100%",
                        true,
                        "address-line1",
                    ],
                    [
                        "addressLine2",
                        "Address line 2 (optional)",
                        "100%",
                        true,
                        "address-line2",
                    ],
                    ["city", "City", "240px", true, "address-level2"],
                    ["postalCode", "PIN code", "140px", false, "postal-code"],
                ] as const
            ).map(([name, label, basis, grow, auto]) => (
                <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                        <FormItem {...at(basis, grow)}>
                            <FormLabel>{label}</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    maxLength={name === "postalCode" ? 12 : 120}
                                    inputMode={
                                        name === "postalCode"
                                            ? "numeric"
                                            : undefined
                                    }
                                    autoComplete={auto}
                                    className={cn(
                                        name === "postalCode" && "font-mono",
                                    )}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ))}
            {inIndia ? (
                <FormField
                    control={form.control}
                    name="gstState"
                    render={({ field }) => (
                        <FormItem {...at("240px")}>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    // A registered business's state is its
                                    // GSTIN's: the API takes no other.
                                    value={
                                        registered
                                            ? (v.taxId ?? "")
                                                  .trim()
                                                  .slice(0, 2)
                                                  .toUpperCase()
                                            : field.value
                                    }
                                    onValueChange={field.onChange}
                                    options={[
                                        { value: "", label: "Choose a state" },
                                        ...GST_STATES,
                                    ]}
                                    disabled={registered}
                                    className="w-full"
                                />
                            </FormControl>
                            <FormDescription>
                                {registered
                                    ? "Set by your GSTIN."
                                    : "Printed with the address."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}
            <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                    <FormItem {...at("220px")}>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                            <CountrySelect
                                value={registered ? "IN" : (field.value ?? "")}
                                onValueChange={field.onChange}
                                disabled={registered}
                            />
                        </FormControl>
                        <FormDescription>
                            {registered
                                ? "GST registration is Indian."
                                : "Where the business is registered."}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </>
    );

    const fieldsOf: Record<SectionKey, React.ReactNode> = {
        identity: (
            <>
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Business name</FormLabel>
                            <FormControl>
                                <Input {...field} maxLength={120} />
                            </FormControl>
                            <FormDescription>
                                Shown to customers on receipts and in the
                                switcher above.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="legalName"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Legal name</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Same as the business name"
                                />
                            </FormControl>
                            <FormDescription>
                                The registered name, if it differs from the one
                                above.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                        <FormItem {...at("220px")}>
                            <FormLabel>Type</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    value={field.value ?? ""}
                                    onValueChange={field.onChange}
                                    options={TYPES}
                                    className="w-full"
                                />
                            </FormControl>
                            <FormDescription>
                                An individual trades in their own name; a
                                company is registered as one.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Time zone</FormLabel>
                            <FormControl>
                                <TimeZoneSelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                />
                            </FormControl>
                            <FormDescription>
                                Invoice numbers, bookings and the calendar use
                                this time.
                                {!savedZone &&
                                field.value &&
                                field.value === browserZone()
                                    ? " From your browser — change it if the business runs elsewhere."
                                    : ""}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </>
        ),
        contact: (
            <>
                <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Contact email</FormLabel>
                            <FormControl>
                                <Input {...field} type="email" />
                            </FormControl>
                            <FormDescription>
                                Where customers can reach the business.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>Website</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    type="url"
                                    placeholder="https://example.in"
                                />
                            </FormControl>
                            <FormDescription>
                                A site the business has outside Saroh, if any.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </>
        ),
        tax: (
            <>
                <FormField
                    control={form.control}
                    name="gstRegistered"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <div className="flex items-center gap-3">
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={(on) => {
                                            field.onChange(on);
                                            followRegistration(on);
                                        }}
                                        aria-label="GST-registered"
                                    />
                                </FormControl>
                                <FormLabel className="!mt-0">
                                    GST-registered
                                </FormLabel>
                            </div>
                            <FormDescription>
                                {field.value
                                    ? "Orders and invoices become tax invoices with your GSTIN, split into CGST + SGST or IGST. Prices include GST."
                                    : "Orders and invoices are receipts, with no GST on them."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="taxId"
                    render={({ field }) => (
                        <FormItem {...at("100%")}>
                            <FormLabel>
                                {registered ? "GSTIN" : "Tax ID (optional)"}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    onChange={(e) =>
                                        field.onChange(
                                            e.target.value.toUpperCase(),
                                        )
                                    }
                                    placeholder={
                                        registered ? GSTIN_EXAMPLE : undefined
                                    }
                                    maxLength={registered ? 20 : undefined}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="font-mono tracking-[0.04em]"
                                />
                            </FormControl>
                            {registered ? (
                                <GstinGuide value={field.value ?? ""} />
                            ) : null}
                            <FormDescription>
                                {registered
                                    ? "15 characters: your state's code, your PAN, the entity number, Z, and a check character. The state code sets your state."
                                    : "Any VAT or tax registration number."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="invoicePrefix"
                    render={({ field }) => (
                        <FormItem {...at("140px", false)}>
                            <FormLabel>Invoice prefix</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    maxLength={3}
                                    placeholder="RC"
                                    className="font-mono uppercase"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <InvoiceNumberFields
                    format={formatOf(v)}
                    prefix={prefixOf(v.invoicePrefix)}
                    registered={registered}
                    next={number(v)}
                    problem={numberProblem?.message ?? null}
                    at={at}
                />
                {registered ? (
                    <>
                        <FormField
                            control={form.control}
                            name="deliveryRate"
                            render={({ field }) => (
                                <FormItem {...at("160px", false)}>
                                    <FormLabel>GST on delivery</FormLabel>
                                    <FormControl>
                                        <OptionSelect
                                            value={
                                                rateOption(field.value) || "18"
                                            }
                                            onValueChange={field.onChange}
                                            options={DELIVERY_RATES}
                                            className="w-full"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="deliverySac"
                            render={({ field }) => (
                                <FormItem {...at("160px", false)}>
                                    <FormLabel>Delivery SAC</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            inputMode="numeric"
                                            maxLength={8}
                                            placeholder="996813"
                                            className="font-mono"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                ) : null}
                {addressInTax ? (
                    <>
                        <p className="mt-2 basis-full border-t border-border pt-3 text-[13px] font-medium">
                            Registered address
                            <span className="ml-2 font-normal text-muted-foreground">
                                A tax invoice prints it
                            </span>
                        </p>
                        {addressFields}
                    </>
                ) : null}
                <p className="basis-full text-[11.5px] leading-normal text-muted-foreground">
                    {registered
                        ? "Delivery is its own line on an invoice, printed with its SAC. "
                        : ""}
                    Invoices already numbered keep their numbers; a new format
                    starts with the next one, and the count carries on. The
                    financial year runs April – March, as GST law sets it.
                </p>
            </>
        ),
        address: addressFields,
    };

    return (
        <Form {...form}>
            <div
                role="tablist"
                aria-label="Business details"
                onKeyDown={onTabKeys}
                // One line however narrow: the strip scrolls sideways, with
                // no scrollbar drawn, rather than wrapping under itself.
                className="-mt-1.5 mb-[18px] flex flex-nowrap gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {TAB_KEYS.map((key) => {
                    const on = key === tab;
                    return (
                        <button
                            key={key}
                            id={`business-tab-${key}`}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls={
                                key === "hours"
                                    ? "business-hours-panel"
                                    : "business-panel"
                            }
                            tabIndex={on ? 0 : -1}
                            onClick={() => setTab(key)}
                            className={cn(
                                "flex shrink-0 items-center gap-[7px] whitespace-nowrap px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {titleOf(key)}
                            {editing === key && !on ? (
                                <span
                                    aria-label="Editing"
                                    className="size-1.5 rounded-full bg-highlight"
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-start gap-5">
                {tab === "hours" ? null : (
                    <form
                        id="business-panel"
                        role="tabpanel"
                        aria-labelledby={`business-tab-${tab}`}
                        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                        className="grid min-w-0 flex-[1_1_460px] gap-4"
                    >
                        <BusinessSection
                            title={SECTIONS[tab].title}
                            lead={SECTIONS[tab].lead}
                            rows={rows[tab]}
                            note={notes[tab]}
                            editing={editing === tab}
                            canEdit={canEdit}
                            onEdit={() => startEditing(tab)}
                            onCancel={cancel}
                            saveOff={!isDirty || sectionErrors > 0}
                            saving={isSubmitting}
                            saveWhy={saveWhy}
                            top={
                                tab === "identity" ? (
                                    <BusinessLogoRow
                                        logoUrl={settings.logo?.url ?? null}
                                        name={settings.name}
                                        canEdit={canEdit}
                                        onSaved={setSettings}
                                    />
                                ) : undefined
                            }
                        >
                            {fieldsOf[tab]}
                        </BusinessSection>
                    </form>
                )}
                {/* Mounted on every tab, so an unsaved week survives a look
                    elsewhere, as the other cards' fields do. */}
                <BusinessHoursSection
                    hours={hours}
                    hidden={tab !== "hours"}
                    editing={editing === "hours"}
                    canEdit={canEdit && canEditHours}
                    onEdit={() => startEditing("hours")}
                    onDone={() => setEditing(null)}
                    onDirty={setHoursDirty}
                />

                <BusinessPrintPreview
                    live={editing !== null && editing !== "hours" && isDirty}
                    logoUrl={settings.logo?.url ?? null}
                    registered={registered}
                    number={number(v)}
                    legalName={
                        v.legalName?.trim() ? v.legalName.trim() : v.name
                    }
                    tradingAs={
                        v.legalName?.trim() && v.legalName.trim() !== v.name
                            ? v.name
                            : null
                    }
                    address={addressText(v)}
                    gstin={v.taxId ?? ""}
                    stateName={liveState.name}
                    contact={[v.contactEmail, v.website]
                        .filter((x) => x?.trim())
                        .join(" · ")}
                    deliverySac={v.deliverySac}
                    deliveryRate={rateOption(v.deliveryRate) || "18"}
                />
            </div>
            <LeaveDialog
                to={leaveTo}
                section={editing ? titleOf(editing) : "Business"}
                onKeep={() => {
                    stay();
                    if (editing) setTab(editing);
                }}
                onDiscard={() => {
                    stay();
                    cancel();
                }}
            />
        </Form>
    );
}
