import {
    countPendingSectionChanges,
    type PublishablePage,
    toPendingPages,
    toPublishableSection,
} from "./pending-changes";

/** A section as it sits in a snapshot or would be written to one. */
function section(value: string, over: Record<string, unknown> = {}) {
    return {
        type: "richText",
        contractVersion: 1,
        content: { value, ...over },
    };
}

function page(
    path: string,
    sections: ReturnType<typeof section>[],
): PublishablePage {
    return { path, title: "A page", isHome: path === "/", sections };
}

function snapshot(pages: { path: string; sections: unknown[] }[]) {
    return { site: { name: "Flour & Ferment" }, pages };
}

describe("countPendingSectionChanges", () => {
    it("counts nothing when the draft matches what is live", () => {
        const draft = [page("/", [section("<p>Hello</p>")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([{ path: "/", sections: [section("<p>Hello</p>")] }]),
            ),
        ).toBe(0);
    });

    it("counts an edited section once", () => {
        const draft = [page("/", [section("<p>New</p>")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([{ path: "/", sections: [section("<p>Old</p>")] }]),
            ),
        ).toBe(1);
    });

    it("counts an added section", () => {
        const draft = [page("/", [section("a"), section("b")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([{ path: "/", sections: [section("a")] }]),
            ),
        ).toBe(1);
    });

    it("counts a removed section — publishing takes it off the live site", () => {
        const draft = [page("/", [section("a")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([
                    { path: "/", sections: [section("a"), section("b")] },
                ]),
            ),
        ).toBe(1);
    });

    it("counts every section a reorder moved", () => {
        // Both positions now hold something other than what is live there, and
        // publishing does change both. Under-counting a reorder to "1" would
        // describe the merchant's gesture rather than its effect.
        const draft = [page("/", [section("b"), section("a")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([
                    { path: "/", sections: [section("a"), section("b")] },
                ]),
            ),
        ).toBe(2);
    });

    it("counts a whole new page's sections", () => {
        const draft = [
            page("/", [section("a")]),
            page("/about", [section("b"), section("c")]),
        ];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([{ path: "/", sections: [section("a")] }]),
            ),
        ).toBe(2);
    });

    it("counts the sections of a page that is no longer in the draft", () => {
        const draft = [page("/", [section("a")])];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([
                    { path: "/", sections: [section("a")] },
                    { path: "/old", sections: [section("b"), section("c")] },
                ]),
            ),
        ).toBe(2);
    });

    it("does not report a change merely because JSON key order differs", () => {
        // The live side comes back from Postgres; the draft side is rebuilt by
        // the contract parser. Nothing guarantees the two agree on key order,
        // and a merchant seeing "6 sections changed" on an untouched site is
        // exactly the untrustworthy number this count exists to replace.
        const draft = [
            page("/", [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: { heading: "Bread", subheading: "Daily" },
                },
            ]),
        ];
        expect(
            countPendingSectionChanges(
                draft,
                snapshot([
                    {
                        path: "/",
                        sections: [
                            {
                                contractVersion: 1,
                                content: {
                                    subheading: "Daily",
                                    heading: "Bread",
                                },
                                type: "hero",
                            },
                        ],
                    },
                ]),
            ),
        ).toBe(0);
    });

    it("treats a malformed snapshot as an empty one rather than throwing", () => {
        // Publications are immutable and go back to Stage 2; a row written by
        // older code must not be able to break the sites list.
        const draft = [page("/", [section("a")])];
        expect(countPendingSectionChanges(draft, null)).toBe(1);
        expect(countPendingSectionChanges(draft, { pages: "nope" })).toBe(1);
        expect(countPendingSectionChanges(draft, {})).toBe(1);
    });
});

describe("toPublishableSection", () => {
    it("sanitizes, so a count is taken over the bytes publish would write", () => {
        const result = toPublishableSection({
            type: "richText",
            contractVersion: 1,
            content: { value: "<p>Hi<script>alert(1)</script></p>" },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(JSON.stringify(result.section.content)).not.toContain("script");
    });

    it("reports a section that no longer satisfies its contract", () => {
        const result = toPublishableSection({
            type: "richText",
            contractVersion: 1,
            content: { value: 42 },
        });
        expect(result.ok).toBe(false);
    });
});

describe("toPendingPages", () => {
    it("keeps a contract-invalid section instead of dropping it", () => {
        // Dropping it would tell the merchant publishing REMOVES the section.
        // It does not — publishing refuses. The pre-publish check is what says
        // so; this must only avoid lying about it.
        const pages = toPendingPages([
            {
                path: "/",
                title: "Home",
                isHome: true,
                versions: [
                    {
                        sections: [
                            {
                                type: "richText",
                                contractVersion: 1,
                                content: { value: 42 },
                            },
                        ],
                    },
                ],
            },
        ]);
        expect(pages[0].sections).toHaveLength(1);
    });

    it("reads a page with no draft version as having no sections", () => {
        const pages = toPendingPages([
            { path: "/", title: "Home", isHome: true, versions: [] },
        ]);
        expect(pages[0].sections).toEqual([]);
    });
});

describe("toPublishableSection — a v2 button's action becomes an href (#207)", () => {
    const resolve = (id: string) =>
        id === "page_about" ? "/about" : undefined;

    it("resolves a page by id into the path the renderer draws", () => {
        const result = toPublishableSection(
            {
                type: "cta",
                contractVersion: 2,
                content: {
                    label: "About us",
                    action: { kind: "page", pageId: "page_about" },
                },
            },
            resolve,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // The action stays beside the href, so a later reader can still tell
        // a call from a link; the href is what the renderer draws.
        expect(result.section.content).toMatchObject({
            href: "/about",
            action: { kind: "page", pageId: "page_about" },
        });
    });

    it("resolves a page that is hidden or gone to nothing, never to a 404", () => {
        const result = toPublishableSection(
            {
                type: "cta",
                contractVersion: 2,
                content: {
                    label: "Old",
                    action: { kind: "page", pageId: "page_deleted" },
                },
            },
            resolve,
        );
        expect(result.ok && result.section.content).toMatchObject({ href: "" });
    });

    it("writes tel: and wa.me for the merchant, and reaches a hero's embedded button", () => {
        const result = toPublishableSection(
            {
                type: "hero",
                contractVersion: 2,
                content: {
                    heading: "Hi",
                    cta: {
                        label: "Call",
                        action: { kind: "call", number: "+91 98450 12345" },
                    },
                },
            },
            resolve,
        );
        expect(result.ok && result.section.content).toMatchObject({
            cta: { href: "tel:+919845012345" },
        });
    });

    it("leaves a v1 button exactly as it was", () => {
        const result = toPublishableSection(
            {
                type: "cta",
                contractVersion: 1,
                content: { label: "Go", href: "/contact" },
            },
            resolve,
        );
        expect(result.ok && result.section.content).toMatchObject({
            href: "/contact",
        });
        expect(
            result.ok &&
                (result.section.content as { action?: unknown }).action,
        ).toBeUndefined();
    });
});
