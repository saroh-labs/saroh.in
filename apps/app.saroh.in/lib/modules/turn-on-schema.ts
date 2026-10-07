import { z } from "zod";

import { moduleViewSchema } from "./schema";

/**
 * The "Turn on" sheet's contract with the API (DEC-068, unit M1):
 *
 * - `GET  …/modules/:key/setup-defaults` → `{ setup, dependencies, hidden,
 *   template? }` (`setup` is the prefill; `defaults` is read too, as this
 *   file first expected it)
 * - `PUT  …/modules/:key` with `{ status: "ENABLED", setup? }`
 *
 * Only three modules ask for anything at turn-on; every other one sends
 * `{}`. The shapes are kept here, in one file, so a change to the contract
 * is one edit. Decoding is lenient: a default the API didn't send, or sent
 * in a shape this app doesn't know, falls back to the defaults below rather
 * than failing the sheet — the API still judges what is saved.
 */

export const FULFILMENTS = ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"] as const;
export type Fulfilment = (typeof FULFILMENTS)[number];

export const commerceSetupSchema = z.object({
    storefrontName: z.string(),
    fulfilment: z.array(z.enum(FULFILMENTS)),
});
export type CommerceSetup = z.infer<typeof commerceSetupSchema>;

/** One open day: 0 is Sunday, as the API and `Date#getDay` count. */
export const hoursRowSchema = z.object({
    weekday: z.number().int().min(0).max(6),
    open: z.string(),
    close: z.string(),
});
export type HoursRow = z.infer<typeof hoursRowSchema>;

export const appointmentsSetupSchema = z.object({
    hours: z.array(hoursRowSchema),
    service: z.object({
        name: z.string(),
        durationMinutes: z.number().int(),
        /** A decimal string in rupees, never a float ("450.00"). */
        price: z.string(),
    }),
});
export type AppointmentsSetup = z.infer<typeof appointmentsSetupSchema>;

export const websiteSetupSchema = z.object({
    siteName: z.string(),
    /** The `<address>.saroh.app` subdomain. */
    address: z.string(),
    /**
     * The template chosen in the sheet (U12); absent: the kind's, which
     * the API picks itself. Never prefilled by the API.
     */
    templateId: z.string().optional(),
});
export type WebsiteSetup = z.infer<typeof websiteSetupSchema>;

/** The modules that ask for something at turn-on, and what. */
export interface SetupByKey {
    COMMERCE: CommerceSetup;
    APPOINTMENTS: AppointmentsSetup;
    WEBSITE: WebsiteSetup;
}
export type SetupKey = keyof SetupByKey;
export const SETUP_KEYS: readonly SetupKey[] = [
    "COMMERCE",
    "APPOINTMENTS",
    "WEBSITE",
];

export function hasSetup(key: string): key is SetupKey {
    return (SETUP_KEYS as readonly string[]).includes(key);
}

const SETUP_SCHEMAS: { [K in SetupKey]: z.ZodType<SetupByKey[K]> } = {
    COMMERCE: commerceSetupSchema,
    APPOINTMENTS: appointmentsSetupSchema,
    WEBSITE: websiteSetupSchema,
};

/** Mon–Sat, 10 to 7: DEC-068's opening hours. */
export const DEFAULT_HOURS: HoursRow[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "19:00",
}));

/**
 * What the sheet starts from when the API sent no defaults. Names are left
 * empty rather than invented: the business's own name comes from the API.
 */
export const FALLBACK_SETUP: SetupByKey = {
    COMMERCE: { storefrontName: "", fulfilment: ["PICKUP"] },
    APPOINTMENTS: {
        hours: DEFAULT_HOURS,
        service: { name: "", durationMinutes: 60, price: "" },
    },
    WEBSITE: { siteName: "", address: "" },
};

/** What `GET …/setup-defaults` answered for one module. */
export interface SetupDefaults {
    key: string;
    /** The setup to start from; null for a module that asks for nothing. */
    defaults: SetupByKey[SetupKey] | null;
    /** The modules the API says it needs. */
    dependencies: string[];
    /** Saroh doesn't offer it to this business (DEC-057, DEC-068). */
    hidden: boolean;
    /** False when the API couldn't be asked: the fallback is in use. */
    read: boolean;
    /**
     * Website only, with no site yet: the template a new site starts from,
     * which follows what is being set up (DEC-070, K15). Null: not said.
     */
    template: { id: string; name: string } | null;
    /**
     * Website only, with no site yet: the templates it could start from
     * instead (U12), and what is being set up, which suggests a few of
     * them. Empty and null when not said.
     */
    templates: WebsiteTemplateChoice[];
    kind: string | null;
}

/** A template the Website step may offer (`setup-defaults`' `templates`). */
export interface WebsiteTemplateChoice {
    id: string;
    name: string;
    kinds: string[];
    uses: string[];
}

const templateChoiceSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kinds: z.array(z.string()).catch([]),
    uses: z.array(z.string()).catch([]),
});

const defaultsEnvelopeSchema = z.object({
    /** The prefill, as the API names it. */
    setup: z.unknown().optional(),
    /** The name this file first read it under; kept as a fallback. */
    defaults: z.unknown().optional(),
    dependencies: z.array(z.string()).optional(),
    hidden: z.boolean().optional(),
    template: z
        .object({ id: z.string().min(1), name: z.string().min(1) })
        .nullish()
        .catch(null),
    // Lenient: a list this app can't read offers no choice, not a failure.
    templates: z.array(templateChoiceSchema).optional().catch(undefined),
    kind: z.string().nullish().catch(null),
});

/**
 * Decode one `setup-defaults` answer (bare, or in the API's `{ data }`
 * envelope). Null input means it couldn't be read.
 */
export function decodeSetupDefaults(key: string, raw: unknown): SetupDefaults {
    const fallback = hasSetup(key) ? FALLBACK_SETUP[key] : null;
    const body =
        raw && typeof raw === "object" && "data" in raw ? raw.data : raw;
    const parsed = defaultsEnvelopeSchema.safeParse(body);
    if (raw === null || !parsed.success) {
        return {
            key,
            defaults: fallback,
            dependencies: [],
            hidden: false,
            read: false,
            template: null,
            templates: [],
            kind: null,
        };
    }
    let defaults: SetupDefaults["defaults"] = fallback;
    if (hasSetup(key)) {
        const own = SETUP_SCHEMAS[key].safeParse(
            parsed.data.setup ?? parsed.data.defaults,
        );
        if (own.success) defaults = own.data;
    }
    return {
        key,
        defaults,
        dependencies: parsed.data.dependencies ?? [],
        hidden: parsed.data.hidden ?? false,
        read: true,
        template: parsed.data.template ?? null,
        templates: parsed.data.templates ?? [],
        kind: parsed.data.kind ?? null,
    };
}

/**
 * `PUT …/modules/:key` answered 2xx: the module's view as it is now, or
 * `{ alreadyEnabled: true }` when it was on already (with or without it).
 */
export const enableResponseSchema = z.object({
    data: moduleViewSchema.optional(),
    alreadyEnabled: z.boolean().optional(),
});
