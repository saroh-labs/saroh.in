import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `starter` — the template a new site starts from.
 *
 * Two versions are registered, and both keep resolving (`registry.ts`): the
 * registry keys templates by `id@version`, and a shipped version is never
 * edited.
 *
 * - v1 ({@link starterTemplateV1}) speaks as a company ("We build products and
 *   experiences our customers love"), points at `/templates/starter/*.jpg`,
 *   which no app serves, so every site built from it opened with broken
 *   images, and with no contact email sends "Get in touch" to a `/contact`
 *   page it never makes. Kept as shipped, for the sites built from it.
 * - v2 ({@link starterTemplate}, DEC-070) reads for a business, a person
 *   working for themselves or someone showing their work, and carries no
 *   image at all: both heroes are the centred look, and v1's gallery gives way
 *   to words and a call to action. A photo is the merchant's to add. Every
 *   link it makes goes somewhere: an email, or its own About page.
 *
 * All copy is derived from the business profile via content builders, so an
 * org that has only supplied its name still gets a complete, contract-valid
 * site.
 */

export const STARTER_TEMPLATE_ID = "starter";

/** A contact link derived from the profile: mailto if we have an email, else a page. */
function contactHref(ctx: TemplateContext): string {
    return ctx.contactEmail ? `mailto:${ctx.contactEmail}` : "/contact";
}

/** A short lead line, preferring the tagline, then the description, then a default. */
function leadLine(ctx: TemplateContext): string {
    return (
        ctx.tagline ??
        ctx.description ??
        `Welcome to ${ctx.organizationName} — we're glad you're here.`
    );
}

/** `starter@1`, as it shipped. New sites start from v2. */
export const starterTemplateV1: TemplateManifest = {
    id: STARTER_TEMPLATE_ID,
    version: 1,
    name: "Starter",
    description:
        "A clean two-page starter site (Home + About) with a hero, intro copy, a call-to-action, and a gallery.",
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
                        heading: ctx.organizationName,
                        subheading: leadLine(ctx),
                        cta: {
                            label: "Get in touch",
                            href: contactHref(ctx),
                            style: "primary",
                        },
                        image: {
                            src: "/templates/starter/hero.jpg",
                            alt: `${ctx.organizationName} hero image`,
                        },
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>Welcome to ${ctx.organizationName}</h2>` +
                            `<p>${leadLine(ctx)} We build products and experiences ` +
                            `our customers love. Explore what we do and get in touch ` +
                            `when you're ready.</p>`,
                    }),
                },
                {
                    type: "cta",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        label: `Work with ${ctx.organizationName}`,
                        href: contactHref(ctx),
                        style: "primary",
                    }),
                },
                {
                    type: "gallery",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        layout: "grid",
                        images: [
                            {
                                src: "/templates/starter/gallery-1.jpg",
                                alt: `${ctx.organizationName} gallery image 1`,
                            },
                            {
                                src: "/templates/starter/gallery-2.jpg",
                                alt: `${ctx.organizationName} gallery image 2`,
                            },
                            {
                                src: "/templates/starter/gallery-3.jpg",
                                alt: `${ctx.organizationName} gallery image 3`,
                            },
                        ],
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
                    content: (ctx: TemplateContext) => ({
                        heading: `About ${ctx.organizationName}`,
                        subheading: leadLine(ctx),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>Our story</h2>` +
                            `<p>${ctx.legalName ?? ctx.organizationName} started with a ` +
                            `simple idea: do great work and treat people well. ` +
                            `Today we keep that promise for every customer.</p>`,
                    }),
                },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// v2 (DEC-070): the same two pages, in words that fit anyone, with no images.
// ---------------------------------------------------------------------------

/**
 * Escape text for the rich-text HTML it is woven into: a name like
 * "Rye & Co." is text, not markup. v1 interpolates raw and stays as shipped.
 */
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
 * Where "get in touch" goes. With an email, the email. Without one, the About
 * page this template makes: v1's `/contact` fallback named a page nobody had
 * made, which the pre-publish check flags as a broken link.
 */
function reachOut(ctx: TemplateContext): { label: string; href: string } {
    return ctx.contactEmail
        ? { label: "Get in touch", href: `mailto:${ctx.contactEmail}` }
        : { label: `About ${ctx.organizationName}`, href: "/about" };
}

export const starterTemplate: TemplateManifest = {
    id: STARTER_TEMPLATE_ID,
    version: 2,
    name: "Starter",
    description:
        "A clean two-page starter site (Home + About): a headline, a few words about the work, and a way to get in touch.",
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
                        // Named rather than left to the legacy rule: with no
                        // image, the hero is the centred look.
                        variant: "centered",
                        heading: ctx.organizationName,
                        subheading:
                            ownWords(ctx) ??
                            `Welcome — here's what ${ctx.organizationName} does.`,
                        cta: { ...reachOut(ctx), style: "primary" },
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            format: "html",
                            value:
                                `<h2>What ${escapeHtml(ctx.organizationName)} does</h2>` +
                                (own ? `<p>${escapeHtml(own)}</p>` : "") +
                                `<p>Have a look around to see the work, how it's ` +
                                `done and who it's for.</p>`,
                        };
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>Working together</h2>` +
                            `<p>It starts with a conversation: what you need, ` +
                            `when you need it and what good looks like. From ` +
                            `there, ${escapeHtml(ctx.organizationName)} keeps ` +
                            `you posted until it's done.</p>`,
                    }),
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
                            `<h2>How it started</h2>` +
                            `<p>${escapeHtml(ctx.legalName ?? ctx.organizationName)} ` +
                            `began with a simple idea: do good work, and treat ` +
                            `people well. That idea still shapes every piece of ` +
                            `work today.</p>`,
                    }),
                },
            ],
        },
    ],
};
