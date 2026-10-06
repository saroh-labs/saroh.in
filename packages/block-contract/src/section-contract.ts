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

/** How long an image brief may run (KTD-5). */
export const IMAGE_BRIEF_MAX = 200;

/**
 * What photograph belongs in an image slot that has none yet (KTD-5,
 * industry templates U2): "Morning light on the counter, loaves stacked".
 *
 * A SIBLING of the block's image, not a field inside it. `imageSchema`
 * requires a `src` — every image published so far has one, and the media
 * library's "on a published site" guard reads it — so a slot with only a
 * brief cannot be an image. Making `src` optional instead would loosen every
 * image in every block, and every renderer would have to learn that an
 * image may have nowhere to load from. A sibling string touches only the
 * blocks that take one, is optional (so it extends each block's current
 * version in place) and is plain text.
 *
 * A template ships the slot as this brief and no image. The live site draws
 * nothing for the slot — a brief is a note to the owner, never something a
 * visitor reads — and the editor shows it as the empty slot's text. Once a
 * photo is chosen the brief is simply not drawn; it can stay.
 */
const imageBrief = z.string().trim().max(IMAGE_BRIEF_MAX).optional();

// ---------------------------------------------------------------------------
// Section content schemas (per type + version)
// ---------------------------------------------------------------------------

/**
 * hero v1 — a headline block with optional CTA + image.
 *
 * `onToday` (G18) sets "On today" beside the headline: the next classes with
 * places and the next free appointment times, and whether the business is
 * open now. A switch, not content — the times are read live from the booking
 * page's own availability, never stored here. Optional, so it extends v1
 * (and v2, which extends v1) in place, as `paddingOverride` did: every
 * existing hero validates and renders exactly as before.
 */
const heroV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().min(1),
    subheading: z.string().optional(),
    cta: ctaSchema.optional(),
    image: imageSchema.optional(),
    /** The photo this hero wants, until it has one (KTD-5). */
    imageBrief,
    onToday: z.boolean().optional(),
});

/**
 * richText v1 — authorable rich content. REQUIRES SANITIZATION: `value` holds
 * HTML/markdown authored in the editor. The API sanitizes it when a draft is
 * saved, when the editor loads it and at publish (#280), all driven by
 * `sanitizedFields` below.
 *
 * `image` and `imageSide` (G7) put one photo beside the text, on the left or
 * the right; absent side means the right. The photo is the same shape as the
 * hero's — the address the media library served, not an id resolved later —
 * so the media library's "on a published site" guard already finds it in a
 * snapshot. Both are optional, so they extend v1 in place, as `padding` did:
 * every existing text block validates and renders exactly as before.
 *
 * Alt text is required, but not here. A merchant picks the photo first and
 * describes it second, and the draft autosaves in between; refusing that save
 * would lose the photo. The pre-publish check flags a photo with no
 * description instead (`site-flags.ts`), as it does every other gap.
 */
/**
 * `above` (template polish) puts the photo over the text at 16:9, as the
 * developer design opens its case study; the text keeps its own column.
 */
export const TEXT_IMAGE_SIDES = ["left", "right", "above"] as const;
export type TextImageSide = (typeof TEXT_IMAGE_SIDES)[number];

/** How long a text block's callout may run. */
export const TEXT_CALLOUT_MAX = 600;

