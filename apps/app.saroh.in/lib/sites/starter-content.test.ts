import { sampleContext } from "@saroh/site-blocks/showcase";
import { instantiateTemplate, lookShowcaseTemplate } from "@saroh/templates";
import { describe, expect, it } from "vitest";

import type { SitePage } from "@/lib/sites/service";

import {
    broughtInMessage,
    fillDoneMessage,
    listOf,
    starterConfirmText,
    starterDoneMessage,
    starterPlanFor,
    versionSectionName,
    versionTitle,
    versionWhen,
} from "./starter-content";

/**
 * "Use this look with its starter content" in words (DEC-182): what the
 * confirm says it will replace and add, and what the toast says it did.
 */

const page = (
    id: string,
    path: string,
    title: string,
    extra: Partial<SitePage> = {},
): SitePage => ({
    id,
    path,
    title,
    isHome: path === "/",
    hidden: false,
    ...extra,
});

/** The Gym template's own pages besides home, as the plan reads them. */
const gymPages = () => {
    const gym = lookShowcaseTemplate("live");
    return instantiateTemplate(gym, sampleContext(gym)).pages.filter(
        (p) => !p.isHome,
    );
};

describe("starterPlanFor", () => {
    it("replaces the home page and adds the template's other pages", () => {
        const plan = starterPlanFor("live", [page("h", "/", "Welcome")]);
        expect(plan.templateName).toBe("Gym");
        expect(plan.replace).toEqual(["Welcome"]);
        expect(plan.create).toEqual(gymPages().map((p) => p.title));
    });

    it("names each look's showcase template, Classic's the Bakery", () => {
        const home = [page("h", "/", "Home")];
        expect(starterPlanFor("quiet", home).templateName).toBe("Salon");
        expect(starterPlanFor("folio", home).templateName).toBe("Studio");
        expect(starterPlanFor(null, home).templateName).toBe("Bakery");
    });

    it("replaces a free-form page at a template page's address, never a module page", () => {
        const [first] = gymPages();
        const free = starterPlanFor("live", [
            page("h", "/", "Home"),
            page("f", first.path, "Ours"),
        ]);
        expect(free.replace).toEqual(["Home", "Ours"]);
        expect(free.create).not.toContain(first.title);

        const onModule = starterPlanFor("live", [
            page("h", "/", "Home"),
            page("m", first.path, "Book", { kind: "BOOK" }),
        ]);
        expect(onModule.replace).toEqual(["Home"]);
        expect(onModule.create).not.toContain(first.title);
    });
});

describe("listOf", () => {
    it("joins titles as a sentence does", () => {
        expect(listOf([])).toBe("");
        expect(listOf(["Home"])).toBe("Home");
        expect(listOf(["Home", "About"])).toBe("Home and About");
        expect(listOf(["Home", "About", "Classes"])).toBe(
            "Home, About and Classes",
        );
    });
});

describe("starterConfirmText", () => {
    it("says what is replaced, what is added and that the rest stays", () => {
        expect(
            starterConfirmText({
                templateName: "Gym",
                replace: ["Home"],
                create: ["Classes", "Coaches"],
            }),
        ).toBe(
            "Your draft of Home is replaced with the Gym template's. Classes and Coaches are added as new pages. Your other pages stay as they are.",
        );
    });

    it("says one new page as one", () => {
        expect(
            starterConfirmText({
                templateName: "Bakery",
                replace: [],
                create: ["Menu"],
            }),
        ).toBe(
            "Menu is added as a new page. Your other pages stay as they are.",
        );
    });
});

describe("starterDoneMessage", () => {
    it("names the pages it changed, and asks for the sample words to go", () => {
        expect(
            starterDoneMessage({
                snapshotId: "s",
                templateId: "gym",
                look: "live",
                replaced: ["Home"],
                created: ["Classes"],
                filled: [],
            }),
        ).toEqual({
            message: "Starter content added to your draft.",
            description:
                "Changed: Home and Classes. Replace the sample words with your own before you publish.",
        });
    });

    it("says no more than that when nothing was named", () => {
        expect(
            starterDoneMessage({
                snapshotId: "s",
                templateId: "gym",
                look: null,
                replaced: [],
                created: [],
                filled: [],
            }).description,
        ).toBeUndefined();
    });
});

describe("filling in details and previous versions in words (22 Oct)", () => {
    it("says what Fill in my details filled", () => {
        expect(
            starterDoneMessage({
                snapshotId: "s",
                templateId: "studio",
                look: "folio",
                replaced: ["Home"],
                created: [],
                filled: ["team", "address", "town"],
            }).description,
        ).toBe(
            "Changed: Home. Filled in your staff, address and town. Replace the sample words with your own before you publish.",
        );
    });

    it("says what Bring in my details brought, or that there was nothing", () => {
        expect(
            fillDoneMessage({
                snapshotId: "s",
                filled: ["address"],
                pages: ["Home", "About"],
            }),
        ).toEqual({
            message: "Brought in your address.",
            description: "Changed: Home and About.",
        });
        expect(
            fillDoneMessage({ snapshotId: null, filled: [], pages: [] })
                .message,
        ).toBe("Nothing to bring in.");
    });

    it("names a previous version by what changed it, its look and when", () => {
        const version = {
            id: "v",
            reason: "fill-details",
            createdAt: "2026-10-12T04:00:00.000Z",
            look: null,
            pages: [],
        };
        expect(versionTitle(version, "Classic")).toBe(
            "Before your details came in · Classic",
        );
        expect(versionTitle({ ...version, reason: "unknown" }, "Live")).toBe(
            "An earlier draft · Live",
        );
        expect(
            versionWhen(
                version,
                "Asia/Kolkata",
                new Date("2026-10-22T04:00:00.000Z"),
            ),
        ).toBe("12 Oct, 9:30 am");
    });

    it("names a version's section by its heading, else its kind", () => {
        expect(versionSectionName({ type: "person", heading: "Coaches" })).toBe(
            "Coaches",
        );
        expect(
            versionSectionName({ type: "servicesList", heading: null }),
        ).toBe("Services list");
        expect(broughtInMessage("")).toBe("Added to the end of your page.");
    });
});
