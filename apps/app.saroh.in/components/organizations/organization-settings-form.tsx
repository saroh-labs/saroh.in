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
import { useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { BusinessPrintPreview } from "@/components/organizations/business-print-preview";
import type { BusinessRow } from "@/components/organizations/business-section";
import { BusinessSection } from "@/components/organizations/business-section";
import {
    ADDRESS_API_KEY,
    ADDRESS_KEYS,
    registeredAddressShape,
} from "@/components/organizations/registered-address-fields";
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
    GSTIN_SHAPE,
    isHsnSac,
    PREFIX_SHAPE,
    rateOption,
} from "@/lib/invoices/gst";
import { sampleInvoiceNumber } from "@/lib/invoices/invoice-number";
import { addressProblems } from "@/lib/organizations/registered-address";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import { BUSINESS_TAB_PARAM } from "@/lib/settings/search";

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
        // The registered address (CGST rule 46); its state is gstState.
        ...registeredAddressShape,
    })
    .refine(
        (v) =>
            !v.gstRegistered ||
            GSTIN_SHAPE.test((v.taxId ?? "").trim().toUpperCase()),
        {
            path: ["taxId"],
            message:
                "A GST-registered business puts its 15-character GSTIN here.",
        },
    )
    .superRefine((v, ctx) => {
        for (const { path, message } of addressProblems(v)) {
            ctx.addIssue({ code: "custom", path: [path], message });
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
] as const;

/** Where the API names a refused field, the form field it belongs on. */
const FIELD_OF: Record<string, keyof FormValues> = {
    taxId: "taxId",
    gstState: "gstState",
    invoicePrefix: "invoicePrefix",
    deliveryRate: "deliveryRate",
    deliverySac: "deliverySac",
    addressLine1: "addressLine1",
    addressLine2: "addressLine2",
    city: "city",
    postalCode: "postalCode",
    name: "name",
    timezone: "name",
};

/** Delivery always carries a rate: no "Not set" row. */
const DELIVERY_RATES = GST_RATE_OPTIONS.filter((o) => o.value !== "");

/** The same vocabulary the API validates (`BUSINESS_TYPES`). */
const TYPES = [
    { value: "", label: "Not set" },
    { value: "individual", label: "Individual" },
    { value: "company", label: "Company" },
] as const;

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
        gstRegistered: settings.tax?.registered ?? false,
        gstState: settings.tax?.state ?? "",
        invoicePrefix: settings.tax?.invoicePrefix ?? "",
        deliveryRate: settings.tax?.deliveryRate ?? "18",
        deliverySac: settings.tax?.deliverySac ?? "",
        addressLine1: settings.registeredAddress?.line1 ?? "",
        addressLine2: settings.registeredAddress?.line2 ?? "",
        city: settings.registeredAddress?.city ?? "",
        postalCode: settings.registeredAddress?.postalCode ?? "",
    };
}

/**
 * The four tabs, one card each ("Saroh Settings" design), in the order a
 * customer's invoice reads: who the business is, how to reach it, how it is
 * taxed and numbered, where it is registered.
 */
const SECTIONS = {
    identity: {
        title: "Identity",
        lead: "How the business is named and registered",
        fields: ["name", "legalName", "type", "country"],
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
            "gstState",
            "invoicePrefix",
            "deliveryRate",
            "deliverySac",
        ],
    },
    address: {
        title: "Registered address",
        lead: "Printed under your legal name",
        fields: ["addressLine1", "addressLine2", "city", "postalCode"],
    },
} as const satisfies Record<
    string,
    { title: string; lead: string; fields: readonly (keyof FormValues)[] }
>;
type SectionKey = keyof typeof SECTIONS;
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

const sectionOf = (field: string): SectionKey =>
    SECTION_KEYS.find((key) =>
        (SECTIONS[key].fields as readonly string[]).includes(field),
    ) ?? "identity";

/**
 * India's financial year, which the API numbers invoices by (`numbering.ts`).
 * The design lets a business choose the month it starts; the API has one
 * year, April to March, so it is said here rather than offered.
 */
const FINANCIAL_YEAR_ROW: BusinessRow = {
    label: "Financial year",
    value: "April – March",
    tag: "Invoice numbers restart each April",
};

const stateName = (code: string) =>
    GST_STATES.find((s) => s.value === code)?.label ?? "";

/** The state a GST invoice names: the one chosen, else the GSTIN's. */
function gstStateOf(v: Pick<FormValues, "gstState" | "taxId">): {
    name: string;
    fromGstin: boolean;
} {
    if (v.gstState) return { name: stateName(v.gstState), fromGstin: false };
    const fromId = stateName((v.taxId ?? "").trim().slice(0, 2));
    return { name: fromId, fromGstin: fromId !== "" };
}