const richTextV1 = z.object({
    variant,
    padding: paddingOverride,
    format: z.enum(["html", "markdown"]).default("html"),
    value: z.string(),
    image: imageSchema.optional(),
    /** The photo beside the text, until it has one (KTD-5). */
    imageBrief,
    imageSide: z.enum(TEXT_IMAGE_SIDES).optional(),
    /**
     * A boxed line after the text, ruled on its left in the accent — "What
     * changed: …" (template polish). Plain text, so it is not sanitized and
     * cannot carry markup; ABSENT draws nothing.
     */
    callout: z
        .object({
            label: z.string().trim().max(60).optional(),
            text: z.string().trim().min(1).max(TEXT_CALLOUT_MAX),
        })
        .optional(),
    /**
     * Sets the text's `h3`s as small capitals labels, the way a case study
     * names its parts ("The problem", "What I decided"). ABSENT keeps them
     * as headings.
     */
    partLabels: z.boolean().optional(),
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
/**
 * One gallery image, with an optional line under it (industry templates U2).
 *
 * The caption is the gallery's own, not the shared `imageSchema`'s: a hero's
 * photo has no line under it, and extending the shared shape would offer one
 * everywhere a photo is. Plain text; an empty caption draws nothing.
 * Added to v2 only, as an optional field: every gallery@2 section and
 * publication validates as before, and v1 stays untouched (see above).
 */
export const GALLERY_CAPTION_MAX = 200;
/**
 * Where a photo's caption sits (DEC-090): `below` the photo, as captions
 * always have, or `over` it on a bounded band — a fixed height, its lines
 * clipped — as the studio and ceramics designs draw them. ABSENT is below.
 */
export const CAPTION_PLACEMENTS = ["below", "over"] as const;
const captionPlacement = z.enum(CAPTION_PLACEMENTS).optional();

const galleryImageSchema = imageSchema.extend({
    caption: z.string().trim().max(GALLERY_CAPTION_MAX).optional(),
});

const galleryV2 = z
    .object({
        variant,
        padding: paddingOverride,
        images: z.array(galleryImageSchema),
        captionPlacement,
        /**
         * What photographs belong here, when there are none yet (KTD-5). A
         * template ships a gallery as this brief and no images; see
         * `imageBrief` above. No images and a brief: the live site draws
         * nothing, the editor shows the brief in the empty slot.
         */
        imageBrief,
    })
    .refine((g) => g.images.length > 0 || Boolean(g.imageBrief), {
        // Loosened from `.min(1)` only for a slot that says what it wants:
        // every gallery that validated before still does.
        message: "Add at least one image",
        path: ["images"],
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
/** How long a point's figure ("₹42,000", "14 years") may run. */
export const FEATURE_VALUE_MAX = 60;

const featureItemSchema = z.object({
    title: z.string().min(1).max(120),
    body: z.string().max(600).optional(),
    /**
     * A figure the point stands on — a rate, a count, a span ("₹42,000",
     * "14 years") — set large in the heading face (template polish). The
     * merchant's own words, never read from anywhere: a rate here is the
     * owner's to write, not a price the platform knows. Optional, so it
     * extends v1 in place.
     */
    value: z.string().trim().max(FEATURE_VALUE_MAX).optional(),
});

const featuresV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().max(160).optional(),
    intro: z.string().max(600).optional(),
    items: z.array(featureItemSchema).min(1).max(12),
    /**
     * The `list` and `steps` looks in two columns from the tablet width up
     * (one on a phone). ABSENT is one column, as before. The grid has its
     * own columns and ignores it.
     */
    columns: z.union([z.literal(1), z.literal(2)]).optional(),
    /** A muted line under the points — a disclaimer, a caveat. Plain text. */
    note: z.string().trim().max(600).optional(),
});

/**
 * faq v1 — questions and their answers (#255).
 *
 * Pure content. Drawn as native `<details>` so each answer opens without
 * JavaScript and with the keyboard, on a phone as on a desk. Answers are plain
 * text: a merchant's line breaks are kept, and nothing here is authored HTML.
 * Bounded like `features`; twenty questions is already a page of its own.
 */
const faqItemSchema = z.object({
    question: z.string().trim().min(1).max(200),
    answer: z.string().trim().min(1).max(2000),
});

const faqV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().max(160).optional(),
    intro: z.string().max(600).optional(),
    items: z.array(faqItemSchema).min(1).max(20),
});

/**
 * testimonials v1 — what customers said, and who said it (#255).
 *
 * Pure content, and attributed on purpose: a quote needs a name, because an
 * unattributed one reads as invented. The role ("Regular since 2019", "Owner,
 * Café Nero") is optional. No photo in v1, for the reason `features` has no
 * icon: an added optional field is not breaking.
 */
const testimonialItemSchema = z.object({
    quote: z.string().trim().min(1).max(600),
    name: z.string().trim().min(1).max(120),
    role: z.string().max(120).optional(),
});

const testimonialsV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().max(160).optional(),
    items: z.array(testimonialItemSchema).min(1).max(12),
});

/**
 * contact v1 — how to reach the business and where to find it (#255).
 *
 * Every channel is optional, but a contact block with none of them has nothing
 * to say, so at least one of address, phone, email or WhatsApp is required.
 * Phone and WhatsApp use the same `phone` rule a call button does, and their
 * links are built by `ctaHref`, so a number that works on a button works here.
 *
 * `hours` is free text rather than a weekly table: "Mon–Fri 9–6, Sat 10–2" is
 * how a merchant already writes it, and a structured schedule is a bigger
 * question than this block. `mapUrl` overrides the map link, which is otherwise
 * a search for the address; it must be a web address, never a script.
 */
