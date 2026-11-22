import type {
    TemplateContext,
    TemplateManifest,
    TemplateSection,
} from "../manifest";
import { STUDIO_PROJECT_BRIEFS, studioTemplateV1 } from "./studio";

/**
 * `studio@2`, redesigned to its TB board (site templates plan U9, KD10):
 * for NEW sites only; v1 sites keep v1.
 *
 * v1 opened on the work with no word on what the studio does or for whom,
 * captions sat on a gradient at 3.1–4.1:1, and the type was small (the
 * critique). The board:
 *
 * 1. **What it does and for whom**: a positioning heading and line, with
 *    ONE main action, "Start a project", to the enquiry form, and "See the
 *    work" beside it.
 * 2. **Work**: v1's five projects in the rhythm (a wide lead, a pair, a
 *    portrait beside a landscape: five fill it, so there is no hole), now
 *    with the words UNDER each photo, in the page's own colours. The lead
 *    opens the project page.
 * 3. **Studio** and 4. **Contact**: as v1.
 *
 * `/project`: the lead project's page, as the board draws a case: its
 * name and line, the facts (client, year, what was made, who), the
 * photograph, the brief and what was made, and "Start a project like
 * this". Placeholders that say what to write, as v1's projects are.
 */

/** v1's home section of a type; v1 is frozen. */
function v1Section(type: string): TemplateSection {
    const section = studioTemplateV1.pages[0].sections.find(
        (s) => s.type === type,
    );
    if (!section) throw new Error(`studio@1 has no ${type} section`);
    return section;
}

/** The lead project's page. */
export const STUDIO_PROJECT_PATH = "/project";

/** v1's projects with their words under the photo and the lead linked. */
function work(): Record<string, unknown> {
    const v1 = (
        v1Section("projects").content as () => Record<string, unknown>
    )();
    const items = v1.items as Record<string, unknown>[];
    return {
        ...v1,
        captionPlacement: "below",
        items: items.map((item, i) =>
            i === 0 ? { ...item, link: STUDIO_PROJECT_PATH } : item,
        ),
    };
}

export const studioTemplate: TemplateManifest = {
    ...studioTemplateV1,
    version: 2,
    description:
        "A portfolio for a small studio: what it makes and for whom, the work with a page for the lead project, who the studio is and how to brief it.",
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
                        heading:
                            ctx.tagline ??
                            ctx.description ??
                            "Say what the studio makes, and who it is for",
                        subheading:
                            "A placeholder. How many people, where, and how much work you take on in a year.",
                        cta: {
                            label: "Start a project",
                            href: "/#contact",
                            style: "primary",
                        },
                        secondaryCta: { label: "See the work", href: "/#work" },
                    }),
                },
                {
                    type: "projects",
                    contractVersion: 1,
                    content: work,
                },
                v1Section("richText"),
                v1Section("enquiry"),
                v1Section("contact"),
            ],
        },
        {
            path: STUDIO_PROJECT_PATH,
            title: "Your lead project",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        variant: "none",
                        heading: "Your lead project",
                        subheading:
                            "A placeholder. One line on who it was for and what it had to work on.",
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        variant: "left",
                        format: "html",
                        imageSide: "above",
                        imageBrief: STUDIO_PROJECT_BRIEFS[0],
                        factsStyle: "labels",
                        value:
                            `<dl>` +
                            `<dt>Client</dt><dd>Who it was for</dd>` +
                            `<dt>When</dt><dd>The year it was made</dd>` +
                            `<dt>Made</dt><dd>What was made</dd>` +
                            `<dt>Team</dt><dd>Who worked on it</dd>` +
                            `</dl>`,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        variant: "left",
                        format: "html",
                        partLabels: true,
                        value:
                            `<h3>The brief</h3>` +
                            `<p>A placeholder. What the client had, what was ` +
                            `wrong with it, and what they asked for.</p>` +
                            `<h3>What was made</h3>` +
                            `<p>A placeholder. What you made, and the detail ` +
                            `that shows it works where it has to.</p>`,
                    },
                },
                {
                    type: "cta",
                    contractVersion: 1,
                    content: {
                        label: "Start a project like this",
                        href: "/#contact",
                        style: "primary",
                    },
                },
            ],
        },
    ],
};
