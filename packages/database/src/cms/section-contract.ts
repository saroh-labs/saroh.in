import { z } from "zod";

/**
 * Versioned section contract (Stage 2 — S2-001).
 *
 * The SINGLE SOURCE OF TRUTH for what a `Section.content` (see schema.prisma)
 * may contain, keyed by `(sectionType, contractVersion)`. Every part of the
 * CMS validates through this module:
 *
 *   - the section editor (S2-004) validates on save,
 *   - publish (S2-005) validates before snapshotting into an immutable
 *     Publication, and
 *   - the public renderer (S2-006) validates what it reads back.
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

const ctaSchema = z.object({
    label: z.string().min(1),
    href: z.string().min(1),
    style: z.enum(["primary", "secondary", "link"]).default("primary"),
});

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
    heading: z.string().min(1),
    subheading: z.string().optional(),
    cta: ctaSchema.optional(),
    image: imageSchema.optional(),
});

/**
 * richText v1 — authorable rich content. REQUIRES SANITIZATION: `value` holds
 * HTML/markdown authored in the editor and MUST be sanitized during publish
 * before it reaches the immutable snapshot (see `sanitizedFields` below).
 */
const richTextV1 = z.object({
    format: z.enum(["html", "markdown"]).default("html"),
    value: z.string(),
});

/** cta v1 — a standalone call-to-action button. */
const ctaV1 = z.object({
    label: z.string().min(1),
    href: z.string().min(1),
    style: z.enum(["primary", "secondary", "link"]).default("primary"),
});

/** gallery v1 — an ordered set of images. */
const galleryV1 = z.object({
    images: z.array(imageSchema).min(1),
    layout: z.enum(["grid", "carousel", "masonry"]).default("grid"),
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
