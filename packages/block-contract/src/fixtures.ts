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
    /**
     * Further examples of a look, for an optional part a block may carry that
     * is not a look of its own — the text block's photo (G7). Keyed by what
     * the case shows; each names one of the block's variants, and G4 parses
     * them exactly as it parses `fixtures`. The catalog's one example per look
     * stays in `fixtures`, so adding a case never moves a published snapshot.
     */
    cases?: Record<string, RenderedContent<T>>;
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
    {
        id: "fullBleed",
        label: "Full-bleed photo",
        description:
            "The photo fills the band edge to edge under a dark wash, with the headline, a line and the button over it. The site's menu sits over the photo when this hero opens the page.",
    },
    {
        id: "none",
        label: "No hero",
        description:
            "Just the page's heading and a line under it, small, for pages that go straight to a list.",
    },
] as const;

/** The single look a block has, when it honestly has one. */
function soleVariant(description: string): readonly [BlockVariant] {
    return [{ id: "default", label: "Default", description }] as const;
}

/**
 * The gallery fixture's images, shared by all three of its looks.
 *
 * One list, three variants: what changes between grid, carousel and masonry is
 * the arrangement, never the content. A catalog showing different pictures per
 * look would be demonstrating the wrong thing.
 */
const GALLERY_IMAGES = [
    {
        src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23d9cbb5'/%3E%3Crect x='80' y='330' width='640' height='150' fill='%23a8794c'/%3E%3Ccircle cx='250' cy='250' r='70' fill='%23c9a878'/%3E%3C/svg%3E",
        alt: "The counter at opening time",
    },
    {
        src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%232f2a26'/%3E%3Crect x='140' y='170' width='520' height='270' rx='16' fill='%23120f0d'/%3E%3Crect x='190' y='220' width='420' height='170' fill='%23e0913a'/%3E%3C/svg%3E",
        alt: "The deck oven mid-bake",
    },
] as const;

/**
 * The Projects fixture's work, shared by both of its looks (K11): what changes
 * between cards and list is the arrangement, never the content. The third
 * has no photo and the second no link, so the catalog shows that a project
 * missing either draws without a gap.
 */
