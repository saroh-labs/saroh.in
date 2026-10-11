import { describe, expect, it } from "vitest";

import type { InstantiatedTemplate } from "./instantiate";
import { instantiateTemplate } from "./instantiate";
import type { TemplateContext } from "./manifest";
import { isOwnerNote } from "./placeholders";
import { HERO_PROMPT, starterTemplateV3 } from "./templates/starter";
import { starterTemplate } from "./templates/starter-v4";
import type { PagePlan, PlannedSection, StoredPage } from "./upgrade";
import { planTemplateUpgrade, sameAsMade, withBoundSections } from "./upgrade";

/** The business when its site was made, as v3 saw it: a name and an email. */
const then: TemplateContext = {
    organizationName: "Kesar Salon",
    contactEmail: "kesarsalon@example.com",
};

/** The business now: bookings on, a place, a line from its services. */
const now: TemplateContext = {
    ...then,
    description: "Haircut, Colour and Bridal styling in Bengaluru",
    modules: ["WEBSITE", "APPOINTMENTS"],
    serviceIds: ["svc_cut", "svc_colour"],
    sells: false,
    area: "Bengaluru",
    hasPlace: true,
    hasHours: true,
};

const made = instantiateTemplate(starterTemplateV3, then);
const next = instantiateTemplate(starterTemplate, now);

/** A site's pages as stored: sections keyed, an enquiry given its Form. */
function stored(
    template: InstantiatedTemplate,
    over: Partial<StoredPage> = {},
): StoredPage[] {
    return template.pages.map((page) => ({
        path: page.path,
        isHome: page.isHome,
        hidden: false,
        // Saved once without a change, so only the content can prove it.
        revision: 1,
        ...over,
        sections: page.sections.map((s, i) => ({
            type: s.type,
            contractVersion: s.contractVersion,
            content:
                s.type === "enquiry"
                    ? { ...(s.content as object), formId: `form_${i}` }
                    : s.content,
            hidden: false,
            key: `${page.path}#${i}`,
        })),
    }));
}

function plan(pages: StoredPage[], candidates = [made]): PagePlan[] {
    return planTemplateUpgrade({
        stored: pages,
        made: candidates,
        next,
        line: now.description,
    });
}

const at = (plans: PagePlan[], path: string) => {
    const found = plans.find((p) => p.path === path);
    if (!found) throw new Error(`no plan for ${path}`);
    return found;
};

/** Apply a plan to stored pages, as the API's writer does. */
function applied(pages: StoredPage[], plans: PagePlan[]): StoredPage[] {
    const out: StoredPage[] = [];
    for (const page of pages) {
        const p = plans.find((x) => x.path === page.path);
        if (!p || p.action === "keep") out.push(page);
        else if (p.action === "hide") out.push({ ...page, hidden: true });
        else if (p.action === "replace" || p.action === "merge") {
            out.push({
                ...page,
                // An edited page's revision moves; an untouched one's does not.
                revision: (page.revision ?? 0) + (p.action === "merge" ? 1 : 0),
                sections: p.sections.map((s: PlannedSection, i) => ({
                    ...s,
                    key: s.key ?? `new#${i}`,
                })),
            });
        }
    }
    for (const p of plans) {
        if (p.action !== "create") continue;
        out.push(
            ...stored({ pages: [p.page] }, { revision: 0 }).map((page) => ({
                ...page,
                path: p.page.path,
            })),
        );
    }
    return out;
}

describe("sameAsMade", () => {
    const page = made.pages[0];

    it("holds for exactly what the template made, key order aside", () => {
        const reordered = page.sections.map((s) => ({
            ...s,
            content: Object.fromEntries(
                Object.entries(s.content as object).reverse(),
            ),
        }));
        expect(sameAsMade(reordered, page.sections)).toBe(true);
    });

    it.each([
        [
            "a changed word",
            (s: StoredPage["sections"]) =>
                s.map((x, i) =>
                    i === 0
                        ? {
                              ...x,
                              content: {
                                  ...(x.content as object),
                                  heading: "Kesar",
                              },
                          }
                        : x,
                ),
        ],
        ["a section removed", (s: StoredPage["sections"]) => s.slice(1)],
        ["a section moved", (s: StoredPage["sections"]) => [...s].reverse()],
        [
            "a section hidden",
            (s: StoredPage["sections"]) =>
                s.map((x, i) => (i === 1 ? { ...x, hidden: true } : x)),
        ],
    ])("fails for %s", (_label, change) => {
        const sections = stored(made)[0]?.sections ?? [];
        expect(sameAsMade(change(sections), page.sections)).toBe(false);
    });

    it("looks past the Form an enquiry section was given after it was laid down", () => {
        const form = instantiateTemplate(starterTemplate, {
            organizationName: "Acme",
        });
        const [homePage] = stored(form);
        expect(
            homePage.sections.some(
                (s) => (s.content as { formId?: string }).formId,
            ),
        ).toBe(true);
        expect(sameAsMade(homePage.sections, form.pages[0].sections)).toBe(
            true,
        );
    });
});

