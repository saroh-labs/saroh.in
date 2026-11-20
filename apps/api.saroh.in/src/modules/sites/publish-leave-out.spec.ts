import { BadRequestException } from "@nestjs/common";

import type { ChangeStamps } from "./change-units";
import { changeUnits, leaveOutOf } from "./change-units";

// Publish with Leave out (website area U8, KTD-5): a left-out change goes
// out as it is live, and is still waiting afterwards.

const text = (heading: string, body = "Words") => ({
    type: "text",
    contractVersion: 1,
    content: { heading, body },
});

interface Page {
    id: string;
    path: string;
    title?: string;
    home?: boolean;
    sections: [string, unknown][];
}

function snap(
    pages: Page[],
    {
        site = {},
        redirects = [],
        withKeys = true,
    }: {
        site?: Record<string, unknown>;
        redirects?: { from: string; to: string }[];
        withKeys?: boolean;
    } = {},
) {
    return {
        site: { name: "Gulmohar", slug: "gulmohar", navigation: [], ...site },
        pages: pages.map((p) => ({
            path: p.path,
            title: p.title ?? p.path,
            isHome: p.home === true,
            sections: p.sections.map(([, s]) => s),
        })),
        ...(redirects.length > 0 ? { redirects } : {}),
        ...(withKeys
            ? {
                  keys: Object.fromEntries(
                      pages.map((p) => [
                          p.path,
                          { id: p.id, sections: p.sections.map(([k]) => k) },
                      ]),
                  ),
              }
            : {}),
        publishedAt: "2026-11-20T00:00:00.000Z",
    };
}

const NONE: ChangeStamps = {
    sections: new Map(),
    pages: new Map(),
    redirects: new Map(),
    draftEditors: {},
};

/** The units still waiting once `published` is live. */
const waiting = (draft: unknown, published: unknown) =>
    changeUnits(draft, published, NONE)
        .map((u) => u.key)
        .sort();

const A = text("Intro");
const A2 = text("Intro, rewritten");
const B = text("Packages");
const B2 = text("Packages, new prices");
const C = text("Visit us");

const home = (sections: [string, unknown][]): Page => ({
    id: "p_home",
    path: "/",
    home: true,
    sections,
});

function refusal(run: () => unknown): { message: string; reason: string } {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const body = (error as BadRequestException).getResponse() as {
            message: string;
            details: { reason: string };
        };
        return { message: body.message, reason: body.details.reason };
    }
    throw new Error("expected a refusal");
}

