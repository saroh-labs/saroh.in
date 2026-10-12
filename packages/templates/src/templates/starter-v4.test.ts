import {
    DEFAULT_FONT_PAIR,
    isFontPairKey,
    PALETTE_ROLES,
    parsePalette,
    parseSectionContent,
    parseTypeScale,
} from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext } from "../manifest";
import { templateFooterLineFor, templateModulePageKinds } from "../manifest";
import { isOwnerNote, templatePlaceholderIn } from "../placeholders";
import { getTemplate } from "../registry";
import { personalTemplate } from "./personal";
import { portfolioTemplate } from "./portfolio";
import { HERO_PROMPT, STARTER_TEMPLATE_ID } from "./starter";
import { STARTER_STYLES } from "./starter-look";
import {
    STARTER_IMAGE_BRIEFS,
    starterLine,
    starterPrimaryAction,
    starterTemplate,
} from "./starter-v4";

/** A business with nothing switched on and nothing said about it. */
const plain: TemplateContext = {
    organizationName: "Asha Rao",
    modules: ["WEBSITE"],
    serviceIds: [],
    sells: false,
};

/** A salon: bookings, a place with hours, a line from its services. */
const salon: TemplateContext = {
    organizationName: "Kesar Salon",
    description: "Haircut, Colour and Bridal styling in Bengaluru",
    contactEmail: "kesarsalon@example.com",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_cut", "svc_colour", "svc_bridal"],
    sells: false,
    area: "Bengaluru",
    hasPlace: true,
    hasHours: true,
};

/** A shop: sells, no bookings, no place customers visit. */
const shop: TemplateContext = {
    organizationName: "Rye & Co.",
    description: "Breads, Cakes and Cookies in Pune",
    modules: ["WEBSITE", "COMMERCE"],
    serviceIds: [],
    sells: true,
    area: "Pune",
};

/** A studio with everything on. */
const everything: TemplateContext = {
    organizationName: "Forge Strength",
    description: "Barbell, Conditioning and Mobility in Mumbai",
    contactEmail: "forge@example.com",
    modules: ["WEBSITE", "APPOINTMENTS", "COMMERCE", "PAYMENTS", "CLASS_PACKS"],
    serviceIds: ["svc_barbell", "svc_conditioning"],
    sells: true,
    hasClasses: true,
    area: "Mumbai",
    hasPlace: true,
    hasHours: true,
};

const profiles: [string, TemplateContext][] = [
    ["a business with nothing switched on", plain],
    ["a salon that takes bookings", salon],
    ["a shop", shop],
    ["a business with everything on", everything],
    ["only a name", { organizationName: "Acme" }],
    ["hours and no address", { ...plain, hasPlace: false, hasHours: true }],
    [
        "Appointments on with no service yet",
        { ...plain, modules: ["APPOINTMENTS"] },
    ],
    [
        "a name with markup in it",
        { ...salon, organizationName: 'Rye <b>&</b> "Co."' },
    ],
];

function home(ctx: TemplateContext) {
    const page = instantiateTemplate(starterTemplate, ctx).pages[0];
    return page;
}

const types = (ctx: TemplateContext) => home(ctx).sections.map((s) => s.type);

/** Every string a visitor would read: briefs, links and photos left out. */
function visitorStrings(value: unknown, key = ""): string[] {
    if (typeof value === "string") {
        return ["imageBrief", "src", "alt", "href", "variant"].includes(key)
            ? []
            : [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap((v) => visitorStrings(v, key));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => visitorStrings(v, k));
    }
    return [];
}

/** A text block's pieces of text, between its tags. */
function pieces(html: string): string[] {
    return html
        .split(/<[^>]*>/)
        .map((t) => t.trim())
        .filter((t) => t !== "");
}

describe("starter@4 (DEC-141)", () => {
    it("is the starter new sites start from, beside the three before it", () => {
        expect(starterTemplate.id).toBe(STARTER_TEMPLATE_ID);
        expect(starterTemplate.version).toBe(4);
        expect(getTemplate(STARTER_TEMPLATE_ID)).toBe(starterTemplate);
        for (const version of [1, 2, 3]) {
            expect(getTemplate(STARTER_TEMPLATE_ID, version)?.version).toBe(
                version,
            );
        }
        // Not a gallery template: the gallery shows the industry designs.
        expect(starterTemplate.kinds).toBeUndefined();
        expect(starterTemplate.sample).toBeUndefined();
    });

    it.each(profiles)(
        "instantiates, and every section passes its contract, for %s",
        (_label, ctx) => {
            const { pages } = instantiateTemplate(starterTemplate, ctx);
            expect(pages.filter((p) => p.isHome)).toHaveLength(1);
            for (const page of pages) {
                expect(page.sections.length).toBeGreaterThan(0);
                for (const section of page.sections) {
                    const parsed = parseSectionContent(
                        section.type,
                        section.contractVersion,
                        section.content,
                    );
                    expect(parsed.success).toBe(true);
                }
                // One h1 a page: its first section's, and only that one.
                expect(page.sections[0]?.type).toBe("hero");
                expect(
                    page.sections.filter((s) => s.type === "hero"),
                ).toHaveLength(1);
            }
        },
    );

    it("tolerates a malformed context, laying down nothing that needs it", () => {
        const odd = {
            organizationName: "Acme",
            modules: "APPOINTMENTS",
            serviceIds: [1, null, ""],
            sells: "yes",
        } as unknown as TemplateContext;
        expect(types(odd)).toEqual(["hero", "enquiry"]);
    });
});

