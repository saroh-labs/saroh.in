import { z } from "zod";

import type { SectionType } from "./section-contract";
import { SECTION_TYPES } from "./section-contract";

/**
 * The RENDERED shape of a block (#252).
 *
 * A block has two shapes, and until this module only one of them was written
 * down:
 *
 *   - AUTHORING — what the editor writes and `section-contract.ts` validates.
 *     A button carries an ACTION: `{ kind: "call", number: "+91…" }`.
 *   - RENDERED — what a publication snapshot carries and a component draws.
 *     The same button carries an HREF: `"tel:+919876543210"`.
 *
 * `ctaHref` maps between them at publish, and that is deliberate: a renderer
 * that resolved page IDs would need the draft tables it must never read, so the
 * snapshot is the site exactly as served. See the note on `ctaHref` itself.
 *
 * The rendered shape previously existed ONLY as hand-typed TypeScript in
 * `apps/saroh.app/lib/publication.ts`, under a comment asking the next person
 * to remember to update it when the contract changed — and a second, separate
 * hand-typed copy in `apps/app.saroh.in/lib/sites/service.ts`. #189 is what
 * that cost: the editor honoured a per-section padding the live site ignored.
 *
 * WHAT THIS IS NOT FOR. These schemas do NOT run on the live render path.
 * A published snapshot was validated at publish and a Publication is immutable,
 * so its content cannot be invalid; re-checking it would cost every visitor
 * (`publication.ts` fetches `no-store`) to catch a condition that cannot occur,
 * and strict validation would turn today's graceful degradation of an
 * unrecognised field into a blank section. They run in TESTS and in the
 * ui.saroh.in CATALOG, whose fixtures are hand-authored and genuinely can be
 * wrong.
 */

/**
 * NO DEFAULTS IN THIS MODULE.
 *
 * The authoring schemas in `section-contract.ts` default `style` to "primary",
 * `format` to "html", `layout` to "grid" and `alt` to "" — correctly, because
 * they describe what an author may write and publish normalises it on the way
 * in.
 *
 * These schemas describe JSON that ALREADY EXISTS, and a Publication is
 * immutable and goes back to Stage 2. A default here would type a field as
 * always-present, which would in turn make the `?? "grid"` guards the
 * components have carried since they were written look redundant — and
 * deleting them would break exactly the oldest published sites, the ones whose
 * owners can no longer re-publish to fix them. Optional is the honest shape.
 * `apps/saroh.app/lib/publication.ts` declared every one of these optional, and
 * it was written by people looking at the rows.
 */

/**
 * A block's chosen look (#252, #254).
 *
 * Design is not otherwise merchant-editable: a merchant picks a variant and
 * then edits content only. Everything else about how a block looks comes from
 * the site-wide Style panel plus the per-section `padding` override.
 *
 * Optional, and on the RENDERED shape from the start. An added optional field
 * is not a breaking change — `paddingOverride` established that precedent
 * explicitly — so reserving it now costs one line per block, where retrofitting
 * it after a dozen blocks have shipped would cost a contract version bump per
 * block.
 *
 * ABSENT means "this block's default look", NOT an error. A renderer meeting a
 * variant name it does not know must fall back to that default rather than
 * blanking the section: an unknown section TYPE degrades to nothing because
 * there is nothing to draw, but an unknown variant of a known type still has
 * content worth showing.
 */
const variant = z.string().min(1).optional();

/** Per-section padding override, as published. Bounds match the authoring side. */
const padding = z.number().int().min(24).max(96).optional();

/**
 * A button, as published.
 *
 * `href` is what a component draws, for v1 and v2 alike — a v2 button's
 * `action` was resolved into it at publish (#207). `action` travels beside it
 * carrying ONLY its `kind`, so a component can still tell a call from a link
 * (and draw a phone icon) without the payload it has no business holding.
 *
 * `href` may be `""`: a button naming a page that was hidden or removed
 * resolves to nothing, the flag engine has already said so, and the component
 * draws a label rather than a broken link.
 */
export const renderedCtaSchema = z.object({
    label: z.string().min(1),
    href: z.string(),
    style: z.enum(["primary", "secondary", "link"]).optional(),
    action: z
        .object({
            kind: z.enum(["page", "url", "email", "call", "whatsapp"]),
        })
        .optional(),
});
export type RenderedCta = z.infer<typeof renderedCtaSchema>;

/**
 * An image, as published. Nothing about an image resolves at publish.
 *
 * `alt` is OPTIONAL here although the authoring schema defaults it to `""`.
 * That is not an oversight and not a mismatch: publications are immutable and
 * go back to Stage 2, so a row written before that default existed carries no
 * `alt` at all, and a type claiming otherwise would delete the `?? ""` guards
 * the components have always had. The type describes the JSON that exists, not
 * the JSON we would write today.
 */