const mapUrl = z
    .string()
    .trim()
    .url("Enter a full web address, starting with https://")
    .refine(
        (url) => /^https?:\/\//i.test(url) && isSafeHref(url),
        "Enter a full web address, starting with https://",
    );

const contactV1 = z
    .object({
        variant,
        padding: paddingOverride,
        heading: z.string().max(160).optional(),
        intro: z.string().max(600).optional(),
        address: z.string().trim().max(500).optional(),
        hours: z.string().trim().max(500).optional(),
        phone: phone.optional(),
        email: z.string().trim().email("Enter an email address").optional(),
        whatsapp: phone.optional(),
        mapUrl: mapUrl.optional(),
    })
    .refine(
        // An empty string is not a channel, so this is a truthiness test.
        (c) => [c.address, c.phone, c.email, c.whatsapp].some(Boolean),
        {
            message:
                "Add at least one way to reach you: address, phone, email or WhatsApp",
            path: ["address"],
        },
    );

/**
 * How a list section lays out its items (G16, R12): `cards` side by side, or
 * `list`, one per row with the photo, where there is one, on the left. The
 * Site Editor's "Show as". Each bound block says what ABSENT means, and it is
 * always the look the block had before the option existed, so a page
 * published before G16 draws exactly as it did.
 */
export const LIST_LAYOUTS = ["cards", "list"] as const;
export type ListLayout = (typeof LIST_LAYOUTS)[number];
const listLayout = z.enum(LIST_LAYOUTS).optional();

/**
 * A list section's button words (G16), "Leave empty to keep each item's own
 * button". ABSENT means the block's own, and 40 characters is a button.
 */
const buttonLabel = z.string().trim().max(40).optional();

/**
 * servicesList v1 — the merchant's real Services, read live (#255).
 *
 * The first block that shows module data. It stores only WHICH services and in
 * what order; names, prices and durations are fetched when the page is viewed,
 * so a changed price or a deleted service is right without a republish. What a
 * visitor sees when the data is not there:
 * - a service deleted or archived after publish: it is left out;
 * - none left, or Appointments switched off: the block renders nothing, rather
 *   than a heading over an empty list or a claim the business cannot keep;
 * - the API unreachable: the block's own error state, with a retry.
 * A price is never drawn as 0 when absent (`saroh-product.md`).
 *
 * `cta` is the usual button (#207), typically "Book now" pointing at the page
 * with the booking block. Up to 24 services: past that it is a catalogue.
 *
 * Display options (G16): `layout` (ABSENT: `list`, the rows it has always
 * drawn), `showDescriptions` (ABSENT: shown) and `buttonLabel`, the words on
 * each service's own button (ABSENT: "Book").
 */
const servicesListV1 = z.object({
    variant,
    padding: paddingOverride,
    heading: z.string().max(160).optional(),
    intro: z.string().max(600).optional(),
    serviceIds: z
        .array(z.string().min(1))
        .min(1, "Choose at least one service")
        .max(24)
        .refine(
            (ids) => new Set(ids).size === ids.length,
            "A service is listed twice",
        ),
    showPrices: z.boolean().optional(),
    cta: ctaSchemaV2.optional(),
    /**
     * Display options (G16), each ABSENT meaning what the block drew before:
     * one service per row (`list`), with its description, and a "Book" link.
     */
    layout: listLayout,
    showDescriptions: z.boolean().optional(),
    buttonLabel,
});

/**
 * visitUs v1 — where a place is and when it is open, read live (G8).
 *
 * A bound block like `servicesList`: it stores WHICH place and how to show
 * it, never the address, the hours or the phone. Those are read when the page
 * is viewed (`GET public/sites/:siteId/visit/:storeId`), so a changed address
 * or a new week of hours is right without a republish, and the block can never
 * disagree with the storefront.
 *
 * `storeId` names one `SHOP` storefront — a place with an address and hours.
 * It is the block's own and NOT the site's "sells from" storefront, because a
 * site that sells from an `ONLINE` storefront still has a shop to visit.
 * Optional, like `booking.serviceId`: a just-added block has none until the
 * editor picks one, and the live site then renders nothing rather than a
 * card with no place in it.
 *
 * `showMap` is the Get directions link (a maps search for the address, not an
 * embedded map); `showHours` the week and "Open now". Both default to on, so
 * ABSENT means shown.
 */