describe("starter@4 — sections for what is switched on", () => {
    it("is a headline and a way to get in touch when nothing is on", () => {
        expect(types(plain)).toEqual(["hero", "enquiry"]);
    });

    it("is a salon's Home: services, what to know, the place, the action", () => {
        expect(types(salon)).toEqual([
            "hero",
            "servicesList",
            "features",
            "visitUs",
            "cta",
        ]);
    });

    it("is a shop's Home: the products, what to know, the action", () => {
        expect(types(shop)).toEqual(["hero", "productGrid", "features", "cta"]);
    });

    it("lays everything down, in order, when everything is on", () => {
        expect(types(everything)).toEqual([
            "hero",
            "productGrid",
            "servicesList",
            "timetable",
            "plans",
            "packs",
            "features",
            "visitUs",
            "cta",
        ]);
    });

    it.each([
        ["the product grid", "productGrid", shop, { ...shop, sells: false }],
        [
            "the product grid (Commerce off, whatever the shop says)",
            "productGrid",
            shop,
            { ...shop, modules: ["WEBSITE"] },
        ],
        [
            "the services list",
            "servicesList",
            salon,
            { ...salon, modules: ["WEBSITE"] },
        ],
        [
            "the services list (no service to name)",
            "servicesList",
            salon,
            { ...salon, serviceIds: [] },
        ],
        [
            "the timetable",
            "timetable",
            everything,
            { ...everything, hasClasses: false },
        ],
        [
            "plans",
            "plans",
            everything,
            {
                ...everything,
                modules: everything.modules?.filter((m) => m !== "PAYMENTS"),
            },
        ],
        [
            "class packs",
            "packs",
            everything,
            {
                ...everything,
                modules: everything.modules?.filter((m) => m !== "CLASS_PACKS"),
            },
        ],
        ["the place", "visitUs", salon, { ...salon, hasPlace: false }],
    ] satisfies [string, string, TemplateContext, TemplateContext][])(
        "lays down %s only when it is on",
        (_l, type, on, off) => {
            expect(types(on)).toContain(type);
            expect(types(off)).not.toContain(type);
        },
    );

    it("shows the week alone where there are hours and no address", () => {
        const ctx = { ...plain, hasHours: true };
        expect(types(ctx)).toEqual(["hero", "hours", "enquiry"]);
        // Never both: Visit us shows the week itself.
        expect(types(salon)).not.toContain("hours");
    });

    it("lists the services the context names, once each, and no more than a list holds", () => {
        const many = Array.from({ length: 30 }, (_, i) => `svc_${i}`);
        const list = home({
            ...salon,
            serviceIds: ["a", "a", ...many],
        }).sections.find((s) => s.type === "servicesList")?.content as {
            serviceIds: string[];
        };
        expect(list.serviceIds).toHaveLength(24);
        expect(new Set(list.serviceIds).size).toBe(24);
    });

    it("says what a visitor can do only from what is on, and only with two or more", () => {
        const facts = (ctx: TemplateContext) =>
            (
                home(ctx).sections.find((s) => s.type === "features")
                    ?.content as { items: { title: string }[] } | undefined
            )?.items.map((i) => i.title);
        expect(facts(plain)).toBeUndefined();
        expect(facts(salon)).toEqual([
            "Book online",
            "In Bengaluru",
            "Ask a question",
        ]);
        expect(facts(shop)).toEqual(["Order online", "Ask a question"]);
        expect(facts({ ...plain, hasPlace: true })).toEqual([
            "Come by",
            "Ask a question",
        ]);
    });

    it("lays down no testimonials: it has none that are real", () => {
        for (const [, ctx] of profiles) {
            expect(types(ctx)).not.toContain("testimonials");
        }
    });
});

