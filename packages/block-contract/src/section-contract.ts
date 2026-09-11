import { z } from "zod";

/**
 * Versioned section contract (Stage 2 — S2-001).
 *
 * The SINGLE SOURCE OF TRUTH for what a `Section.content` (see schema.prisma)
 * may contain, keyed by `(sectionType, contractVersion)`. This is the AUTHORING
 * shape — what an author may write. What a component finally draws is the
 * RENDERED shape, in `./rendered.ts`, and `./to-rendered.ts` maps between them.
 *
 * Two places validate through this module:
 *
 *   - the section editor (S2-004) validates on save, and
 *   - publish (S2-005) validates before snapshotting into an immutable
 *     Publication.
 *
 * The public renderer does NOT, and should not. This header used to claim it
 * did; it never has (`section-renderer.tsx` casts). The claim was also wrong on
 * the merits, which is why the comment was corrected rather than the code
 * (#252): a Publication is immutable and was validated on the way in, so its
 * content cannot be invalid, and `apps/saroh.app/lib/publication.ts` fetches
 * `no-store` — so re-checking would cost every visitor to catch a condition
 * that cannot occur. Worse, a strict re-check would turn today's graceful
 * degradation of a field from a newer contract into a blank section. Rendered
 * content is instead validated where it is hand-authored and genuinely can be
 * wrong: in tests and in the ui.saroh.in catalog's fixtures.
 *
 * SANITIZATION BOUNDARY. This module validates the *shape* of content only; it
 * NEVER sanitizes. Section types that carry rich/authorable HTML declare their
 * rich fields in `sanitizedFields`. The publish step (S2-005) MUST run those
 * fields through an HTML sanitizer before writing the immutable Publication
 * snapshot — so the renderer only ever reads already-sanitized content. Use
 * `requiresSanitization(type, version)` / `contract.sanitizedFields` to find
 * the fields that need it.
 *
 * Contracts are versioned starting at 1. A breaking change to a section's
 * content shape ships as a NEW version alongside the old one (never an
 * in-place edit), so existing Sections/Publications keep validating.
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * Per-section padding override (#189).
 *
 * Layout rather than content, and it would be tidier on the `Section` row than
 * inside `content` — but `content` is the only free-form field the model has,
 * and the contract is precisely the mechanism for extending what a section may
 * carry. A column would mean a migration plus a change to every read and write
 * path for one optional number.
 *
 * ABSENT means "follow the site setting", which is why this is optional rather
 * than defaulted: a default would bake today's site value into the section and
 * stop it tracking the slider afterwards.
 *
 * Bounds match the site-level Section padding slider, so an override can never
 * produce a spacing the site setting itself could not.
 *
 * Adding an optional field is not a breaking change — existing Sections and
 * Publications still validate — so this extends v1 rather than shipping a v2.
 * An older renderer reading a newer snapshot simply drops it and uses the site
 * setting, which is the sane degradation.
 */
const paddingOverride = z.number().int().min(24).max(96).optional();

/**
 * Which of the block's looks this section wears (#254).
 *
 * ON THE AUTHORING SHAPE, not only the rendered one. #252 Step 1 reserved
 * `variant` in `rendered.ts` and stopped there — and because a zod object
 * strips unknown keys by default, `parseSectionContent` would have SILENTLY
 * DISCARDED a merchant's choice on save. The reserved field could never have
 * survived a round trip. Nothing caught it because nothing wrote a variant yet.
 *
 * Optional, so adding it extends v1 rather than versioning every block —
 * the same reasoning `paddingOverride` records: an added optional field is not
 * a breaking change, existing Sections and Publications still validate.
 *
 * ABSENT does not mean "the default". It means the content predates variants,
 * and each block DECLARES how to resolve that (see `resolveVariant` in
 * `./variants.ts`) — hero's answer is its old `hasImage` rule, because
 * defaulting it to the first declared look would have flipped every published
 * hero carrying an image from two-column to centred.
 *
 * Not an enum here on purpose. The set of looks is per block and lives in
 * `BLOCK_META`; encoding it in each schema would put the same list in two
 * places, and a snapshot published against a newer contract may legitimately
 * name a look this build has never heard of.
 */