const visitUsV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    storeId: z.string().min(1).optional(),
    showMap: z.boolean().optional(),
    showHours: z.boolean().optional(),
});

/**
 * journal v1 — the site's latest published posts, read live (G10).
 *
 * A bound block (ADR-004): it stores how many posts to show and how, never the
 * posts. They are read when the page is served, from the posts this site owns
 * (`GET public/sites/:siteId/posts`, newest first), so publishing a post puts
 * it on the page without republishing the site, and taking one down removes it.
 *
 * `count` is 3 or 6 — a row, or two. ABSENT means 3. `showExcerpts` and
 * `showImages` default to on, so ABSENT means shown. With no posts live the
 * block renders nothing on the site; the editor's canvas says why.
 *
 * Display options (G16): `layout` (ABSENT: `cards`) and `buttonLabel`, words
 * such as "Read" at the foot of each post's card (ABSENT: none, the card
 * itself is the link). Photos are `showImages` and descriptions
 * `showExcerpts`.
 *
 * The `archive` look (industry templates U2) lists EVERY published post as
 * a dated list — the date in a column, the title and its line beside it —
 * and so ignores `count`, `layout`, `showImages` and `buttonLabel`. A look
 * rather than `count: "all"`, so `count` keeps meaning one thing and a
 * section switched back to cards keeps the count it had.
 */
const journalV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    count: z.union([z.literal(3), z.literal(6)]).optional(),
    showExcerpts: z.boolean().optional(),
    showImages: z.boolean().optional(),
    /** Display options (G16): ABSENT, cards and no button of their own. */
    layout: listLayout,
    buttonLabel,
});

/**
 * plans v1 — the business's subscription plans on sale, read live (G9).
 *
 * A bound block (ADR-004): it stores the section title and how the plans
 * show, never a plan. They are read when the page is served
 * (`GET public/sites/:siteId/plans`): only plans on sale (published and
 * active), with their published values, never a draft or an unpublished
 * change, and nothing at all while Payments is off for the business.
 *
 * `highlight` marks the first plan ("Most chosen"); ABSENT means `first`.
 * `buttonLabel` is the card's button; ABSENT means the block's own default.
 * `showDescriptions` defaults to on, so ABSENT means shown. With no plan on
 * sale the block renders nothing on the site; the editor's canvas says why.
 */
const plansV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    highlight: z.enum(["first", "none"]).optional(),
    buttonLabel,
    showDescriptions: z.boolean().optional(),
    /** Display options (G16): ABSENT, cards with their prices. */
    layout: listLayout,
    showPrices: z.boolean().optional(),
});

/**
 * packs v1 — the business's class packs on sale, read live (G20).
 *
 * A bound block like `plans` (ADR-004): it stores the section title and how
 * the packs show, never a pack. They are read when the page is served
 * (`GET public/sites/:siteId/packs`): only packs on sale (published and
 * active), with their published values, never a draft or an unpublished
 * change, and nothing at all while Class packs is off for the business.
 *
 * `buttonLabel` is the card's button; ABSENT means the block's own default
 * ("Buy", or "Ask about this pack" where the business can't take payment
 * online). `showDescriptions` defaults to on, so ABSENT means shown. With no
 * pack on sale the block renders nothing on the site; the editor's canvas
 * says why.
 */
const packsV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    buttonLabel: z.string().trim().max(40).optional(),
    showDescriptions: z.boolean().optional(),
});

/** How many projects a Projects block carries, at most (K11). */
export const PROJECTS_MAX = 24;

/**
 * projects v1 — the merchant's own work: a photo, a title, a line about it
 * and a link to more (K11, DEC-070).
 *
 * A STATIC block, not a bound one (KTD-13). A project is the merchant's own
 * words and photo; there is no Project model to read, and
 * `Organization.projects` is ADR-001's internal grouping, not portfolio
 * work, so nothing here binds to it. What a merchant types is what a visitor
 * reads, as with `features`.
 *
 * Every part of an item but the title is optional: a project with no photo
 * draws without a gap where one would be, and one with no link has no
 * "View project". The photo is the hero's shape, the address the media
 * library served, so the library's "on a published site" guard finds it in a
 * snapshot. Its description is asked for before publishing, not on save
 * (`site-flags.ts`), for the reason the text block's photo gives: the photo
 * is chosen first and the draft saves in between.
 *
 * `link` is a `linkHref`, so `javascript:` is refused when it is authored.
 * Looks are `cards` and `list` (`LIST_LAYOUTS`), in `BLOCK_META`.
 * Up to {@link PROJECTS_MAX}: past that it is a page of its own.
 */