export const renderedImageSchema = z.object({
    src: z.string().min(1),
    alt: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
});

const renderedHero = z.object({
    variant,
    padding,
    heading: z.string().min(1),
    subheading: z.string().optional(),
    cta: renderedCtaSchema.optional(),
    image: renderedImageSchema.optional(),
    /** The photo it wants (KTD-5): a note to the owner, never drawn live. */
    imageBrief: z.string().optional(),
    /** "On today" beside the headline (G18); read live, never stored. */
    onToday: z.boolean().optional(),
});

/**
 * `value` is HTML or markdown ALREADY SANITIZED at publish, through the fields
 * `section-contract.ts` names in `sanitizedFields`. A component may therefore
 * treat it as trusted, controlled content. Nothing downstream of here sanitizes,
 * and nothing downstream of here should need to.
 */
const renderedRichText = z.object({
    variant,
    padding,
    format: z.enum(["html", "markdown"]).optional(),
    value: z.string(),
    /** One photo beside the text (G7); absent side is the right. */
    image: renderedImageSchema.optional(),
    imageBrief: z.string().optional(),
    // A side this build does not know draws as the right, as absent does.
    imageSide: z.string().optional(),
    /** A boxed line after the text, ruled in the accent (template polish). */
    callout: z
        .object({ label: z.string().optional(), text: z.string() })
        .optional(),
    partLabels: z.boolean().optional(),
});

const renderedCta = renderedCtaSchema.extend({ variant, padding });

/**
 * `layout` is gone: it WAS this block's variant under another name (#254), and
 * carrying both was two mechanisms answering one question.
 *
 * A `gallery@1` snapshot still carries `layout` and no `variant`. It is not
 * described here and does not need to be — unknown keys are stripped, and
 * `resolveVariant` reads the old field to work out which look such a section was
 * already wearing.
 */
const renderedGallery = z.object({
    variant,
    padding,
    /**
     * Empty only for a slot shipped as a brief (KTD-5), which the live site
     * draws as nothing. Each image may carry a caption (U2).
     */
    images: z.array(
        renderedImageSchema.extend({ caption: z.string().optional() }),
    ),
    imageBrief: z.string().optional(),
    // Where captions sit (DEC-090); a value this build does not know is below.
    captionPlacement: z.string().optional(),
});

const renderedEnquiryField = z.object({
    name: z.string().min(1).max(64),
    label: z.string().min(1).max(128),
    type: z.enum(["text", "email", "tel", "textarea"]),
    required: z.boolean().optional(),
});

const renderedEnquiry = z.object({
    variant,
    padding,
    formId: z.string().min(1).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    submitLabel: z.string().optional(),
    successMessage: z.string().optional(),
    fields: z.array(renderedEnquiryField).min(1),
});

const renderedBooking = z.object({
    variant,
    padding,
    serviceId: z.string().min(1).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    submitLabel: z.string().optional(),
    successMessage: z.string().optional(),
});

/**
 * `features`, as published. Nothing resolves — it is text all the way down.
 *
 * The bounds are looser than the authoring schema's on purpose: an immutable
 * snapshot may hold content written against a future contract that allowed
 * more, and refusing to describe it would not make it go away.
 */
const renderedFeatures = z.object({
    variant,
    padding,
    heading: z.string().optional(),
    intro: z.string().optional(),
    items: z
        .array(
            z.object({
                title: z.string(),
                body: z.string().optional(),
                /** A figure the point stands on, the merchant's own words. */
                value: z.string().optional(),
            }),
        )
        .min(1),
    columns: z.number().int().optional(),
    note: z.string().optional(),
});

/**
 * `faq`, `testimonials` and `contact`, as published (#255). Text only — nothing
 * resolves at publish. Looser than the authoring schemas for the same reason
 * `features` is: a snapshot is immutable and may outlive today's bounds.
 */
const renderedFaq = z.object({
    variant,
    padding,
    heading: z.string().optional(),
    intro: z.string().optional(),
    items: z
        .array(z.object({ question: z.string(), answer: z.string() }))
        .min(1),
});

const renderedTestimonials = z.object({
    variant,
    padding,
    heading: z.string().optional(),
    items: z
        .array(
            z.object({
                quote: z.string(),
                name: z.string(),
                role: z.string().optional(),
            }),
        )
        .min(1),
});

/**
 * The renderer builds contact links itself, and re-checks `mapUrl` rather than
 * trusting that the snapshot was written by today's contract.
 */
