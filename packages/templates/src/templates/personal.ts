import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `personal` — the Personal/consultant template (DEC-070, K14): a site for
 * someone who works for themselves. Three pages: Home (a headline, how they
 * work, what they offer and a way to get in touch), About, and Contact (an
 * enquiry form).
 *
 * "What they offer" is the business's real Services, read live
 * (`servicesList`), when Appointments is on and there is a service to list.
 * Otherwise it is a `features` block of placeholder offers the owner writes
 * over, so a site never lists services a business doesn't take bookings for,
 * and never draws a services heading over nothing.
 *
 * Copy is written about the owner by name, never "we" or "our", so a person
 * or a small firm reads it the same, and every placeholder line says what to
 * write there rather than claiming anything. No images: a photo is the
 * owner's to add (the pre-publish check flags one with no description).
 */

export const PERSONAL_TEMPLATE_ID = "personal";

/** The module key that makes Services bookable (`module-registry.ts`). */
const APPOINTMENTS = "APPOINTMENTS";

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

/**
 * What the template reads from its context beyond the base fields.
 *
 * `modules` (the business's switched-on module keys) and `serviceIds` (its
 * services a new site may list, in order) arrive with K15, which owns
 * `TemplateContext` and `buildTemplateContext`. Until then they are read
 * defensively: absent, or not an array of strings, means "not known", and
 * the template lays down the placeholder offers.
 */
type PersonalContext = TemplateContext & {
    modules?: unknown;
    serviceIds?: unknown;
};

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

/**
 * The services the Home page lists, or none. Only with Appointments on, as
 * the services list is a booking surface, and only services the context
 * names: the block's contract needs at least one, and a template cannot
 * invent an id.
 */
export function personalServiceIds(ctx: TemplateContext): string[] {
    const { modules, serviceIds } = ctx as PersonalContext;
    if (!stringList(modules).includes(APPOINTMENTS)) return [];
    return [...new Set(stringList(serviceIds))].slice(0, SERVICES_LIST_MAX);
}

/** Escape text for the rich-text HTML it is woven into: a name is text, not markup. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** What the owner has said about themselves, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/**
 * Where "get in touch" goes: the email when there is one, else this
 * template's own Contact page, which always exists.
 */
function reachOut(ctx: TemplateContext): { label: string; href: string } {
    return ctx.contactEmail
        ? { label: "Get in touch", href: `mailto:${ctx.contactEmail}` }
        : { label: "Get in touch", href: "/contact" };
}

/** The enquiry form's fields, as the Contact page's own form asks them. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
        name: "message",
        label: "What do you need?",
        type: "textarea",
        required: true,
    },
] as const;

export const personalTemplate: TemplateManifest = {
    id: PERSONAL_TEMPLATE_ID,
    version: 1,
    name: "Personal",
    description:
        "A site for someone who works for themselves (Home, About and Contact): who you are, how you work, what you offer and a form to get in touch.",
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "centered",
                        heading: ctx.organizationName,
                        subheading:
                            ownWords(ctx) ??
                            `Welcome — here's how ${ctx.organizationName} can help.`,
                        cta: { ...reachOut(ctx), style: "primary" },
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        heading: "How it works",
                        items: [
                            {
                                title: "A first conversation",
                                body: "Say how someone first reaches you, and what that first talk covers.",
                            },
                            {
                                title: "A plan",
                                body: "Say what you agree together: the work, the timing and the price.",
                            },
                            {
                                title: "The work",
                                body: "Say how you keep people posted until it's done.",
                            },
                        ],
                    },
                },
                {
                    // The business's real Services, read live, with Appointments on.
                    type: "servicesList",
                    contractVersion: 1,
                    when: (ctx: TemplateContext) =>
                        personalServiceIds(ctx).length > 0,
                    content: (ctx: TemplateContext) => ({
                        heading: "What you can book",
                        serviceIds: personalServiceIds(ctx),
                        showPrices: true,
                        layout: "cards",
                        buttonLabel: "Choose a time",
                    }),
                },
                {
                    // Otherwise, offers the owner writes over.
                    type: "features",
                    contractVersion: 1,
                    when: (ctx: TemplateContext) =>
                        personalServiceIds(ctx).length === 0,
                    content: {
                        heading: "What you can ask for",
                        items: [
                            {
                                title: "Your first offer",
                                body: "Name something you do, who it's for and what they come away with.",
                            },
                            {
                                title: "Your second offer",
                                body: "Another thing you do. Remove this one if you only offer one.",
                            },
                        ],
                    },
                },
                {
                    type: "cta",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        ...reachOut(ctx),
                        style: "primary",
                    }),
                },
            ],
        },
        {
            path: "/about",
            title: "About",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            variant: "centered",
                            heading: `About ${ctx.organizationName}`,
                            ...(own ? { subheading: own } : {}),
                        };
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>About ${escapeHtml(ctx.legalName ?? ctx.organizationName)}</h2>` +
                            `<p>Write a few lines about yourself: what you do, ` +
                            `how long you've done it and who you like working ` +
                            `with.</p>` +
                            `<p>Then say what someone can expect when they get ` +
                            `in touch.</p>`,
                    }),
                },
            ],
        },
        {
            path: "/contact",
            title: "Contact",
            sections: [
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        title: `Get in touch with ${ctx.organizationName}`,
                        description:
                            "Say a little about what you need, and how to reach you.",
                        submitLabel: "Send",
                        successMessage: "Thanks. Your message has been sent.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    }),
                },
            ],
        },
    ],
};