function addressText(v: FormValues): string {
    return [
        v.addressLine1,
        v.addressLine2,
        [v.city, v.postalCode].filter((x) => x.trim()).join(" "),
        v.gstRegistered ? gstStateOf(v).name : "",
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
}: {
    settings: OrganizationSettings;
    canEdit: boolean;
}) {
    const router = useRouter();
    // What the API last said, so the cards read the saved values at once
    // rather than waiting for the page to be fetched again.
    const [settings, setSettings] = useState(initial);
    // In the address, so Search settings can open the tab a setting is on.
    const [tab, setTab] = useTabParam(
        BUSINESS_TAB_PARAM,
        SECTION_KEYS,
        "identity",
    );
    const [editing, setEditing] = useState<SectionKey | null>(null);
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
    // An open edit with changes holds the way off this page.
    const { leaveTo, stay } = useLeaveGuard(editing !== null && isDirty);

    const startEditing = (key: SectionKey) => {
        if (editing && editing !== key && isDirty) {
            showInfo(
                `Finish or cancel your edit in ${SECTIONS[editing].title} first`,
            );
            setTab(editing);
            return;
        }
        form.reset(valuesOf(settings));
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
            ([field]) => sectionOf(field) !== editing,
        );
        if (first) {
            showError(
                `${SECTIONS[sectionOf(first[0])].title}: ${first[1].message ?? "needs attention"}`,
            );
        }
    }

    async function onSubmit(values: FormValues) {
        if (!editing) return;
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
            if (field && sectionOf(field) === editing) {
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
    const number = (x: FormValues) =>
        sampleInvoiceNumber(x.invoicePrefix, x.gstRegistered);
    const savedState = gstStateOf(saved);

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
                label: "Country",
                value: saved.country ? countryName(saved.country) : "",
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
              ],
        address: [
            {
                label: "Address",
                value: addressText(saved),
                empty: "No registered address yet",
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
    const sectionErrors = editing
        ? Object.keys(errors).filter((field) => sectionOf(field) === editing)
              .length
        : 0;
    const saveWhy = !isDirty
        ? "No changes yet"
        : sectionErrors === 1
          ? "1 thing to fix"
          : sectionErrors > 1
            ? `${sectionErrors} things to fix`
            : "";

    const liveState = gstStateOf(v);
    const tabIndex = SECTION_KEYS.indexOf(tab);
    const onTabKeys = (e: React.KeyboardEvent) => {
        const n = SECTION_KEYS.length;
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
        setTab(SECTION_KEYS[next]);
        document.getElementById(`business-tab-${SECTION_KEYS[next]}`)?.focus();
    };

    /** One field's wrapper, at the width the design gives it. */
    const at = (basis: string, grow = true) => ({
        className: cn(
            "min-w-0",
            grow ? "flex-[1_1_var(--b)]" : "flex-[0_1_var(--b)]",
        ),
        style: { "--b": basis } as React.CSSProperties,
    });

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
                    name="country"
                    render={({ field }) => (
                        <FormItem {...at("220px")}>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                                <CountrySelect
                                    value={field.value ?? ""}
                                    onValueChange={field.onChange}
                                />
                            </FormControl>
                            <FormDescription>
                                Where the business is registered.
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
                                        onCheckedChange={field.onChange}
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
                                    className="font-mono"
                                />
                            </FormControl>
                            <FormDescription>
                                {registered
                                    ? "The first two digits set your state."
                                    : "Any VAT or tax registration number."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                {registered ? (
                    <FormField
                        control={form.control}
                        name="gstState"
                        render={({ field }) => (
                            <FormItem {...at("240px")}>
                                <FormLabel>State</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={[
                                            {
                                                value: "",
                                                label: stateName(
                                                    (v.taxId ?? "").slice(0, 2),
                                                )
                                                    ? `From the GSTIN — ${stateName((v.taxId ?? "").slice(0, 2))}`
                                                    : "From the GSTIN",
                                            },
                                            ...GST_STATES,
                                        ]}
                                        className="w-full"
                                    />
                                </FormControl>
                                <FormDescription>
                                    A sale to another state is IGST.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ) : null}
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
                <p className="basis-full text-[11.5px] leading-normal text-muted-foreground">
                    {registered
                        ? `Numbers run per financial year: ${number(v)}. Delivery is its own line on an invoice, printed with its SAC.`
                        : `Numbers run on: ${number(v)}.`}{" "}
                    Invoices already numbered keep their numbers.
                </p>
            </>
        ),
        address: (
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
                        [
                            "postalCode",
                            "PIN code",
                            "140px",
                            false,
                            "postal-code",
                        ],
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
                                        maxLength={
                                            name === "postalCode" ? 12 : 120
                                        }
                                        inputMode={
                                            name === "postalCode"
                                                ? "numeric"
                                                : undefined
                                        }
                                        autoComplete={auto}
                                        className={cn(
                                            name === "postalCode" &&
                                                "font-mono",
                                        )}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                ))}
            </>
        ),
    };

    return (
        <Form {...form}>
            <div
                role="tablist"
                aria-label="Business details"
                onKeyDown={onTabKeys}
                className="-mt-1.5 mb-[18px] flex flex-wrap gap-0.5 border-b border-border"
            >
                {SECTION_KEYS.map((key) => {
                    const on = key === tab;
                    return (
                        <button
                            key={key}
                            id={`business-tab-${key}`}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls="business-panel"
                            tabIndex={on ? 0 : -1}
                            onClick={() => setTab(key)}
                            className={cn(
                                "flex items-center gap-[7px] px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {SECTIONS[key].title}
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
                    >
                        {fieldsOf[tab]}
                    </BusinessSection>
                </form>

                <BusinessPrintPreview
                    live={editing !== null && isDirty}
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
                section={editing ? SECTIONS[editing].title : "Business"}
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