const renderedContact = z.object({
    variant,
    padding,
    heading: z.string().optional(),
    intro: z.string().optional(),
    address: z.string().optional(),
    hours: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    whatsapp: z.string().optional(),
    mapUrl: z.string().optional(),
});

/** `servicesList`, as published: the button's href resolved, nothing else. */
const renderedServicesList = z.object({
    variant,
    padding,
    heading: z.string().optional(),
    intro: z.string().optional(),
    serviceIds: z.array(z.string()),
    showPrices: z.boolean().optional(),
    cta: renderedCtaSchema.optional(),
    layout: z.enum(["cards", "list"]).optional(),
    showDescriptions: z.boolean().optional(),
    buttonLabel: z.string().optional(),
});

/**
 * `visitUs`, as published (G8): nothing resolves at publish. The place itself
 * is read live by the component, from the id alone.
 */
const renderedVisitUs = z.object({
    variant,
    padding,
    title: z.string().optional(),
    storeId: z.string().optional(),
    showMap: z.boolean().optional(),
    showHours: z.boolean().optional(),
});

/**
 * `journal`, as published (G10): nothing resolves at publish. The posts are
 * read when the page is served, from the site the page belongs to.
 */
const renderedJournal = z.object({
    variant,
    padding,
    title: z.string().optional(),
    count: z.union([z.literal(3), z.literal(6)]).optional(),
    showExcerpts: z.boolean().optional(),
    showImages: z.boolean().optional(),
    layout: z.enum(["cards", "list"]).optional(),
    buttonLabel: z.string().optional(),
});

/**
 * `plans`, as published (G9): nothing resolves at publish. The plans are read
 * when the page is served, from the business the site belongs to.
 */
const renderedPlans = z.object({
    variant,
    padding,
    title: z.string().optional(),
    intro: z.string().optional(),
    highlight: z.enum(["first", "none"]).optional(),
    buttonLabel: z.string().optional(),
    showDescriptions: z.boolean().optional(),
    layout: z.enum(["cards", "list"]).optional(),
    showPrices: z.boolean().optional(),
});

/**
 * `productGrid`, as published (G12): nothing resolves at publish. The
 * products are read when the page is served, at the site's storefront.
 */
const renderedProductGrid = z.object({
    variant,
    padding,
    title: z.string().optional(),
    source: z.enum(["newest", "collection", "picked"]).optional(),
    collectionId: z.string().optional(),
    productIds: z.array(z.string()).optional(),
    count: z.number().int().optional(),
    showPrices: z.boolean().optional(),
    layout: z.enum(["cards", "list"]).optional(),
    showPhotos: z.boolean().optional(),
    showDescriptions: z.boolean().optional(),
    buttonLabel: z.string().optional(),
    showAvailability: z.boolean().optional(),
    note: z.string().optional(),
    // A card style this build does not know draws as the card.
    cardStyle: z.string().optional(),
});

/**
 * `packs`, as published (G20): nothing resolves at publish. The packs are read
 * when the page is served, from the business the site belongs to.
 */
const renderedPacks = z.object({
    variant,
    padding,
    title: z.string().optional(),
    buttonLabel: z.string().optional(),
    showDescriptions: z.boolean().optional(),
});

/**
 * `projects`, as published (K11): nothing resolves at publish. Looser than
 * the authoring schema, as `features` is: a snapshot is immutable and may
 * outlive today's bounds. The component re-checks each `link` rather than
 * trusting that the snapshot was written by today's contract.
 */
const renderedProjects = z.object({
    variant,
    padding,
    title: z.string().optional(),
    items: z
        .array(
            z.object({
                image: renderedImageSchema.optional(),
                imageBrief: z.string().optional(),
                caption: z.string().optional(),
                title: z.string(),
                summary: z.string().optional(),
                link: z.string().optional(),
                year: z.string().optional(),
                role: z.string().optional(),
                meta: z.string().optional(),
            }),
        )
        .min(1),
    captionPlacement: z.string().optional(),
    showCount: z.boolean().optional(),
});

/**
 * `timetable`, `hours` and `person`, as published (industry templates U2).
 * The first two are bound: nothing resolves at publish, the sessions and the
 * week are read live. A person's button resolves like hero's.
 */
const renderedTimetable = z.object({
    variant,
    padding,
    title: z.string().optional(),
    intro: z.string().optional(),
    serviceIds: z.array(z.string()).optional(),
    showTrainer: z.boolean().optional(),
    showPlacesLeft: z.boolean().optional(),
});

