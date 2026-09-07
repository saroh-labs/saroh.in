import type { RenderedContent } from "./rendered";
import type { SectionType } from "./section-contract";

/**
 * What each block is, what looks it comes in, and one example of each (#252).
 *
 * ONE FIXTURE, THREE JOBS. The example content here is the ui.saroh.in
 * catalog's preview content, the input tests render, and the thing CI parses
 * against the block's own rendered schema (gate G4). That third job is what
 * makes the first two trustworthy: a fixture is hand-authored, so unlike a
 * published snapshot it genuinely can be wrong, and a catalog quietly showing a
 * broken example is worse than no catalog.
 *
 * Fixtures are RENDERED content, not authored content — a button here carries
 * an `href`, not an `action`, because that is what a component draws.
 */

/** One named look a block comes in. */
export interface BlockVariant {
    /** Stable id, written into `content.variant`. Never renamed. */
    id: string;
    /** What a merchant sees in the picker. */
    label: string;
    /** When to reach for this one rather than its siblings. */
    description: string;
}

/**
 * A block's catalog entry.
 *
 * `variants` must be non-empty. A block with one look still declares it, so
 * "how many looks does this have" is always answerable from data rather than
 * from reading the component — and adding a second look later is then a change
 * to a list rather than a change of shape.
 */
export interface BlockMeta<T extends SectionType> {
    /** What a merchant sees. Outcome vocabulary, not the registry key. */
    label: string;
    description: string;
    variants: readonly [BlockVariant, ...BlockVariant[]];
    /** One example per variant id. Keys must cover `variants`; G4 checks it. */
    fixtures: Record<string, RenderedContent<T>>;
}

/**
 * `hero`'s two looks.
 *
 * These are not new. `HeroSection` already renders two layouts and picks
 * between them with `Boolean(content.image?.src)` — so the choice existed, was
 * invisible in the editor, unnameable in a template manifest, and unshowable in
 * a catalog. Naming them changes nothing about what ships and makes all three
 * possible.
 *
 * The old implicit rule stays the fallback: a hero with no `variant` renders
 * `split` when it has an image and `centered` when it does not, which is
 * exactly what every existing section and published snapshot does today.
 */
const heroVariants = [
    {
        id: "centered",
        label: "Centered",
        description:
            "Headline, subheading and button stacked and centred. The default when there is no image.",
    },
    {
        id: "split",
        label: "Split",
        description:
            "Copy on one side, image on the other, side by side from the large breakpoint up.",
    },
] as const;

/** The single look a block has, when it honestly has one. */
function soleVariant(description: string): readonly [BlockVariant] {
    return [{ id: "default", label: "Default", description }] as const;
}

/**
 * Every block's catalog entry.
 *
 * Typed per key so each block's fixtures are checked against ITS OWN rendered
 * schema, and so a type added to `SECTION_TYPES` without an entry fails to
 * compile (gate G3).
 */