const variant = z.string().min(1).optional();

/**
 * The link schemes a button may use (#280).
 *
 * A button's href reaches the live site as an `<a href>`, and `javascript:`
 * there runs script for every visitor on the merchant's own domain. React 19
 * happens to refuse such URLs today; the contract should not depend on that.
 * So a link is a web address, an email or phone link, or a path on the site.
 * Anything else that carries a scheme is refused when it is authored.
 */
const SAFE_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto", "tel"];

/**
 * Whether an authored href is safe to draw as a link on a merchant's site.
 *
 * The scheme is read the way a browser reads it: tabs, newlines, spaces and
 * other control characters are removed first, so `java\nscript:` cannot pass
 * as a relative path. A value with no scheme (`/products`, `#contact`,
 * `products`) is a path on the site and is allowed.
 */
export function isSafeHref(href: string): boolean {
    const compact = Array.from(href)
        .filter((ch) => {
            const code = ch.charCodeAt(0);
            return code > 0x20 && code !== 0x7f;
        })
        .join("");
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1];
    return (
        scheme === undefined || SAFE_LINK_SCHEMES.includes(scheme.toLowerCase())
    );
}

const linkHref = z
    .string()
    .min(1)
    .refine(
        isSafeHref,
        "A link must be a web address, an email or phone link, or a path on this site",
    );

const ctaSchema = z.object({
    label: z.string().min(1),
    href: linkHref,
    style: z.enum(["primary", "secondary", "link"]).default("primary"),
});

/**
 * What a button DOES (#207). v1 carried a bare `href`, which meant the only
 * thing a merchant could make a button do was navigate — and "call us" or
 * "message us on WhatsApp" had to be typed as a URL by someone who knew the
 * `tel:` and `wa.me` incantations. A discriminated union names the intent, and
 * each kind asks for exactly the one thing it needs.
 *
 * `page` references a page ID rather than a path, so renaming or moving the
 * page cannot orphan the button — the path is resolved at publish. That is also
 * what turns "the hero button points at /products, which is not a page" from a
 * warning into something that cannot be authored: a picker offers only pages
 * that exist.
 *
 * `url` keeps relative paths legal so a v1 `href` lifts losslessly; the flag
 * engine still checks a leading-slash url against the site's pages.
 */
const phone = z
    .string()
    .trim()
    .min(1)
    // Digits, with the spaces, dashes and brackets people actually type; a
    // leading + for a country code. Normalised to E.164-ish by `ctaHref`.
    .regex(/^\+?[0-9 ()-]{6,20}$/, "Enter a phone number with digits only");

export const ctaActionSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("page"), pageId: z.string().min(1) }),
    z.object({ kind: z.literal("url"), href: linkHref }),
    z.object({
        kind: z.literal("email"),
        address: z.string().trim().email("Enter an email address"),
        subject: z.string().max(200).optional(),
    }),
    z.object({ kind: z.literal("call"), number: phone }),
    z.object({
        kind: z.literal("whatsapp"),
        number: phone,
        message: z.string().max(500).optional(),
    }),
]);
export type CtaAction = z.infer<typeof ctaActionSchema>;

const ctaSchemaV2 = z.object({
    label: z.string().min(1),
    action: ctaActionSchema,
    style: z.enum(["primary", "secondary", "link"]).default("primary"),
});

/** Digits and a leading +, nothing else — what tel: and wa.me both want. */
function digitsOf(number: string): string {
    const plus = number.trim().startsWith("+") ? "+" : "";
    return plus + number.replace(/[^0-9]/g, "");
}

/**
 * Turn an action into the href the renderer draws, or "" when it cannot be.
 *
 * Resolved at PUBLISH, not in the renderer: the snapshot is the site as it was
 * served, and a renderer that had to look up page IDs would need the draft
 * tables it must never read. `resolvePage` is the publisher's map of page id →
 * path for the pages that will actually be in the snapshot; a page that is
 * hidden or gone resolves to nothing, the flag engine has already said so, and
 * the button renders as a label rather than a broken link.
 */