const renderedHours = z.object({
    variant,
    padding,
    title: z.string().optional(),
    storeId: z.string().optional(),
    showClosed: z.boolean().optional(),
    groupDays: z.boolean().optional(),
    showAddress: z.boolean().optional(),
});

const renderedPerson = z.object({
    variant,
    padding,
    image: renderedImageSchema.optional(),
    imageBrief: z.string().optional(),
    name: z.string(),
    role: z.string().optional(),
    // A line, or a row with where it came from (template polish).
    credentials: z
        .array(
            z.union([
                z.string(),
                z.object({
                    title: z.string(),
                    detail: z.string().optional(),
                }),
            ]),
        )
        .optional(),
    credentialsLabel: z.string().optional(),
    bio: z.string().optional(),
    cta: renderedCtaSchema.optional(),
    asTitle: z.boolean().optional(),
    title: z.string().optional(),
    people: z
        .array(
            z.object({
                image: renderedImageSchema.optional(),
                imageBrief: z.string().optional(),
                name: z.string(),
                role: z.string().optional(),
                bio: z.string().optional(),
            }),
        )
        .optional(),
});

/**
 * The rendered schema for every block type.
 *
 * `Record<SectionType, …>` on purpose: a block type added to `SECTION_TYPES`
 * without a rendered schema is a TYPE ERROR, not a runtime surprise. Same
 * mechanism `SECTION_LABELS` uses in the site editor, and the reason a
 * forgotten block type has never silently shipped.
 *
 * Keyed by TYPE rather than by (type, version) because the rendered shape is
 * what a component draws, and a component does not branch on contract version —
 * `hero@1` and `hero@2` differ in how a button is AUTHORED, and publish
 * resolves both to the same `href`. That is the whole point of resolving at
 * publish.
 */
export const RENDERED_SCHEMAS = {
    hero: renderedHero,
    richText: renderedRichText,
    cta: renderedCta,
    gallery: renderedGallery,
    enquiry: renderedEnquiry,
    booking: renderedBooking,
    features: renderedFeatures,
    faq: renderedFaq,
    testimonials: renderedTestimonials,
    contact: renderedContact,
    servicesList: renderedServicesList,
    visitUs: renderedVisitUs,
    journal: renderedJournal,
    plans: renderedPlans,
    productGrid: renderedProductGrid,
    packs: renderedPacks,
    projects: renderedProjects,
    timetable: renderedTimetable,
    hours: renderedHours,
    person: renderedPerson,
} satisfies Record<SectionType, z.ZodTypeAny>;

export type RenderedContent<T extends SectionType> = z.infer<
    (typeof RENDERED_SCHEMAS)[T]
>;

export type RenderedHero = RenderedContent<"hero">;
export type RenderedRichText = RenderedContent<"richText">;
export type RenderedCtaSection = RenderedContent<"cta">;
export type RenderedGallery = RenderedContent<"gallery">;
export type RenderedEnquiry = RenderedContent<"enquiry">;
export type RenderedBooking = RenderedContent<"booking">;
export type RenderedFeatures = RenderedContent<"features">;
export type RenderedFaq = RenderedContent<"faq">;
export type RenderedTestimonials = RenderedContent<"testimonials">;
export type RenderedContact = RenderedContent<"contact">;
export type RenderedServicesList = RenderedContent<"servicesList">;
export type RenderedVisitUs = RenderedContent<"visitUs">;
export type RenderedJournal = RenderedContent<"journal">;
export type RenderedPlans = RenderedContent<"plans">;
export type RenderedProductGrid = RenderedContent<"productGrid">;
export type RenderedPacks = RenderedContent<"packs">;
export type RenderedProjects = RenderedContent<"projects">;
export type RenderedTimetable = RenderedContent<"timetable">;
export type RenderedHours = RenderedContent<"hours">;
export type RenderedPerson = RenderedContent<"person">;

/**
 * Validate rendered content for a block type.
 *
 * For TESTS and the CATALOG. Not for the live render path — see the module note
 * above for why re-validating an immutable snapshot costs every visitor and
 * catches nothing.
 */
export function parseRenderedContent<T extends SectionType>(
    type: T,
    content: unknown,
):
    | { success: true; data: RenderedContent<T> }
    | { success: false; issues: z.ZodIssue[] } {
    const schema = RENDERED_SCHEMAS[type];
    const result = schema.safeParse(content);
    return result.success
        ? { success: true, data: result.data }
        : { success: false, issues: result.error.issues };
}

/** Whether a string names a known block type. */
export function isSectionType(value: string): value is SectionType {
    return (SECTION_TYPES as readonly string[]).includes(value);
}
