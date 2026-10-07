import { toRendered } from "@saroh/block-contract";
import type { TemplateContext, TemplateManifest } from "@saroh/templates";
import {
    getTemplate,
    HERO_PROMPT,
    instantiateTemplate,
    STARTER_TEMPLATE_ID,
    starterTemplate,
    starterTemplateV1,
} from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SectionRenderer from "./section-renderer";

/**
 * What a new site draws on its first open (DEC-070, K10).
 *
 * `starter@1` pointed its hero and gallery at `/templates/starter/*.jpg`, and
 * no app serves those files, so every new site's draft opened with four broken
 * images. The template's own tests prove v2's content names no image; this
 * proves it at the point that matters: through the renderer every draft and
 * every published page goes through, nothing asks the browser for a picture.
 *
 * The v1 case is the control. It shows this test sees the broken images when
 * they are there, so a green v2 run means "none", not "not looked for".
 */

const ctx: TemplateContext = { organizationName: "Asha Rao" };

/** Draw every page of a template, as the editor's canvas would. */
function renderSite(template: TemplateManifest) {
    const { pages } = instantiateTemplate(template, ctx);
    const resolvePage = () => undefined;
    return pages.map((page) => ({
        path: page.path,
        ...render(
            <>
                {page.sections.map((section) => (
                    <SectionRenderer
                        key={section.order}
                        section={{
                            type: section.type,
                            content: toRendered(section.type, section.content, {
                                resolvePage,
                            }),
                        }}
                    />
                ))}
            </>,
        ),
    }));
}

function imageSources(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("img")).map(
        (img) => img.getAttribute("src") ?? "",
    );
}

describe("the starter template, rendered", () => {
    it("starter@3 draws no image a new site cannot load", () => {
        expect(getTemplate(STARTER_TEMPLATE_ID)).toBe(starterTemplate);
        for (const page of renderSite(starterTemplate)) {
            expect(imageSources(page.container)).toEqual([]);
            expect(page.container.innerHTML).not.toContain("/templates/");
            page.unmount();
        }
    });

    it("starter@3 draws its words on both pages, prompting the owner (UX-070)", () => {
        const [home, about] = renderSite(starterTemplate).map((p) =>
            within(p.container),
        );
        expect(home.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
        expect(home.getByText(HERO_PROMPT)).toBeVisible();
        expect(
            home.getByRole("heading", { name: "What Asha Rao does" }),
        ).toBeVisible();
        expect(
            about.getByRole("heading", { name: "About Asha Rao" }),
        ).toBeVisible();
    });

    it("starter@1, the control: its images point at files nobody serves", () => {
        expect(getTemplate(STARTER_TEMPLATE_ID, 1)).toBe(starterTemplateV1);
        const [home] = renderSite(starterTemplateV1);
        expect(imageSources(home.container)).toEqual(
            expect.arrayContaining([
                "/templates/starter/hero.jpg",
                "/templates/starter/gallery-1.jpg",
            ]),
        );
    });
});