export function ctaHref(
    action: CtaAction,
    resolvePage: (pageId: string) => string | undefined,
): string {
    switch (action.kind) {
        case "page":
            return resolvePage(action.pageId) ?? "";
        case "url":
            // Checked again here, not only by the contract: a url saved before
            // the contract refused unsafe schemes (#280) still reaches this,
            // and drawing no link beats drawing a script.
            return isSafeHref(action.href) ? action.href : "";
        case "email": {
            const q = action.subject?.trim()
                ? `?subject=${encodeURIComponent(action.subject.trim())}`
                : "";
            return `mailto:${action.address.trim()}${q}`;
        }
        case "call":
            return `tel:${digitsOf(action.number)}`;
        case "whatsapp": {
            const q = action.message?.trim()
                ? `?text=${encodeURIComponent(action.message.trim())}`
                : "";
            // wa.me wants the number without the +.
            return `https://wa.me/${digitsOf(action.number).replace(/^\+/, "")}${q}`;
        }
    }
}

const imageSchema = z.object({
    src: z.string().min(1),
    alt: z.string().default(""),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Section content schemas (per type + version)
// ---------------------------------------------------------------------------

/** hero v1 — a headline block with optional CTA + image. */
const heroV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().min(1),
    subheading: z.string().optional(),
    cta: ctaSchema.optional(),
    image: imageSchema.optional(),
});

/**
 * richText v1 — authorable rich content. REQUIRES SANITIZATION: `value` holds
 * HTML/markdown authored in the editor. The API sanitizes it when a draft is
 * saved, when the editor loads it and at publish (#280), all driven by
 * `sanitizedFields` below.
 */
const richTextV1 = z.object({
    variant,
    padding: paddingOverride,
    format: z.enum(["html", "markdown"]).default("html"),
    value: z.string(),
});

/** cta v1 — a standalone call-to-action button. */
const ctaV1 = z.object({
    variant,
    padding: paddingOverride,
    label: z.string().min(1),
    href: linkHref,
    style: z.enum(["primary", "secondary", "link"]).default("primary"),
});

/**
 * cta v2 / hero v2 — the same sections with an ACTION instead of a bare href
 * (#207). A new version rather than an in-place edit, per the module rule:
 * every v1 Section and Publication keeps validating, and a v1 `href` lifts to
 * `{ kind: "url", href }` the first time the editor touches it.
 */
const ctaV2 = ctaSchemaV2.extend({ variant, padding: paddingOverride });
const heroV2 = heroV1.extend({ cta: ctaSchemaV2.optional() });

/**
 * gallery v1 — an ordered set of images.
 *
 * DELIBERATELY UNTOUCHED, `layout` and all. Its look mechanism IS `layout`, and
 * adding `variant` here would recreate in v1 exactly the two-mechanisms-for-one-
 * question problem v2 exists to remove. Every gallery section and publication
 * written before #254 validates against this and must keep doing so.
 */
const galleryV1 = z.object({
    padding: paddingOverride,
    images: z.array(imageSchema).min(1),
    layout: z.enum(["grid", "carousel", "masonry"]).default("grid"),
});

/**
 * gallery v2 — the same block, with `layout` folded into `variant` (#254).
 *
 * `renderedGallery` carried BOTH `variant` and `layout`, which is two
 * mechanisms answering one question. For most blocks a setting and a preset are
 * different things — Shopify has both, and Dawn's `layout: image_first` is a
 * setting the merchant flips freely while presets are the catalog entry. For
 * gallery they collapse: the only thing distinguishing one gallery preset from
 * another IS the layout.
 *
 * A NEW VERSION rather than an in-place edit, per the module rule. This is the
 * first breaking change the contract has actually had to absorb, and spending
 * it on one block now is cheaper than discovering at twelve that "which look"
 * has three different field names.
 *
 * `grid` is first because it is the least demanding look and therefore the
 * default an unrecognised variant falls back to (#254).
 */
const galleryV2 = z.object({
    variant,
    padding: paddingOverride,
    images: z.array(imageSchema).min(1),
});