describe("starter@4 — one primary action", () => {
    it.each([
        ["takes bookings", salon, "book", "Book a time", "/book"],
        ["sells", shop, "shop", "Browse the shop", "/shop"],
        ["does neither", plain, "contact", "Get in touch", "/contact"],
        // The header's button chooses bookings first; so does the page.
        ["does both", everything, "book", "Book a time", "/book"],
    ] as const)("is %s: %s", (_label, ctx, kind, label, href) => {
        expect(starterPrimaryAction(ctx)).toEqual({ kind, label, href });
    });

    it.each(profiles)(
        "puts the same action on the hero and the closing section, for %s",
        (_label, ctx) => {
            const action = starterPrimaryAction(ctx);
            for (const page of instantiateTemplate(starterTemplate, ctx)
                .pages) {
                const hero = page.sections[0]?.content as {
                    cta?: { label: string; href: string };
                };
                if (page.isHome) {
                    expect(hero.cta).toMatchObject({
                        label: action.label,
                        href: action.href,
                    });
                }
                const last = page.sections[page.sections.length - 1];
                if (last.type === "enquiry") {
                    // Where a message is the action, Home ends in the form
                    // itself: a band asking for one above it would ask twice.
                    expect(page.isHome).toBe(true);
                    expect(action.kind).toBe("contact");
                    continue;
                }
                // The closing band: the call-to-action block, which writes
                // its own heading and line from where its button goes.
                expect(last.type).toBe("cta");
                expect(last.content).toEqual({
                    label: action.label,
                    href: action.href,
                    style: "primary",
                });
            }
        },
    );

    it("goes to the Contact page it always starts with, when a message is the action", () => {
        expect(starterPrimaryAction(plain).href).toBe("/contact");
        expect(templateModulePageKinds(starterTemplate, plain)).toContain(
            "CONTACT",
        );
    });

    it("has no other button on a page: one in the hero, one closing band", () => {
        for (const [, ctx] of profiles) {
            for (const page of instantiateTemplate(starterTemplate, ctx)
                .pages) {
                const bands = page.sections.filter((s) => s.type === "cta");
                expect(bands.length).toBeLessThanOrEqual(1);
                if (bands.length === 1) {
                    expect(page.sections[page.sections.length - 1]).toBe(
                        bands[0],
                    );
                }
            }
        }
    });
});

describe("starter@4 — nothing that is not true of the business", () => {
    it("uses the business's own line under its name, and on About", () => {
        const [homePage, about] = instantiateTemplate(
            starterTemplate,
            salon,
        ).pages;
        expect(homePage.sections[0].content).toMatchObject({
            heading: "Kesar Salon",
            subheading: "Haircut, Colour and Bridal styling in Bengaluru",
        });
        expect(about.path).toBe("/about");
        expect(about.sections[0].content).toMatchObject({
            variant: "none",
            heading: "About Kesar Salon",
            subheading: "Haircut, Colour and Bridal styling in Bengaluru",
        });
    });

    it("prefers the owner's own tagline to the composed line", () => {
        expect(starterLine({ ...salon, tagline: "Hair, done properly." })).toBe(
            "Hair, done properly.",
        );
    });

    it("leaves the line out when nothing is known, never a prompt", () => {
        const hero = home(plain).sections[0]?.content as Record<
            string,
            unknown
        >;
        expect(hero).not.toHaveProperty("subheading");
        // Even if the old prompt is handed back in as the business's line.
        expect(
            starterLine({ ...plain, description: HERO_PROMPT }),
        ).toBeUndefined();
        expect(
            home({ ...plain, tagline: HERO_PROMPT }).sections[0]?.content,
        ).not.toHaveProperty("subheading");
    });

    it("makes no About page with nothing true to put on it", () => {
        const paths = (ctx: TemplateContext) =>
            instantiateTemplate(starterTemplate, ctx).pages.map((p) => p.path);
        expect(paths(plain)).toEqual(["/"]);
        expect(paths(salon)).toEqual(["/", "/about"]);
        // A line but one fact is a heading over one row: not a page.
        expect(
            paths({
                ...plain,
                description: "Tax returns and bookkeeping",
                area: "Pune",
            }),
        ).toEqual(["/"]);
    });

    it("lists only the business's own facts on About, escaped as text", () => {
        const about = instantiateTemplate(starterTemplate, {
            ...salon,
            area: "Navi <Mumbai>",
        }).pages[1]?.sections[1]?.content as { value: string };
        expect(about.value).toContain(
            "<dt>Where</dt><dd>Navi &lt;Mumbai&gt;</dd>",
        );
        expect(about.value).toContain("<dt>Booking</dt>");
        expect(about.value).toContain("kesarsalon@example.com");
        expect(about.value).not.toContain("<dt>Shop</dt>");
    });

    it.each(profiles)(
        "puts no note to the owner, placeholder or stock sentence in front of a visitor, for %s",
        (_label, ctx) => {
            const sections = instantiateTemplate(
                starterTemplate,
                ctx,
            ).pages.flatMap((p) => p.sections);
            for (const text of visitorStrings(sections.map((s) => s.content))) {
                for (const piece of pieces(text)) {
                    expect(isOwnerNote(piece)).toBe(false);
                    expect(templatePlaceholderIn(piece)).toBeNull();
                    expect(piece).not.toMatch(/!/);
                }
            }
        },
    );

    it("carries its two photo briefs where the owner sees them, never as text", () => {
        const [homePage, about] = instantiateTemplate(
            starterTemplate,
            salon,
        ).pages;
        expect(homePage.sections[0].content).toMatchObject({
            imageBrief: STARTER_IMAGE_BRIEFS.hero,
        });
        expect(about.sections[1].content).toMatchObject({
            imageBrief: STARTER_IMAGE_BRIEFS.about,
        });
        for (const brief of Object.values(STARTER_IMAGE_BRIEFS)) {
            expect(brief.length).toBeLessThanOrEqual(200);
        }
    });
});