export const BLOCK_META = {
    hero: {
        label: "Hero",
        description:
            "The opening statement of a page — a headline, an optional line beneath it, an optional button and image.",
        variants: heroVariants,
        fixtures: {
            centered: {
                variant: "centered",
                heading: "Fresh bread, baked every morning",
                subheading:
                    "Sourdough, rye and seeded loaves, out of the oven by six.",
                cta: {
                    label: "See today's bakes",
                    href: "/products",
                    style: "primary",
                    action: { kind: "page" },
                },
            },
            split: {
                variant: "split",
                heading: "Fresh bread, baked every morning",
                subheading:
                    "Sourdough, rye and seeded loaves, out of the oven by six.",
                cta: {
                    label: "Call the shop",
                    href: "tel:+919876543210",
                    style: "primary",
                    action: { kind: "call" },
                },
                image: {
                    src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Crect width='1200' height='800' fill='%23e7dcc9'/%3E%3Cellipse cx='600' cy='430' rx='300' ry='150' fill='%23c8a06a'/%3E%3Cellipse cx='330' cy='470' rx='190' ry='105' fill='%23b88c58'/%3E%3Cellipse cx='880' cy='470' rx='190' ry='105' fill='%23b88c58'/%3E%3C/svg%3E",
                    alt: "Three loaves cooling on a wire rack",
                    width: 1200,
                    height: 800,
                },
            },
        },
    },
    richText: {
        label: "Rich text",
        description:
            "A block of written copy. Sanitized at publish, so what reaches a page is already clean.",
        variants: soleVariant("A single column of prose."),
        fixtures: {
            default: {
                variant: "default",
                format: "html",
                value: "<h2>About the bakery</h2><p>We have been on the same corner since 1998.</p>",
            },
        },
    },
    cta: {
        label: "Call to action",
        description: "A band with one button, asking for the next step.",
        variants: soleVariant("A centred button on the call-to-action colour."),
        fixtures: {
            default: {
                variant: "default",
                label: "Book a table",
                href: "/bookings",
                style: "primary",
                action: { kind: "page" },
            },
        },
    },
    gallery: {
        label: "Gallery",
        description: "A set of images.",
        variants: soleVariant(
            "Layout is chosen by the block's own `layout` field — grid, carousel or masonry.",
        ),
        fixtures: {
            default: {
                variant: "default",
                layout: "grid",
                images: [
                    {
                        src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23d9cbb5'/%3E%3Crect x='80' y='330' width='640' height='150' fill='%23a8794c'/%3E%3Ccircle cx='250' cy='250' r='70' fill='%23c9a878'/%3E%3C/svg%3E",
                        alt: "The counter at opening time",
                    },
                    {
                        src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%232f2a26'/%3E%3Crect x='140' y='170' width='520' height='270' rx='16' fill='%23120f0d'/%3E%3Crect x='190' y='220' width='420' height='170' fill='%23e0913a'/%3E%3C/svg%3E",
                        alt: "The deck oven mid-bake",
                    },
                ],
            },
        },
    },
    enquiry: {
        label: "Enquiry form",
        description:
            "A form a visitor fills in. Backed by a Form record the submit endpoint validates against.",
        variants: soleVariant("A stacked form with a submit button."),
        fixtures: {
            default: {
                variant: "default",
                // Present because the block renders NOTHING without one — a
                // section with no backing Form was never synced, and drawing a
                // form that would POST to a broken URL is worse than drawing
                // none. The catalog's copy is inert: this id belongs to no
                // Form, so a submit from the catalog fails visibly rather than
                // writing somewhere unexpected.
                formId: "fixture-enquiry-form",
                title: "Ask us anything",
                submitLabel: "Send",
                successMessage: "Thanks — we will reply within a day.",
                fields: [
                    { name: "name", label: "Your name", type: "text" },
                    {
                        name: "email",
                        label: "Email",
                        type: "email",
                        required: true,
                    },
                    { name: "message", label: "Message", type: "textarea" },
                ],
            },
        },
    },
    booking: {
        label: "Booking",
        description:
            "A widget a visitor reserves a slot through, against one bookable Service.",
        variants: soleVariant("A date and slot picker with a confirm button."),
        fixtures: {
            default: {
                variant: "default",
                // A booking block with no `serviceId` renders NOTHING at all
                // (`if (!serviceId) return null`), so the first version of this
                // fixture gave the catalog an empty box and gave the G5
                // snapshot the empty string — a test that asserted nothing.
                // Caught by looking at the page, which is the argument for
                // having one.
                //
                // The id belongs to no Service, so availability 404s and the
                // widget shows its "no times" state. That is a real state a
                // visitor sees, and an honest thing to put in a catalog.
                serviceId: "fixture-service",
                title: "Book a table",
                description: "Lunch and dinner, seven days a week.",
                submitLabel: "Confirm booking",
                successMessage: "Booked. A confirmation is on its way.",
            },
        },
    },
} satisfies { [K in SectionType]: BlockMeta<K> };

/** Every block's catalog entry, for a picker or the catalog index. */
export function listBlockMeta(): {
    type: SectionType;
    meta: BlockMeta<SectionType>;
}[] {
    return (Object.keys(BLOCK_META) as SectionType[]).map((type) => ({
        type,
        meta: BLOCK_META[type],
    }));
}

/**
 * One block's example content for a variant, or `undefined`.
 *
 * `BLOCK_META` is declared with `satisfies`, which keeps each block's fixture
 * keys as literals — good for authoring (a typo in a variant id does not
 * compile) and useless for lookup by a string from a URL. This narrows once,
 * here, so consumers do not each reach for a cast.
 *
 * Returns `unknown`, which already includes "absent": an unrecognised variant
 * id comes back as `undefined`, and a caller has to narrow either way.
 */
export function blockFixture(type: SectionType, variantId: string): unknown {
    const fixtures = BLOCK_META[type].fixtures as Record<string, unknown>;
    return fixtures[variantId];
}

/** A block's variant ids, in the order the catalog should offer them. */
export function blockVariantIds(type: SectionType): string[] {
    return BLOCK_META[type].variants.map((v) => v.id);
}