const projectItemSchema = z.object({
    image: imageSchema.optional(),
    /** The photo this project wants, until it has one (KTD-5). */
    imageBrief,
    /**
     * A line under the photo — who took it, where, when (industry templates
     * U2). Drawn only beside a photo. Optional, so it extends v1 in place.
     */
    caption: z.string().trim().max(GALLERY_CAPTION_MAX).optional(),
    title: z.string().trim().min(1).max(120),
    summary: z.string().max(600).optional(),
    link: linkHref.optional(),
});

const projectsV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    items: z.array(projectItemSchema).min(1).max(PROJECTS_MAX),
    /**
     * `over`: in the cards look, a project's title and caption sit on a
     * bounded band over its photo (DEC-090). Absent is below, as before.
     */
    captionPlacement,
});

/** How many products a Product grid shows, at most, and when it isn't set. */
export const PRODUCT_GRID_MAX = 12;
export const PRODUCT_GRID_DEFAULT_COUNT = 4;

/**
 * productGrid v1 — products from the catalogue, read live (G12).
 *
 * A bound block (ADR-004): it stores the title and WHICH products by id,
 * never a product's name, photo or price. They are read when the page is
 * served (`GET public/sites/:siteId/shop/products?source=…`), at the site's
 * sells-from storefront: only published products listed there, with only
 * the variants sold there, and nothing at all while the shop is not open
 * for the business. A picked product later archived or unlisted drops out
 * at view time, and the editor flags it before publish.
 *
 * - `source` ABSENT means `newest`: the newest products sold there.
 * - `collection`: the products of `collectionId` (DEC-031), hand-picked in
 *   their order or automatic by name.
 * - `picked`: `productIds`, in the merchant's order.
 * - `count` ABSENT means {@link PRODUCT_GRID_DEFAULT_COUNT}.
 * - `showPrices` defaults to on, so ABSENT means shown.
 *
 * The `lead` look (industry templates U2) gives the first product twice the
 * room — two columns and two rows from the tablet width up, one column on a
 * phone — with tall photos and the price set large. It ignores `layout`.
 * The `plates` look (DEC-090) puts each product in a fixed-height cell, the
 * first twice the room, with its words on a bounded band over the photo.
 *
 * A just-added block, or one whose collection or products are still to be
 * chosen, saves: a draft is saved as it is typed. It renders nothing live
 * until there is something to show, and the flag engine says why. Whether
 * an id is the business's own is checked by the API at save, not here.
 */
const productGridV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    source: z.enum(["newest", "collection", "picked"]).optional(),
    collectionId: z.string().trim().min(1).max(64).optional(),
    productIds: z
        .array(z.string().trim().min(1).max(64))
        .max(PRODUCT_GRID_MAX)
        .refine(
            (ids) => new Set(ids).size === ids.length,
            "A product is picked twice",
        )
        .optional(),
    count: z.number().int().min(1).max(PRODUCT_GRID_MAX).optional(),
    showPrices: z.boolean().optional(),
    /**
     * Display options (G16), each ABSENT meaning what the grid drew before:
     * cards, each with its photo and its line, and no button (the card
     * itself opens the product).
     */
    layout: listLayout,
    showPhotos: z.boolean().optional(),
    showDescriptions: z.boolean().optional(),
    buttonLabel,
});

/** How many classes a Timetable may be limited to (U2). */
export const TIMETABLE_MAX_SERVICES = 24;