/**
 * features v1 — a heading over a set of short, titled points.
 *
 * The first block added after the library's machinery was built (#255), and
 * deliberately pure content: no module data, so nothing here is gated on a
 * capability and nothing renders differently when Commerce is off. What a
 * merchant types is what a visitor reads.
 *
 * `items` IS BOUNDED AT BOTH ENDS. #257 found every comparable product declares
 * a cap on repeated content — Shopify's is "up to 50 blocks" per section — and
 * `gallery` shipping with `.min(1)` and no upper bound is the gap this does not
 * repeat. Twelve is a judgement about what a page can carry, not a technical
 * limit: past it the block stops being a summary and the merchant wants a page.
 *
 * No icon, and no per-item image, in v1. Both are real wants and both drag in a
 * picker; leaving them out keeps this block honest about what it draws and
 * keeps the first measurement of "what does adding a block cost" free of a
 * media dependency. An added optional field is not a breaking change, so either
 * can arrive without a v2.
 */
const featureItemSchema = z.object({
    title: z.string().min(1).max(120),
    body: z.string().max(600).optional(),
});

const featuresV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().max(160).optional(),
    intro: z.string().max(600).optional(),
    items: z.array(featureItemSchema).min(1).max(12),
});

/** The field descriptor types an enquiry form supports (mirrors the forms API). */
const enquiryFieldTypes = ["text", "email", "tel", "textarea"] as const;

/**
 * One field descriptor in an enquiry section — a snapshot of the backing Form's
 * `fields` (see the forms module on api.saroh.in). Persisted verbatim so the
 * renderer can draw the form, and kept in sync with the Form (which the public
 * submit endpoint validates against) by the editor on save.
 */
const enquiryFieldSchema = z.object({
    name: z.string().min(1).max(64),
    label: z.string().min(1).max(128),
    type: z.enum(enquiryFieldTypes),
    required: z.boolean().optional(),
});

/**
 * enquiry v1 — a public enquiry form the visitor submits. `formId` points at
 * the backing Form the public submit endpoint validates + routes by (the org is
 * derived from that Form, never the client); it is optional because a
 * just-added section has no Form until the editor syncs one on save. `fields`
 * is a snapshot of that Form's fields used to render the inputs. Values are
 * plain text, so NOTHING here requires sanitization.
 *
 * Semantic rules match the forms API: `fields` non-empty, field `name`s unique,
 * and at least one `type:"email"` field (the Contact dedupe key at submit).
 */
const enquiryV1 = z
    .object({
        variant,
        padding: paddingOverride,
        formId: z.string().min(1).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        submitLabel: z.string().optional(),
        successMessage: z.string().optional(),
        fields: z.array(enquiryFieldSchema).min(1),
    })
    .superRefine((value, ctx) => {
        const seen = new Set<string>();
        value.fields.forEach((field, index) => {
            if (seen.has(field.name)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["fields", index, "name"],
                    message: `Duplicate field name "${field.name}" — field names must be unique`,
                });
            }
            seen.add(field.name);
        });

        if (!value.fields.some((field) => field.type === "email")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["fields"],
                message:
                    'An enquiry form must have at least one field of type "email"',
            });
        }
    });

/**
 * booking v1 — a public booking widget the visitor reserves a slot through.
 * `serviceId` points at the bookable Service the PUBLIC availability + book
 * endpoints resolve the owning organization from (so the visitor's POST can
 * only ever create a Booking in that Service's org, never a client-supplied
 * one). It is optional because a just-added section has no Service picked until
 * the editor chooses one — Services are authored in the service editor, NOT
 * inline. All values are plain text, so NOTHING here requires sanitization.
 */