describe("publish with leave out", () => {
    it("publishes a left-out section edit as it is live, and it still waits", () => {
        const live = snap([
            home([
                ["k1", A],
                ["k2", B],
            ]),
        ]);
        const draft = snap([
            home([
                ["k1", A2],
                ["k2", B2],
            ]),
        ]);
        const out = leaveOutOf(draft, live, ["section:p_home:k1"]);
        expect(out.snapshot.pages).toEqual([
            expect.objectContaining({ sections: [A, B2] }),
        ]);
        expect(out.alsoLeftOut).toEqual([]);
        expect(waiting(draft, out.snapshot)).toEqual(["section:p_home:k1"]);
    });

    it("leaves a new section out of the page", () => {
        const live = snap([home([["k1", A]])]);
        const draft = snap([
            home([
                ["k9", C],
                ["k1", A2],
            ]),
        ]);
        const out = leaveOutOf(draft, live, ["section:p_home:k9"]);
        expect(out.snapshot.pages).toEqual([
            expect.objectContaining({ sections: [A2] }),
        ]);
        expect(out.snapshot.keys).toEqual({
            "/": { id: "p_home", sections: ["k1"] },
        });
        expect(waiting(draft, out.snapshot)).toEqual(["section:p_home:k9"]);
    });

    it("keeps a left-out deleted section at its live place", () => {
        const live = snap([
            home([
                ["k1", A],
                ["k2", B],
                ["k3", C],
            ]),
        ]);
        const draft = snap([
            home([
                ["k1", A2],
                ["k3", C],
            ]),
        ]);
        const out = leaveOutOf(draft, live, ["section:p_home:k2"]);
        expect(out.snapshot.pages).toEqual([
            expect.objectContaining({ sections: [A2, B, C] }),
        ]);
        expect(waiting(draft, out.snapshot)).toEqual(["section:p_home:k2"]);
    });

    it("puts a left-out move back where it is live", () => {
        const live = snap([
            home([
                ["k1", A],
                ["k2", B],
                ["k3", C],
            ]),
        ]);
        const draft = snap([
            home([
                ["k3", C],
                ["k1", A],
                ["k2", B2],
            ]),
        ]);
        const out = leaveOutOf(draft, live, ["section:p_home:k3"]);
        expect(out.snapshot.pages).toEqual([
            expect.objectContaining({ sections: [A, B2, C] }),
        ]);
        expect(waiting(draft, out.snapshot)).toEqual(["section:p_home:k3"]);
    });

    it("keeps a renamed page at its live link and publishes no forward", () => {
        const about = (path: string, sections: [string, unknown][]): Page => ({
            id: "p_about",
            path,
            title: "About",
            sections,
        });
        const live = snap([home([["k1", A]]), about("/about", [["k5", B]])]);
        const draft = snap(
            [home([["k1", A2]]), about("/our-story", [["k5", B2]])],
            { redirects: [{ from: "/about", to: "/our-story" }] },
        );
        const out = leaveOutOf(draft, live, ["page:p_about"]);
        const pages = out.snapshot.pages as {
            path: string;
            sections: unknown[];
        }[];
        expect(pages.map((p) => p.path)).toEqual(["/", "/about"]);
        // The page's sections are their own units: B2 still goes out.
        expect(pages[1].sections).toEqual([B2]);
        expect(out.snapshot.redirects).toBeUndefined();
        expect(out.snapshot.keys).toEqual({
            "/": { id: "p_home", sections: ["k1"] },
            "/about": { id: "p_about", sections: ["k5"] },
        });
        expect(waiting(draft, out.snapshot)).toEqual(["page:p_about"]);
    });

    it("leaves a new page's sections out with it, and says so", () => {
        const live = snap([home([["k1", A]])]);
        const draft = snap([
            home([["k1", A2]]),
            {
                id: "p_new",
                path: "/bridal",
                sections: [
                    ["n1", B],
                    ["n2", C],
                ],
            },
        ]);
        const out = leaveOutOf(draft, live, ["page:p_new"]);
        expect(
            (out.snapshot.pages as { path: string }[]).map((p) => p.path),
        ).toEqual(["/"]);
        expect(out.alsoLeftOut.sort()).toEqual([
            "section:p_new:n1",
            "section:p_new:n2",
        ]);
        expect(waiting(draft, out.snapshot)).toEqual(
            ["page:p_new", "section:p_new:n1", "section:p_new:n2"].sort(),
        );
    });

    it("leaves out a menu that would link to a left-out page", () => {
        const live = snap([home([["k1", A]])], {
            site: { navigation: [{ label: "Home", href: "/" }] },
        });
        const draft = snap(
            [
                home([["k1", A2]]),
                { id: "p_new", path: "/bridal", sections: [] },
            ],
            {
                site: {
                    navigation: [
                        { label: "Home", href: "/" },
                        { label: "Bridal", href: "/bridal" },
                        { label: "Prices", href: "/#prices" },
                    ],
                },
            },
        );
        const out = leaveOutOf(draft, live, ["page:p_new"]);
        expect(out.alsoLeftOut).toEqual(["site:menu"]);
        expect(
            (out.snapshot.site as { navigation: unknown }).navigation,
        ).toEqual([{ label: "Home", href: "/" }]);
    });

    it("keeps a left-out deleted page at its live place, with its forwards", () => {
        const page = (id: string, path: string): Page => ({
            id,
            path,
            sections: [[`${id}_s`, B]],
        });
        const live = snap(
            [home([["k1", A]]), page("p_a", "/a"), page("p_b", "/b")],
            { redirects: [{ from: "/old-a", to: "/a" }] },
        );
        const draft = snap([home([["k1", A2]]), page("p_b", "/b")]);
        const out = leaveOutOf(draft, live, ["page:p_a"]);
        expect(
            (out.snapshot.pages as { path: string }[]).map((p) => p.path),
        ).toEqual(["/", "/a", "/b"]);
        expect(out.snapshot.redirects).toEqual([{ from: "/old-a", to: "/a" }]);
        expect(out.alsoLeftOut).toEqual(["section:p_a:p_a_s"]);
        expect(waiting(draft, out.snapshot)).toEqual(
            ["page:p_a", "section:p_a:p_a_s"].sort(),
        );
    });

    it("publishes a left-out site setting as it is live", () => {
        const live = snap([home([["k1", A]])], { site: { name: "Old" } });
        const draft = snap([home([["k1", A2]])], {
            site: {
                name: "New",
                style: { palette: "clay" },
                styleVariables: { "--site-bg": "1 2 3" },
                look: "warm",
            },
        });
        const out = leaveOutOf(draft, live, ["site:name", "site:style"]);
        const site = out.snapshot.site as Record<string, unknown>;
        expect(site.name).toBe("Old");
        expect(site).not.toHaveProperty("look");
        expect(site).not.toHaveProperty("styleVariables");
        expect(waiting(draft, out.snapshot)).toEqual([
            "site:name",
            "site:style",
        ]);
    });

    it("reads a live site from before keys by place", () => {
        const live = snap(
            [
                home([
                    ["x", A],
                    ["y", B],
                    ["z", C],
                ]),
            ],
            {
                withKeys: false,
            },
        );
        const draft = snap([
            home([
                ["k1", A2],
                ["k2", B2],
            ]),
        ]);
        const out = leaveOutOf(draft, live, [
            "section:p_home:k1",
            "section:p_home:@2",
        ]);
        expect(out.snapshot.pages).toEqual([
            expect.objectContaining({ sections: [A, B2, C] }),
        ]);
        expect(waiting(draft, out.snapshot)).toEqual([
            "section:p_home:@2",
            "section:p_home:k1",
        ]);
    });

    it("refuses to leave out everything", () => {
        const live = snap([home([["k1", A]])]);
        const draft = snap([home([["k1", A2]])]);
        expect(
            refusal(() => leaveOutOf(draft, live, ["section:p_home:k1"])),
        ).toEqual({
            message: "Nothing to publish",
            reason: "nothingToPublish",
        });
    });

    it("refuses a change that isn't waiting any more", () => {
        const live = snap([home([["k1", A]])]);
        const draft = snap([home([["k1", A2]])]);
        expect(
            refusal(() => leaveOutOf(draft, live, ["section:p_home:k7"])),
        ).toEqual({
            message: "That change isn't waiting any more",
            reason: "changeGone",
        });
    });

    it("refuses a leave out that would serve two pages at one link", () => {
        const live = snap([
            home([["k1", A]]),
            { id: "p_a", path: "/a", sections: [] },
        ]);
        const draft = snap(
            [
                home([["k1", A2]]),
                { id: "p_a", path: "/a-new", sections: [] },
                { id: "p_b", path: "/a", sections: [] },
            ],
            { redirects: [] },
        );
        expect(
            refusal(() => leaveOutOf(draft, live, ["page:p_a"])).reason,
        ).toBe("leaveOutClash");
    });

    it("refuses leave out on a site's first publish", () => {
        const draft = snap([home([["k1", A]])]);
        expect(
            refusal(() => leaveOutOf(draft, null, ["page:p_home"])).reason,
        ).toBe("firstPublish");
    });
});
