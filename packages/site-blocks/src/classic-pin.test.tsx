import { siteStyleVariables, toRendered } from "@saroh/block-contract";
import type { TemplateManifest } from "@saroh/templates";
import {
    instantiateTemplate,
    listTemplates,
    presetSiteStyle,
} from "@saroh/templates";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageSections } from "./section-renderer";
import { SiteTheme } from "./site-theme";

/**
 * Classic, pinned (DEC-172, plan U4's execution note).
 *
 * A site with no look is Classic, and Classic draws and moves exactly as
 * it did before looks existed: nothing a look adds may reach it. These
 * snapshots were written BEFORE any look code landed in the renderer, so
 * a change to them is a change to every live site, and is a bug unless a
 * decision says otherwise.
 *
 * - The theme's stylesheet: unstyled, scoped, and every shipped template
 *   colourway as publishing resolves it (`siteStyleVariables`).
 * - Every template's every page, drawn by `PageSections` on the server
 *   (no effects run, so no block reads the API: the markup is what the
 *   cached HTML carries).
 */

const css = (variables?: Record<string, string> | null, selector?: string) =>
    renderToStaticMarkup(
        <SiteTheme variables={variables} selector={selector} />,
    );

function colourways(t: TemplateManifest) {
    return (t.styles ?? []).map((s) => ({
        id: s.id,
        variables: siteStyleVariables(presetSiteStyle(s.style)),
    }));
}

const TEMPLATES = listTemplates();

describe("Classic's theme is pinned", () => {
    it("unstyled, at the root", () => {
        expect(css()).toMatchSnapshot();
    });

    it("unstyled, scoped to a wrapper", () => {
        expect(css(null, ".site-preview-scope")).toMatchSnapshot();
    });

    for (const t of TEMPLATES) {
        for (const way of colourways(t)) {
            it(`${t.id} in ${way.id}`, () => {
                expect(css(way.variables)).toMatchSnapshot();
            });
        }
    }
});

describe("Classic's pages are pinned", () => {
    for (const t of TEMPLATES) {
        const built = instantiateTemplate(t, {
            organizationName: "Sample Business",
            modules: ["WEBSITE", ...(t.uses ?? [])],
            contactEmail: "sample@example.com",
        });
        for (const page of built.pages) {
            it(`${t.id} ${page.path}`, () => {
                const sections = page.sections.map((section) => ({
                    type: section.type,
                    content: toRendered(
                        section.type,
                        section.type === "enquiry"
                            ? {
                                  ...(section.content as object),
                                  formId: "form_1",
                              }
                            : section.content,
                        { resolvePage: () => undefined },
                    ),
                }));
                expect(
                    renderToStaticMarkup(
                        <PageSections
                            sections={sections}
                            siteName="Sample Business"
                            bookHref="/book"
                            apiUrl="https://api.test"
                            siteId="site_pin"
                        />,
                    ),
                ).toMatchSnapshot();
            });
        }
    }
});