describe("planTemplateUpgrade — an untouched site", () => {
    const plans = plan(stored(made));

    it("replaces Home with the new version's, for the business as it is now", () => {
        const home = at(plans, "/");
        expect(home.action).toBe("replace");
        if (home.action !== "replace") return;
        expect(home.sections.map((s) => s.type)).toEqual(
            next.pages[0]?.sections.map((s) => s.type),
        );
        expect(home.sections[0]?.content).toMatchObject({
            subheading: now.description,
            cta: { label: "Book a time" },
        });
    });

    it("keeps a section's key where the same block is still there", () => {
        const home = at(plans, "/");
        if (home.action !== "replace") throw new Error("not replaced");
        // The hero is still the hero: a note pinned to it stays.
        expect(home.sections[0]?.key).toBe("/#0");
        // A block the page never had gets no key of another's.
        expect(
            home.sections.find((s) => s.type === "servicesList")?.key,
        ).toBeUndefined();
    });

    it("replaces About too, and the stock paragraph goes with it", () => {
        const about = at(plans, "/about");
        expect(about.action).toBe("replace");
        if (about.action !== "replace") return;
        expect(JSON.stringify(about.sections)).not.toContain(
            "began with a simple idea",
        );
    });

    it("is untouched by the count of saves alone, whatever the business is called now", () => {
        // Renamed since, so no candidate matches; never saved, so it is
        // still exactly what made it.
        const renamed = instantiateTemplate(starterTemplateV3, {
            organizationName: "Some Other Name",
        });
        const plans0 = plan(stored(renamed, { revision: 0 }));
        expect(at(plans0, "/").action).toBe("replace");
        // Saved even once, with no candidate to match: edited.
        const plans1 = plan(stored(renamed, { revision: 1 }));
        expect(at(plans1, "/").action).not.toBe("replace");
        // A count that is not known is never read as "never saved".
        const unknown = stored(renamed).map(
            ({ revision: _r, ...page }) => page,
        );
        expect(at(plan(unknown), "/").action).not.toBe("replace");
    });

    it("matches a site made when the business had no email, or another name", () => {
        const before = instantiateTemplate(starterTemplateV3, {
            organizationName: "Kesar",
        });
        expect(at(plan(stored(before)), "/").action).toBe("merge");
        expect(at(plan(stored(before), [made, before]), "/").action).toBe(
            "replace",
        );
    });

    it("plans nothing more when run again over its own result", () => {
        const after = applied(stored(made), plans);
        expect(plan(after).every((p) => p.action === "keep")).toBe(true);
        // And again as a later run would see it: its template now v4.
        expect(
            planTemplateUpgrade({
                stored: after,
                made: [next],
                next,
                line: now.description,
            }).every((p) => p.action === "keep"),
        ).toBe(true);
    });
});

