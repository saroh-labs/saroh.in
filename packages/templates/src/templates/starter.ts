import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `starter` — the first production template (v1).
 *
 * A small, responsive-intent marketing site: a Home page (hero → rich intro →
 * call-to-action → gallery) and an About page (hero → story). All copy is
 * derived from the business profile via content builders, so an org that has
 * only supplied its name still gets a complete, contract-valid site.
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

export const starterTemplate: TemplateManifest = {
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