const bookingV1 = z.object({
    variant,
    padding: paddingOverride,
    serviceId: z.string().min(1).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    submitLabel: z.string().optional(),
    successMessage: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** The known section types. `Section.type` must be one of these. */
export const SECTION_TYPES = [
    "hero",
    "richText",
    "cta",
    "gallery",
    "enquiry",
    "booking",
    "features",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** A contract version number (starts at 1). */
export type ContractVersion = number;

/** A single registered contract for one (type, version) pair. */
export interface SectionContract<S extends z.ZodTypeAny = z.ZodTypeAny> {
    type: SectionType;
    version: ContractVersion;
    /** Zod schema validating (and normalizing) this section's `content`. */
    schema: S;
    /**
     * Dot-paths of fields holding rich/authorable content that MUST be
     * sanitized before publish. Empty => nothing in this section needs HTML
     * sanitization.
     */
    sanitizedFields: string[];
}

/** Registry key for a (type, version) pair. */
function key(type: string, version: number): string {
    return `${type}@${version}`;
}

const REGISTRY: Record<string, SectionContract> = {
    [key("hero", 1)]: {
        type: "hero",
        version: 1,
        schema: heroV1,
        sanitizedFields: [],
    },
    [key("richText", 1)]: {
        type: "richText",
        version: 1,
        schema: richTextV1,
        // `value` is authored HTML/markdown → sanitize before publish.
        sanitizedFields: ["value"],
    },
    [key("cta", 1)]: {
        type: "cta",
        version: 1,
        schema: ctaV1,
        sanitizedFields: [],
    },
    [key("cta", 2)]: {
        type: "cta",
        version: 2,
        schema: ctaV2,
        sanitizedFields: [],
    },
    [key("hero", 2)]: {
        type: "hero",
        version: 2,
        schema: heroV2,
        sanitizedFields: [],
    },
    [key("gallery", 2)]: {
        type: "gallery",
        version: 2,
        schema: galleryV2,
        sanitizedFields: [],
    },
    [key("gallery", 1)]: {
        type: "gallery",
        version: 1,
        schema: galleryV1,
        sanitizedFields: [],
    },
    [key("enquiry", 1)]: {
        type: "enquiry",
        version: 1,
        schema: enquiryV1,
        // All values are plain text — nothing here is authored HTML.
        sanitizedFields: [],
    },
    [key("features", 1)]: {
        type: "features",
        version: 1,
        // Plain text throughout — nothing here is authored HTML.
        schema: featuresV1,
        sanitizedFields: [],
    },
    [key("booking", 1)]: {
        type: "booking",
        version: 1,
        schema: bookingV1,
        // All values are plain text — nothing here is authored HTML.
        sanitizedFields: [],
    },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * What a variant additionally REQUIRES, beyond its block's base schema.
 *
 * Requiredness only — never a different field set. Declared here rather than in
 * the schemas because it is keyed on a value inside the content, and because a
 * block's looks live in `BLOCK_META` beside their labels and fixtures.
 *
 * A variant with no entry requires nothing extra, which is the common case.
 */
export interface VariantRequirement {
    /** Dot-free key on the section's own content. */
    field: string;
    /** Shown to the author, so it must name the look and the field. */
    message: string;
}

const VARIANT_REQUIREMENTS: Partial<
    Record<SectionType, Record<string, VariantRequirement[]>>
> = {
    hero: {
        /*
         * The split look is copy beside an image; without one it is a column of
         * text next to a hole. Required at AUTHORING only — a published snapshot
         * predating this rule may well be a split hero with no image, and it
         * must keep rendering rather than fail validation it never had to pass.
         */
        split: [
            {
                field: "image",
                message:
                    'The "Split" hero shows an image beside the copy — add one, or choose the "Centered" look.',
            },
        ],
    },
};

/** The extra requirements a given look imposes. Empty for most. */
export function variantRequirements(
    type: SectionType,
    variantId: string,
): VariantRequirement[] {
    return VARIANT_REQUIREMENTS[type]?.[variantId] ?? [];
}

/** Typed error returned by `parseSectionContent`. */
export type SectionContractError =
    | {
          code: "UNKNOWN_CONTRACT";
          type: string;
          version: number;
          message: string;
      }
    | {
          code: "INVALID_CONTENT";
          type: string;
          version: number;
          issues: z.ZodIssue[];
          message: string;
      };

/** Result of `parseSectionContent`: normalized data or a typed error. */
export type ParseSectionResult<T = unknown> =
    | { success: true; data: T; contract: SectionContract }
    | { success: false; error: SectionContractError };

/** Look up the contract for a (type, version), or `undefined` if none. */
export function getSectionContract(
    type: string,
    version: number,
): SectionContract | undefined {
    return REGISTRY[key(type, version)];
}

/**
 * The newest version registered for a block type.
 *
 * What the editor should write when it touches a section: the contract evolves
 * by adding a version beside the old one, and a section only moves forward when
 * someone edits it. `gallery@1` sections keep rendering untouched; the first
 * edit that sets a look makes them `gallery@2`.
 */
export function latestContractVersion(type: string): number {
    const versions = Object.values(REGISTRY)
        .filter((c) => c.type === type)
        .map((c) => c.version);
    return versions.length > 0 ? Math.max(...versions) : 1;
}

/** Every registered contract (e.g. for editor palettes / introspection). */
export function listSectionContracts(): SectionContract[] {
    return Object.values(REGISTRY);
}

/**
 * Whether a section type/version carries rich content requiring sanitization
 * before publish. Returns false for unknown contracts.
 */
export function requiresSanitization(type: string, version: number): boolean {
    return (getSectionContract(type, version)?.sanitizedFields.length ?? 0) > 0;
}

/**
 * Validate `content` against the contract for `(type, version)`. Returns the
 * normalized content (defaults applied) on success, or a typed error:
 *   - UNKNOWN_CONTRACT — no contract registered for (type, version)
 *   - INVALID_CONTENT  — content failed the contract's Zod schema
 *
 * NOTE: this validates shape only. It does NOT sanitize — see the module doc
 * and `sanitizedFields`.
 */
export function parseSectionContent(
    type: string,
    version: number,
    content: unknown,
): ParseSectionResult {
    const contract = getSectionContract(type, version);
    if (!contract) {
        return {
            success: false,
            error: {
                code: "UNKNOWN_CONTRACT",
                type,
                version,
                message: `No section contract registered for "${type}" v${version}`,
            },
        };
    }

    const result = contract.schema.safeParse(content);
    if (!result.success) {
        return {
            success: false,
            error: {
                code: "INVALID_CONTENT",
                type,
                version,
                issues: result.error.issues,
                message: `Invalid content for section "${type}" v${version}`,
            },
        };
    }

    /*
     * A look may REQUIRE a field the block itself leaves optional — `hero/split`
     * shows an image beside the copy, and without one it is a column of text
     * next to a hole (#254).
     *
     * Checked here rather than inside the schema because the requirement is
     * keyed on a value INSIDE the content, and only after the base parse has
     * confirmed the content is a section at all.
     *
     * READ FROM THE RAW `variant`, and skip when it is absent. Content written
     * before #254 names no look, and must not start failing validation it never
     * had to pass — every existing draft would become unsaveable. An unknown
     * look is skipped for the same reason: a build that does not know a variant
     * cannot know what it demands.
     */
    const named = (result.data as { variant?: unknown }).variant;
    if (typeof named === "string" && named.trim() !== "") {
        // `type` is a plain string here — parseSectionContent accepts anything
        // and reports UNKNOWN_CONTRACT — but a contract was found above, so it
        // is a registered type by construction.
        const unmet = variantRequirements(contract.type, named).filter(
            (req) => {
                const value = (result.data as Record<string, unknown>)[
                    req.field
                ];
                return value === undefined || value === null || value === "";
            },
        );
        if (unmet.length > 0) {
            return {
                success: false,
                error: {
                    code: "INVALID_CONTENT",
                    type,
                    version,
                    issues: unmet.map((req) => ({
                        code: z.ZodIssueCode.custom,
                        path: [req.field],
                        message: req.message,
                    })),
                    message: unmet[0].message,
                },
            };
        }
    }

    return { success: true, data: result.data, contract };
}

/**
 * Same as `parseSectionContent` but throws on failure. Convenience for call
 * sites that treat a contract violation as an exceptional condition.
 */
export function parseSectionContentOrThrow(
    type: string,
    version: number,
    content: unknown,
): unknown {
    const result = parseSectionContent(type, version, content);
    if (!result.success) {
        throw new Error(result.error.message);
    }
    return result.data;
}