describe("planTemplateUpgrade — an edited page", () => {
    /** Home with the owner's own headline and a paragraph of their own. */
    function editedHome(): StoredPage[] {
        const pages = stored(made);
        const home = pages[0];
        return [
            {
                ...home,
                revision: 4,
                sections: [
                    {
                        ...home.sections[0],
                        type: "hero",
                        contractVersion: 1,
                        content: {
                            ...(home.sections[0]?.content as object),
                            heading: "Hair, done properly",
                        },
                    },
                    ...home.sections.slice(1),
                    {
                        type: "richText",
                        contractVersion: 1,
                        content: {
                            format: "html",
                            value: "<p>Meher has cut hair here since 2014.</p>",
                        },
                        hidden: false,
                        key: "own",
                    },
                ],
            },
            ...pages.slice(1),
        ];
    }

    const before = editedHome();
    const plans = plan(before);
    const home = at(plans, "/");

    it("keeps every section the owner has, in its order, with its key", () => {
        expect(home.action).toBe("merge");
        if (home.action !== "merge") return;
        const keptKeys = home.sections.flatMap((s) => (s.key ? [s.key] : []));
        expect(keptKeys).toEqual(before[0]?.sections.map((s) => s.key));
        for (const section of before[0]?.sections ?? []) {
            const after = home.sections.find((s) => s.key === section.key);
            expect(after?.type).toBe(section.type);
            if (section.type !== "hero") {
                expect(after?.content).toEqual(section.content);
            }
        }
        expect(home.sections[0]?.content).toMatchObject({
            heading: "Hair, done properly",
        });
    });

    it("gains only the bound sections it has nothing like", () => {
        if (home.action !== "merge") throw new Error("not merged");
        expect(home.added).toEqual(["servicesList", "visitUs"]);
        // None of the template's words: no features, no band, no new hero.
        const types = home.sections.map((s) => s.type);
        expect(types.filter((t) => t === "hero")).toHaveLength(1);
        expect(types).not.toContain("features");
        expect(home.sections.filter((s) => !s.key).map((s) => s.type)).toEqual([
            "servicesList",
            "visitUs",
        ]);
    });

    it("puts the services after the hero, and the place above the closing button", () => {
        if (home.action !== "merge") throw new Error("not merged");
        const types = home.sections.map((s) => s.type);
        expect(types[0]).toBe("hero");
        expect(types[1]).toBe("servicesList");
        // v3's Home ends in its Get in touch button, then the owner's own
        // paragraph: the place goes last, since the page does not end in a
        // button.
        expect(types[types.length - 1]).toBe("visitUs");
    });

    it("takes the note to the owner out of the hero, for the business's own line", () => {
        if (home.action !== "merge") throw new Error("not merged");
        // v3 put the note there; the owner changed the headline, not it.
        expect(
            (before[0]?.sections[0]?.content as { subheading: string })
                .subheading,
        ).toBe(HERO_PROMPT);
        expect(home.notesRemoved).toBe(1);
        const line = (home.sections[0]?.content as { subheading?: string })
            .subheading;
        expect(line).toBe(now.description);
        expect(isOwnerNote(line)).toBe(false);
    });

    it("clears the note where the business has no line to put there", () => {
        const noLine = planTemplateUpgrade({
            stored: before,
            made: [made],
            next,
        });
        const page = at(noLine, "/");
        if (page.action !== "merge") throw new Error("not merged");
        expect(page.sections[0]?.content).not.toHaveProperty("subheading");
    });

    it("still replaces the page nobody touched beside it", () => {
        expect(at(plans, "/about").action).toBe("replace");
    });

    it("adds nothing a second time", () => {
        const after = applied(before, plans);
        expect(plan(after).every((p) => p.action === "keep")).toBe(true);
    });
});

describe("withBoundSections", () => {
    const target = next.pages[0]?.sections ?? [];

    it("adds nothing where the page already has the block, even hidden", () => {
        const sections = [
            { type: "hero", contractVersion: 1, content: { heading: "A" } },
            {
                type: "servicesList",
                contractVersion: 1,
                content: { serviceIds: ["x"] },
                hidden: true,
            },
            {
                type: "contact",
                contractVersion: 1,
                content: { address: "12 MG Road" },
            },
        ];
        // The owner hid their services list, and already says where they
        // are: neither is added beside it.
        expect(withBoundSections(sections, target).added).toEqual([]);
    });

    it("puts what it adds above the section the page ends on, and last where there is none", () => {
        const text = {
            type: "richText",
            contractVersion: 1,
            content: { value: "<p>Ours.</p>" },
        };
        const endings = [
            { type: "cta", contractVersion: 1, content: { label: "Go" } },
            { type: "enquiry", contractVersion: 1, content: { fields: [] } },
            // A closing band made by hand, from a text block.
            {
                type: "richText",
                contractVersion: 1,
                content: { band: "accent", value: "<h2>Ready</h2>" },
            },
        ];
        for (const ending of endings) {
            const { sections } = withBoundSections([text, ending], target);
            expect(sections.map((s) => s.type)).toEqual([
                "richText",
                "servicesList",
                "visitUs",
                ending.type,
            ]);
            expect(sections[3]?.content).toEqual(ending.content);
        }
        // A page that ends in the owner's own words: after them.
        expect(
            withBoundSections([text, text], target).sections.map((s) => s.type),
        ).toEqual(["richText", "richText", "servicesList", "visitUs"]);
    });

    it("never adds a block of the template's own words", () => {
        const { added } = withBoundSections([], target);
        expect(added).toEqual(["servicesList", "visitUs"]);
    });
});