describe("starter@4 — module pages and the footer", () => {
    it.each([
        ["nothing on", plain, ["CONTACT"]],
        ["a salon", salon, ["BOOK", "CONTACT"]],
        ["a shop", shop, ["SHOP", "CONTACT"]],
        ["everything", everything, ["SHOP", "BOOK", "PRICES", "CONTACT"]],
    ] as const)("asks for the right module pages with %s", (_l, ctx, kinds) => {
        expect(templateModulePageKinds(starterTemplate, ctx)).toEqual(kinds);
    });

    it("asks for Prices with plans or packs alone", () => {
        for (const key of ["PAYMENTS", "CLASS_PACKS"]) {
            expect(
                templateModulePageKinds(starterTemplate, {
                    ...plain,
                    modules: ["WEBSITE", key],
                }),
            ).toEqual(["PRICES", "CONTACT"]);
        }
    });

    it("ends in the business's own line, or no line at all", () => {
        expect(starterTemplate.footer?.layout).toBe("left");
        expect(templateFooterLineFor(starterTemplate, salon)).toBe(
            "Haircut, Colour and Bridal styling in Bengaluru",
        );
        expect(templateFooterLineFor(starterTemplate, plain)).toBeUndefined();
        // Nothing fixed for the check to mistake for the owner's words.
        expect(starterTemplate.footer?.line).toBeUndefined();
    });
});

describe("the starter's look", () => {
    it("has three named colourways, the default first", () => {
        expect(starterTemplate.styles).toBe(STARTER_STYLES);
        expect(STARTER_STYLES.map((s) => [s.id, s.name])).toEqual([
            ["stone", "Stone"],
            ["harbour", "Harbour"],
            ["clay", "Clay"],
        ]);
    });

    it.each(STARTER_STYLES.map((s) => [s.id, s] as const))(
        "%s passes the palette's contrast rules and names every role",
        (_id, preset) => {
            const result = parsePalette(preset.style.palette);
            expect(result).toMatchObject({ ok: true });
            for (const role of PALETTE_ROLES) {
                expect(preset.style.palette?.[role]).toMatch(/^#[0-9A-F]{6}$/);
            }
            // Never pure black or pure white.
            const colours = Object.values(preset.style.palette ?? {});
            expect(colours).not.toContain("#FFFFFF");
            expect(colours).not.toContain("#000000");
        },
    );

    it.each(STARTER_STYLES.map((s) => [s.id, s] as const))(
        "%s sets a real font pair and a type scale inside its bounds",
        (_id, preset) => {
            expect(isFontPairKey(preset.style.fontPair)).toBe(true);
            expect(preset.style.fontPair).not.toBe(DEFAULT_FONT_PAIR);
            const type = parseTypeScale(preset.style.type);
            expect(type).toMatchObject({ ok: true });
            expect(preset.style.type).toMatchObject({
                displaySize: 56,
                bodySize: 17,
                measure: 64,
                contentWidth: 1120,
            });
            // Body 16px or more, 45 to 75 characters a line.
            expect(preset.style.type?.bodySize).toBeGreaterThanOrEqual(16);
            expect(preset.style.type?.measure).toBeGreaterThanOrEqual(45);
            expect(preset.style.type?.measure).toBeLessThanOrEqual(75);
        },
    );

    it("is Personal's and Portfolio's too, in a second version of each", () => {
        for (const template of [personalTemplate, portfolioTemplate]) {
            expect(template.version).toBe(2);
            expect(template.styles).toBe(STARTER_STYLES);
            expect(template.footer?.layout).toBe("left");
        }
    });
});