/**
 * timetable v1 — the week's class sessions, read live (industry templates U2).
 *
 * A bound block like `booking` (ADR-004, KTD-4): it stores which classes and
 * how they show, never a session. The sessions are read when the page is
 * viewed (`GET public/sites/:siteId/timetable`), the booking page's own
 * starts for the next seven days, so a time here is always one the booking
 * page offers, and a session's places left are right without a republish.
 *
 * - `serviceIds` ABSENT or empty: every class the booking page offers. Set:
 *   only those, and only while they are classes on offer. Ids, never names.
 * - `showTrainer` and `showPlacesLeft` default to on, so ABSENT means shown.
 *   Full is always said in words, whatever `showPlacesLeft` is.
 * - The week is always seven days from today: a field for it would be a
 *   number with one right answer.
 *
 * Looks are `grid` (days across, times down; a list on a phone) and `list`
 * (day by day), in `BLOCK_META`. With no class sessions in the week the
 * block renders nothing on the site; the editor's canvas says why.
 */
const timetableV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    intro: z.string().trim().max(600).optional(),
    serviceIds: z
        .array(z.string().trim().min(1).max(64))
        .max(TIMETABLE_MAX_SERVICES)
        .refine(
            (ids) => new Set(ids).size === ids.length,
            "A class is listed twice",
        )
        .optional(),
    showTrainer: z.boolean().optional(),
    showPlacesLeft: z.boolean().optional(),
});

/**
 * hours v1 — opening hours on their own, read live (industry templates U2).
 *
 * A bound block like `visitUs`, reading the same public visit read: with a
 * `storeId`, that SHOP storefront (`GET public/sites/:siteId/visit/:storeId`);
 * ABSENT, the business's own place (`GET public/sites/:siteId/visit`) — its
 * first open shop, else the business profile's hours. So a business with one
 * place needs to choose nothing. The week is Settings › Hours (DEC-034).
 *
 * `showClosed` ABSENT means closed days are listed, muted but stated
 * ("Sunday · Closed"); off, they are left out. With no hours saved the block
 * renders nothing, never "Closed" every day — a claim the business never
 * made.
 */
const hoursV1 = z.object({
    variant,
    padding: paddingOverride,
    title: z.string().trim().max(160).optional(),
    storeId: z.string().min(1).optional(),
    showClosed: z.boolean().optional(),
});

/** How many qualifications a Person lists, at most, and how long a bio runs. */
export const PERSON_CREDENTIALS_MAX = 8;
export const PERSON_BIO_MAX = 1200;

/**
 * person v1 — one practitioner: a photo, their name, what they do, their
 * qualifications and a few lines about them (industry templates U2).
 *
 * A STATIC block, like `projects`: what a merchant types is what a visitor
 * reads. It is not bound to a staff member, because staff carry no photo,
 * qualifications or bio today, and a site's "about the practitioner" is the
 * merchant's own words. Only `name` is required; a person with no photo
 * draws without a gap. `bio` is plain text, its line breaks kept. `cta` is
 * the usual button (#207), "Book with Anika" pointing at the booking page.
 *
 * The photo's description is asked for before publishing, not on save
 * (`site-flags.ts`), as the text block's is.
 */