describe("planTemplateUpgrade — pages that come and go", () => {
    it("hides an untouched page the new version no longer makes", () => {
        // No line and no facts: v4 lays down no About.
        const bare = instantiateTemplate(starterTemplate, then);
        expect(bare.pages.map((p) => p.path)).toEqual(["/"]);
        const plans = planTemplateUpgrade({
            stored: stored(made),
            made: [made],
            next: bare,
        });
        expect(at(plans, "/about").action).toBe("hide");
        expect(at(plans, "/").action).toBe("replace");
    });

    it("keeps that page when the owner wrote on it", () => {
        const bare = instantiateTemplate(starterTemplate, then);
        const pages = stored(made);
        const about = pages[1];
        const written = [
            pages[0],
            {
                ...about,
                revision: 2,
                sections: about.sections.map((s, i) =>
                    i === 1
                        ? {
                              ...s,
                              content: {
                                  format: "html",
                                  value: "<p>Our own story.</p>",
                              },
                          }
                        : s,
                ),
            },
        ];
        const plans = planTemplateUpgrade({
            stored: written,
            made: [made],
            next: bare,
        });
        expect(at(plans, "/about").action).toBe("keep");
    });

    it("leaves a page the owner added alone, even one never saved", () => {
        const own: StoredPage = {
            path: "/menu",
            revision: 0,
            sections: [],
        };
        const plans = plan([...stored(made), own]);
        expect(at(plans, "/menu").action).toBe("keep");
    });

    it("does not bring back a page the owner deleted", () => {
        const plans = plan(stored(made).slice(0, 1));
        expect(plans.map((p) => p.path)).toEqual(["/"]);
    });

    it("adds a page the template newly makes", () => {
        // Before: no line, so v4 made no About. Now it has one.
        const before = instantiateTemplate(starterTemplate, then);
        const plans = planTemplateUpgrade({
            stored: stored(before, { revision: 0 }),
            made: [before],
            next,
        });
        const about = at(plans, "/about");
        expect(about.action).toBe("create");
    });

    it("leaves a page its owner hid exactly as it is", () => {
        const pages = stored(made).map((p) =>
            p.path === "/about" ? { ...p, hidden: true } : p,
        );
        expect(at(plan(pages), "/about").action).toBe("keep");
    });
});

describe("planTemplateUpgrade — a module switched on later", () => {
    /** A v4 shop's site, and the same business once it takes bookings. */
    const shop: TemplateContext = {
        organizationName: "Rye & Co.",
        description: "Breads and Cakes in Pune",
        modules: ["WEBSITE", "COMMERCE"],
        serviceIds: [],
        sells: true,
        area: "Pune",
    };
    const withBookings: TemplateContext = {
        ...shop,
        description: "Baking class in Pune",
        modules: ["WEBSITE", "COMMERCE", "APPOINTMENTS"],
        serviceIds: ["svc_class"],
    };
    const before = instantiateTemplate(starterTemplate, shop);
    const after = instantiateTemplate(starterTemplate, withBookings);

    it("gives an untouched Home exactly what a site made today would have", () => {
        const plans = planTemplateUpgrade({
            stored: stored(before, { revision: 0 }),
            made: [before],
            next: after,
            line: withBookings.description,
        });
        const home = at(plans, "/");
        if (home.action !== "replace") throw new Error("not replaced");
        expect(
            home.sections.map((s) => ({ type: s.type, content: s.content })),
        ).toEqual(
            after.pages[0]?.sections.map((s) => ({
                type: s.type,
                content: s.content,
            })),
        );
        // The action moved with it: the page now asks for a booking.
        expect(home.sections[0]?.content).toMatchObject({
            cta: { label: "Book a time" },
        });
    });

    it("gives an edited Home the services list, after its products, and nothing else", () => {
        const pages = stored(before, { revision: 3 }).map((p) =>
            p.isHome
                ? {
                      ...p,
                      sections: p.sections.map((s, i) =>
                          i === 0
                              ? {
                                    ...s,
                                    content: {
                                        ...(s.content as object),
                                        heading: "Bread worth the walk",
                                    },
                                }
                              : s,
                      ),
                  }
                : p,
        );
        const plans = planTemplateUpgrade({
            stored: pages,
            made: [before],
            next: after,
            line: withBookings.description,
        });
        const home = at(plans, "/");
        if (home.action !== "merge") throw new Error("not merged");
        expect(home.added).toEqual(["servicesList"]);
        const types = home.sections.map((s) => s.type);
        expect(types.indexOf("servicesList")).toBe(
            types.indexOf("productGrid") + 1,
        );
        // The owner's headline and their button are theirs.
        expect(home.sections[0]?.content).toMatchObject({
            heading: "Bread worth the walk",
            cta: { label: "Browse the shop" },
        });
    });
});