const PROJECT_ITEMS = [
    {
        image: {
            src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23dfe4ea'/%3E%3Crect x='120' y='120' width='560' height='360' rx='12' fill='%23ffffff'/%3E%3Crect x='160' y='170' width='220' height='24' rx='6' fill='%234b5b6b'/%3E%3Crect x='160' y='220' width='480' height='200' rx='8' fill='%23b7c3cf'/%3E%3C/svg%3E",
            alt: "The new booking page for a physiotherapy clinic, on a laptop",
            width: 800,
            height: 600,
        },
        title: "A booking site for a physio clinic",
        summary:
            "Three clinics, one page to book from. Online bookings doubled in the first month.",
        link: "https://example.com/physio-clinic",
    },
    {
        image: {
            src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23efe3d3'/%3E%3Crect x='250' y='90' width='300' height='420' rx='10' fill='%23c9784a'/%3E%3Crect x='290' y='150' width='220' height='30' rx='6' fill='%23fff6ea'/%3E%3C/svg%3E",
            alt: "The cover of a printed menu, in terracotta",
            width: 800,
            height: 600,
        },
        title: "Menus and signs for a bakery",
        summary: "A printed menu, a window sign and a price board.",
    },
    {
        title: "Writing: how I price a small job",
        summary: "A short piece on quoting for work that takes a day or less.",
        link: "/blog/pricing-a-small-job",
    },
] as const;

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
            fullBleed: {
                variant: "fullBleed",
                heading: "Bread, the slow way",
                subheading:
                    "Sourdough and rye from a wood-fired oven, out by seven every morning.",
                cta: {
                    label: "See what's on the counter",
                    href: "/shop",
                    style: "link",
                    action: { kind: "page" },
                },
                image: {
                    src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'%3E%3Crect width='1600' height='900' fill='%236b5a48'/%3E%3Crect y='560' width='1600' height='340' fill='%233d3128'/%3E%3Cellipse cx='520' cy='560' rx='260' ry='120' fill='%23c8a06a'/%3E%3Cellipse cx='1000' cy='580' rx='220' ry='100' fill='%23b88c58'/%3E%3C/svg%3E",
                    alt: "Loaves cooling on the counter in morning light",
                    width: 1600,
                    height: 900,
                },
                onToday: true,
            },
            none: {
                variant: "none",
                heading: "Writing",
                subheading:
                    "Notes on building small things, about once a month.",
            },
        },
        cases: {
            // A slot shipped as a brief (KTD-5): no photo yet, so the live
            // site draws the band without one.
            brief: {
                variant: "fullBleed",
                heading: "Bread, the slow way",
                imageBrief:
                    "Morning light on the counter, loaves stacked, steam rising",
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
        cases: {
            // The text beside one photo (G7), on the left to show the side
            // that is not the default.
            photo: {
                variant: "default",
                format: "html",
                value: "<h2>About the bakery</h2><p>We have been on the same corner since 1998.</p>",
                image: {
                    src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23d9cbb5'/%3E%3Crect x='80' y='330' width='640' height='150' fill='%23a8794c'/%3E%3Ccircle cx='250' cy='250' r='70' fill='%23c9a878'/%3E%3C/svg%3E",
                    alt: "The bakery counter at opening time",
                    width: 800,
                    height: 600,
                },
                imageSide: "left",
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
        /*
         * These were the `layout` field until #254 folded it into `variant`.
         * `grid` is FIRST because it is the least demanding look, and the first
         * entry is what an unrecognised variant falls back to.
         */
        variants: [
            {
                id: "grid",
                label: "Grid",
                description:
                    "Even rows and columns. The safe choice for a mixed set of shapes.",
            },
            {
                id: "carousel",
                label: "Carousel",
                description:
                    "One horizontal row that scrolls and snaps. Keeps a long set to one screen.",
            },
            {
                id: "masonry",
                label: "Masonry",
                description:
                    "Columns that keep each image's own proportions rather than cropping to a grid.",
            },
        ] as const,
        fixtures: {
            grid: { variant: "grid", images: [...GALLERY_IMAGES] },
            carousel: { variant: "carousel", images: [...GALLERY_IMAGES] },
            masonry: { variant: "masonry", images: [...GALLERY_IMAGES] },
        },
        cases: {
            // A line under each photo (U2), as the studio design writes them.
            captions: {
                variant: "grid",
                images: GALLERY_IMAGES.map((image, i) => ({
                    ...image,
                    caption: i === 0 ? "The counter, 6am" : "The deck oven",
                })),
            },
            // The same lines on a bounded band over each photo (DEC-090).
            captionsOver: {
                variant: "grid",
                captionPlacement: "over",
                images: GALLERY_IMAGES.map((image, i) => ({
                    ...image,
                    caption: i === 0 ? "The counter, 6am" : "The deck oven",
                })),
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
    features: {
        label: "Features",
        description:
            "A heading over a set of short, titled points — what you do, or what a visitor gets.",
        /*
         * `grid` is first because it is the least demanding look, and the first
         * entry is what an unrecognised variant falls back to (#254). Both
         * looks draw the same content; neither needs anything the other does
         * not, which is what makes them variants rather than separate blocks.
         */
        variants: [
            {
                id: "grid",
                label: "Grid",
                description:
                    "Points side by side in columns. Reads as a summary — best for three to six short ones.",
            },
            {
                id: "list",
                label: "List",
                description:
                    "Points stacked in one column, each with room to explain itself. Better when the copy is longer than a line.",
            },
            {
                id: "steps",
                label: "Numbered steps",
                description:
                    "Points stacked in one column, each numbered 01, 02, 03 beside its title, for something done in order.",
            },
        ] as const,
        fixtures: {
            grid: {
                variant: "grid",
                heading: "Why buy from us",
                items: [
                    {
                        title: "Stocked, not ordered in",
                        body: "Around nine hundred lines sit in our own warehouse, so a same-day order is a real thing rather than a promise.",
                    },
                    {
                        title: "Trade accounts",
                        body: "Order monthly and open a 30-day account. Tiered pricing applies from the second order.",
                    },
                    {
                        title: "Cut to size",
                        body: "Bulk and custom runs quoted within one working day.",
                    },
                ],
            },
            list: {
                variant: "list",
                heading: "How ordering works",
                intro: "Three steps, and the second one is us.",
                items: [
                    {
                        title: "Tell us what you need",
                        body: "By phone, or through the form on this site. A part number helps; a photograph does too.",
                    },
                    {
                        title: "We quote within a working day",
                        body: "Including whether it is in stock, and what it costs to get it to you.",
                    },
                    {
                        title: "Order by 2pm, it goes the same day",
                        body: "Anything stocked. Custom runs get their own date, agreed before you commit.",
                    },
                ],
            },
            steps: {
                variant: "steps",
                heading: "How I work",
                intro: "Three stages, and the whole of the first one is listening.",
                items: [
                    {
                        title: "We talk first",
                        body: "What you eat, when, who cooks it, and what has already been tried.",
                    },
                    {
                        title: "We change three things",
                        body: "Not thirty. Three changes you can make, written down in plain language.",
                    },
                    {
                        title: "We check in",
                        body: "To see what held and what did not, and change the ones that did not.",
                    },
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
                // The id belongs to no Service, so previews (the catalog, the
                // editor's Add-section picker) hand the widget sample open
                // times instead of fetching (#267); the G5 snapshot stubs the
                // fetch and shows the "no times" state.
                serviceId: "fixture-service",
                title: "Book a table",
                description: "Lunch and dinner, seven days a week.",
                submitLabel: "Confirm booking",
                successMessage: "Booked. A confirmation is on its way.",
            },
        },
    },
    /*
     * #255's three content blocks. One look each: the design system is about to
     * change, so these ship functional first. A second look is a variant added
     * later, not a new block.
     */
    faq: {
        label: "FAQ",
        description:
            "Questions a visitor would otherwise call to ask, each answer one tap away.",
        variants: soleVariant(
            "Questions stacked in one column; each opens to show its answer.",
        ),
        fixtures: {
            default: {
                variant: "default",
                heading: "Questions we get asked",
                items: [
                    {
                        question: "Do you deliver outside the city?",
                        answer: "Yes, anywhere on the mainland. Orders over £150 go free; below that it is a flat £12.",
                    },
                    {
                        question: "Can I collect instead?",
                        answer: "From the trade counter, Monday to Saturday. We text you when it is ready.",
                    },
                    {
                        question: "Do you take returns?",
                        answer: "Unopened stock within 30 days, with the receipt.\nCut-to-size and custom runs can't be returned.",
                    },
                ],
            },
        },
    },
    testimonials: {
        label: "Testimonials",
        description:
            "What customers said, in their words and under their names.",
        variants: soleVariant(
            "Quotes side by side in columns, one column on a phone.",
        ),
        fixtures: {
            default: {
                variant: "default",
                heading: "What our customers say",
                items: [
                    {
                        quote: "Ordered at eleven, on site by three. That's why we stopped shopping around.",
                        name: "Priya Shah",
                        role: "Site manager, Shah & Sons Builders",
                    },
                    {
                        quote: "They told me the cheaper part would do the job. It did.",
                        name: "Tom Ellis",
                    },
                    {
                        quote: "The trade account paid for itself in the second month.",
                        name: "Grace Obi",
                        role: "Customer since 2019",
                    },
                ],
            },
        },
    },
    contact: {
        label: "Contact",
        description:
            "Where to find you and how to reach you: address, hours, phone, email and WhatsApp.",
        variants: soleVariant(
            "Address and hours beside a list of ways to get in touch.",
        ),
        fixtures: {
            default: {
                variant: "default",
                heading: "Visit or get in touch",
                intro: "The trade counter is at the back of the yard.",
                address: "Unit 4, Riverside Trade Park\nLeeds LS10 1AB",
                hours: "Mon–Fri 7:30–17:00\nSat 8:00–12:00\nSun closed",
                // Ofcom's drama range and a reserved domain: never a real
                // business's number or inbox.
                phone: "+44 113 496 0000",
                email: "hello@example.com",
                whatsapp: "+44 7700 900000",
            },
        },
    },
    servicesList: {
        label: "Services",
        description:
            "Your bookable services with their duration and price, kept current from Appointments.",
        variants: soleVariant(
            "Services in a list, each with its duration and price.",
        ),
        fixtures: {
            default: {
                variant: "default",
                heading: "Services",
                intro: "Book online; we confirm by email straight away.",
                // Ids that belong to no Service: the catalog and the snapshot
                // hand the component sample services instead of fetching.
                serviceIds: [
                    "fixture-cut",
                    "fixture-colour",
                    "fixture-consult",
                ],
                cta: {
                    label: "Book now",
                    href: "/book",
                    style: "primary",
                    action: { kind: "page" },
                },
            },
        },
    },
    visitUs: {
        label: "Visit us",
        description:
            "One shop's address, opening hours and phone, with Open now and Get directions, read live from the storefront.",
        variants: soleVariant(
            "A card with the address and the week's hours, a call button and a directions link.",
        ),
        fixtures: {
            default: {
                variant: "default",
                title: "Come and see us",
                // An id that belongs to no storefront: the catalog and the
                // snapshot hand the component a sample place instead.
                storeId: "fixture-shop",
            },
        },
    },
    journal: {
        label: "Journal",
        description:
            "The site's latest published posts, newest first, read live from the posts the site owns.",
        variants: [
            {
                id: "default",
                label: "Latest posts",
                description:
                    "Cards with a photo, the author and date, the title and an excerpt, linking to each post.",
            },
            {
                id: "archive",
                label: "Archive",
                description:
                    "Every published post as a dated list: the date in a column, the title and its line beside it.",
            },
        ] as const,
        fixtures: {
            // The catalog and the snapshot hand the component sample posts.
            default: { variant: "default", title: "Journal", count: 3 },
            archive: { variant: "archive", title: "All writing" },
        },
        cases: {
            // Two rows, words only: the switches off and the larger count.
            plain: {
                variant: "default",
                title: "From the kitchen",
                count: 6,
                showExcerpts: false,
                showImages: false,
            },
        },
    },
    plans: {
        label: "Plans",
        description:
            "The business's subscription plans on sale, with price and how often, read live from Payments.",
        variants: soleVariant(
            "Cards with how often, the plan's name, its description and price, and a button; the first can be highlighted.",
        ),
        fixtures: {
            // The catalog and the snapshot hand the component sample plans.
            default: { variant: "default", title: "Memberships" },
        },
        cases: {
            // No highlight, no descriptions, the merchant's own button.
            plain: {
                variant: "default",
                title: "Bread every week",
                highlight: "none",
                buttonLabel: "Ask to join",
                showDescriptions: false,
            },
        },
    },
    productGrid: {
        label: "Product grid",
        description:
            "Products from the catalogue, the newest, a collection's or hand-picked, read live from the storefront the site sells from.",
        variants: [
            {
                id: "default",
                label: "Even grid",
                description:
                    "Cards with a photo, the options it comes in, the name, a line about it and the price, each opening its product page.",
            },
            {
                id: "lead",
                label: "Lead piece",
                description:
                    "The first product takes twice the room, with tall photos and the price set large. One column on a phone.",
            },
            {
                id: "plates",
                label: "Plates",
                description:
                    "Photos in fixed-height cells with hairlines between, the first twice the room; the name, a line and a small price sit on a band over each photo.",
            },
        ] as const,
        fixtures: {
            // The catalog and the snapshot hand the component sample products.
            default: { variant: "default", title: "From the counter" },
            lead: { variant: "lead", title: "On the counter today" },
            plates: { variant: "plates", title: "Current collection" },
        },
        cases: {
            // Hand-picked, two of them, no prices.
            picked: {
                variant: "default",
                title: "Our favourites",
                source: "picked",
                productIds: ["sample-sourdough", "sample-croissant"],
                count: 2,
                showPrices: false,
            },
        },
    },
    packs: {
        label: "Class packs",
        description:
            "The business's class packs on sale, with how many classes, how long they last and the price, read live.",
        variants: soleVariant(
            "Cards with how many classes and for how long, the pack's name, its price per class and price, and a button.",
        ),
        fixtures: {
            // The catalog and the snapshot hand the component sample packs.
            default: { variant: "default", title: "Class packs" },
        },
        cases: {
            // No descriptions, the merchant's own button.
            plain: {
                variant: "default",
                title: "Packs",
                buttonLabel: "Get this pack",
                showDescriptions: false,
            },
        },
    },
    projects: {
        label: "Projects",
        description:
            "Your own work, each with a photo, a title, a line about it and a link to more.",
        /*
         * `cards` is first because it is the least demanding look, and the
         * first entry is what an unrecognised variant falls back to (#254).
         * The ids are `LIST_LAYOUTS`, the words the other list blocks' Show
         * as uses (G16).
         */
        variants: [
            {
                id: "cards",
                label: "Cards",
                description:
                    "Projects side by side, each with its photo on top. Best when most have a photo.",
            },
            {
                id: "list",
                label: "List",
                description:
                    "One project per row, the photo on the left. Better for a longer line about each.",
            },
        ] as const,
        fixtures: {
            cards: {
                variant: "cards",
                title: "Selected work",
                items: PROJECT_ITEMS.map((item) => ({ ...item })),
            },
            list: {
                variant: "list",
                title: "Selected work",
                items: PROJECT_ITEMS.map((item) => ({ ...item })),
            },
        },
        cases: {
            // A line under each photo (U2), and a slot shipped as a brief.
            captions: {
                variant: "cards",
                title: "Selected work",
                items: [
                    { ...PROJECT_ITEMS[0], caption: "Photographed on site" },
                    {
                        title: "A shopfront in Bandra",
                        imageBrief: "The finished shopfront at dusk",
                    },
                ],
            },
            // Title and caption over the photo, the studio's work (DEC-090).
            captionsOver: {
                variant: "cards",
                title: "Selected work",
                captionPlacement: "over",
                items: [
                    { ...PROJECT_ITEMS[0], caption: "Photographed on site" },
                ],
            },
        },
    },
    timetable: {
        label: "Timetable",
        description:
            "The week's classes, day by day, with who takes each and the places left, read live from the booking page.",
        /*
         * `grid` first: it is the design's look, and it becomes the list on a
         * phone anyway, so neither demands more content than the other.
         */
        variants: [
            {
                id: "grid",
                label: "Week grid",
                description:
                    "Days across, times down, each class in its cell with who takes it and the places left. Day by day on a phone.",
            },
            {
                id: "list",
                label: "Day by day",
                description:
                    "Each day in turn, its classes one per row. Better for a short week.",
            },
        ] as const,
        fixtures: {
            // The catalog and the snapshot hand the component a sample week.
            grid: { variant: "grid", title: "This week" },
            list: { variant: "list", title: "This week" },
        },
    },
    hours: {
        label: "Opening hours",
        description:
            "The week's opening hours as a table, read live from Settings › Hours. Closed days are said, not left out.",
        variants: soleVariant(
            "A table of the seven days and their hours, today marked, closed days muted but stated.",
        ),
        fixtures: {
            // The catalog and the snapshot hand the component a sample week.
            default: { variant: "default", title: "Opening hours" },
        },
    },
    person: {
        label: "Person",
        description:
            "One practitioner: a photo, their name, what they do, their qualifications and a few lines about them.",
        variants: soleVariant(
            "The photo beside the words, stacking on a phone; qualifications as a list.",
        ),
        fixtures: {
            default: {
                variant: "default",
                image: {
                    src: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'%3E%3Crect width='800' height='1000' fill='%23d8d2c4'/%3E%3Ccircle cx='400' cy='380' r='150' fill='%23a89a84'/%3E%3Crect x='200' y='580' width='400' height='420' rx='180' fill='%238a7d68'/%3E%3C/svg%3E",
                    alt: "Portrait of the dietician at her desk",
                    width: 800,
                    height: 1000,
                },
                name: "Dr Anika Rao",
                role: "Clinical dietician",
                credentials: [
                    "MSc Clinical Nutrition",
                    "Registered Dietitian",
                    "12 years in hospital practice",
                ],
                bio: "I help people eat for the conditions they live with: diabetes, PCOS, kidney care.\nEvery plan starts with what you already cook.",
                cta: {
                    label: "Book a consultation",
                    href: "/book",
                    style: "primary",
                    action: { kind: "page" },
                },
            },
        },
        cases: {
            // Words only, as a template ships it before the photo (KTD-5).
            brief: {
                variant: "default",
                imageBrief: "A plain portrait, natural light, at the desk",
                name: "Dr Anika Rao",
                role: "Clinical dietician",
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