const personV1 = z.object({
    variant,
    padding: paddingOverride,
    image: imageSchema.optional(),
    /** The photo this person wants, until it has one (KTD-5). */
    imageBrief,
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().max(160).optional(),
    credentials: z
        .array(z.string().trim().min(1).max(120))
        .max(PERSON_CREDENTIALS_MAX)
        .optional(),
    bio: z.string().trim().max(PERSON_BIO_MAX).optional(),
    cta: ctaSchemaV2.optional(),
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
    "faq",
    "testimonials",
    "contact",
    "servicesList",
    "visitUs",
    "journal",
    "plans",
    "productGrid",
    "packs",
    "projects",
    "timetable",
    "hours",
    "person",
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
    [key("faq", 1)]: {
        type: "faq",
        version: 1,
        // Plain text throughout — answers keep line breaks, not markup.
        schema: faqV1,
        sanitizedFields: [],
    },
    [key("testimonials", 1)]: {
        type: "testimonials",
        version: 1,
        // Plain text throughout — nothing here is authored HTML.
        schema: testimonialsV1,
        sanitizedFields: [],
    },
    [key("contact", 1)]: {
        type: "contact",
        version: 1,
        // Plain text; its links are built from validated numbers, addresses
        // and an http(s) map URL, never taken as authored hrefs.
        schema: contactV1,
        sanitizedFields: [],
    },
    [key("servicesList", 1)]: {
        type: "servicesList",
        version: 1,
        // Ids, a flag and a button; the service text comes from the API live.
        schema: servicesListV1,
        sanitizedFields: [],
    },
    [key("booking", 1)]: {
        type: "booking",
        version: 1,
        schema: bookingV1,
        // All values are plain text — nothing here is authored HTML.
        sanitizedFields: [],
    },
    [key("visitUs", 1)]: {
        type: "visitUs",
        version: 1,
        // A title, an id and two switches; the place is read from the API live.
        schema: visitUsV1,
        sanitizedFields: [],
    },
    [key("journal", 1)]: {
        type: "journal",
        version: 1,
        // A title, a count and two switches; the posts are read live.
        schema: journalV1,
        sanitizedFields: [],
    },
    [key("plans", 1)]: {
        type: "plans",
        version: 1,
        // A title and display options; the plans are read live.
        schema: plansV1,
        sanitizedFields: [],
    },
    [key("productGrid", 1)]: {
        type: "productGrid",
        version: 1,
        // A title, which products by id, a count and a switch; the products
        // themselves are read live.
        schema: productGridV1,
        sanitizedFields: [],
    },
    [key("packs", 1)]: {
        type: "packs",
        version: 1,
        // A title and display options; the packs are read live.
        schema: packsV1,
        sanitizedFields: [],
    },
    [key("projects", 1)]: {
        type: "projects",
        version: 1,
        // Plain text, photos and links checked by `linkHref`; nothing here
        // is authored HTML.
        schema: projectsV1,
        sanitizedFields: [],
    },
    [key("timetable", 1)]: {
        type: "timetable",
        version: 1,
        // A title, which classes by id and two switches; the sessions are
        // read live.
        schema: timetableV1,
        sanitizedFields: [],
    },
    [key("hours", 1)]: {
        type: "hours",
        version: 1,
        // A title, an id and a switch; the week is read live.
        schema: hoursV1,
        sanitizedFields: [],
    },
    [key("person", 1)]: {
        type: "person",
        version: 1,
        // Plain text, a photo and a button; nothing here is authored HTML.
        schema: personV1,
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
    /**
     * A field that stands in for `field` while it is empty: a split hero's
     * image brief (KTD-5) says which photo goes there, so a template can
     * ship the look before the owner has the photo. The live site draws
     * the hero without one until then, and the pre-publish check names it.
     */
    orField?: string;
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
                orField: "imageBrief",
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

/**
 * Content written to an older contract, moved to the newest one for its type.
 *
 * Choosing a look lifts a section to the latest contract (that is what turns a
 * `gallery@1` carrying `layout` into a `gallery@2` carrying `variant`). Lifting
 * the version without the content made a starter hero, whose v1 button is
 * `{ label, href }`, fail v2's `cta.action` — so picking "Split" left the hero
 * "not finished" and unsaveable whatever was filled in. This is the one place
 * the content moves with the version:
 *
 * - hero and cta 1 → 2: a button's `href` becomes `action: { kind: "url",
 *   href }`, the same reading the editor gives a v1 button it edits;
 * - gallery 1 → 2: `layout` becomes the `variant` it always meant, unless one
 *   is already named.
 *
 * Content already at the latest version comes back unchanged. Nothing is
 * validated here; the caller still parses the result.
 */
export function liftToLatest(
    type: string,
    version: number,
    content: Record<string, unknown>,
): { version: number; content: Record<string, unknown> } {
    const latest = latestContractVersion(type);
    if (version >= latest) return { version, content };
    let next = content;
    if (version < 2) {
        if (type === "hero" && isRecord(content.cta)) {
            next = { ...content, cta: buttonWithAction(content.cta) };
        } else if (type === "cta") {
            next = buttonWithAction(content);
        } else if (type === "gallery") {
            const { layout, ...rest } = content;
            next =
                rest.variant === undefined && typeof layout === "string"
                    ? { ...rest, variant: layout }
                    : rest;
        }
    }
    return { version: latest, content: next };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A v1 button (`href`) as a v2 one (`action`); one with an action is kept. */
function buttonWithAction(
    button: Record<string, unknown>,
): Record<string, unknown> {
    if (button.action !== undefined) return button;
    const { href, ...rest } = button;
    return {
        ...rest,
        action: { kind: "url", href: typeof href === "string" ? href : "" },
    };
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
                const data = result.data as Record<string, unknown>;
                const empty = (value: unknown) =>
                    value === undefined || value === null || value === "";
                return (
                    empty(data[req.field]) &&
                    (req.orField === undefined || empty(data[req.orField]))
                );
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
