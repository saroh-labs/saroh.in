import type { ChangeStamp, ChangeStamps } from "./change-units";
import {
    carryStamps,
    changeUnits,
    groupByPerson,
    readDraftEditors,
    sectionLabel,
} from "./change-units";
import type { PublishablePage } from "./pending-changes";
import { countPendingSectionChanges } from "./pending-changes";

// Change units (website area U7): what publishing would change, one thing at a
// time, and who changed each.

const RITIKA: ChangeStamp = { userId: "u_ritika", at: "2026-11-14T10:00:00Z" };
const ARJUN: ChangeStamp = { userId: "u_arjun", at: "2026-11-16T10:00:00Z" };
const MOHIT: ChangeStamp = { userId: "u_mohit", at: "2026-11-15T10:00:00Z" };

const text = (heading: string, body = "Words") => ({
    type: "text",
    contractVersion: 1,
    content: { heading, body },
});
const HERO = {
    type: "hero",
    contractVersion: 1,
    content: { heading: "Bridal makeup for your day" },
};

interface Page {
    id: string;
    path: string;
    title: string;
    sections: { key: string; section: unknown }[];
}

/** A snapshot as `buildSnapshot` writes it; `withKeys: false` for an old one. */
function snapshot(
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
        site: { name: "Gulmohar", slug: "gulmohar", footer: null, ...site },
        pages: pages.map((p) => ({
            path: p.path,
            title: p.title,
            isHome: p.path === "/",
            sections: p.sections.map((s) => s.section),
        })),
        ...(redirects.length > 0 ? { redirects } : {}),
        ...(withKeys
            ? {
                  keys: Object.fromEntries(
                      pages.map((p) => [
                          p.path,
                          { id: p.id, sections: p.sections.map((s) => s.key) },
                      ]),
                  ),
              }
            : {}),
        publishedAt: "2026-11-09T00:00:00.000Z",
    };
}

function stamps(
    sections: Record<string, ChangeStamp | null> = {},
    {
        pages = {},
        hidden = [],
        draftEditors = {},
        redirects = {},
    }: {
        pages?: Record<string, ChangeStamp | null>;
        hidden?: string[];
        draftEditors?: Record<string, ChangeStamp>;
        redirects?: Record<string, ChangeStamp | null>;
    } = {},
): ChangeStamps {
    return {
        sections: new Map(
            Object.entries(sections).map(([k, stamp]) => [
                k,
                { stamp, hidden: hidden.includes(k) },
            ]),
        ),
        pages: new Map(
            Object.entries(pages).map(([id, stamp]) => [
                id,
                { stamp, hidden: hidden.includes(id), title: id },
            ]),
        ),
        redirects: new Map(Object.entries(redirects)),
        draftEditors,
    };
}

const BRIDAL_LIVE: Page = {
    id: "p_bridal",
    path: "/bridal",
    title: "Bridal packages",
    sections: [
        { key: "k0", section: HERO },
        { key: "k1", section: text("Intro") },
        { key: "k2", section: text("From our brides") },
    ],
};

describe("change units", () => {
    it("names each change and groups them by who made it", () => {
        const draft: Page = {
            ...BRIDAL_LIVE,
            sections: [
                { key: "k0", section: HERO },
                { key: "k1", section: text("Intro", "Rewritten") },
                { key: "k2", section: text("From our brides") },
                { key: "k9", section: text("Two photos") },
            ],
        };
        const units = changeUnits(
            snapshot([draft], { site: { footer: { value: "Mon 11 to 8" } } }),
            snapshot([BRIDAL_LIVE]),
            stamps(
                { "p_bridal:k1": RITIKA, "p_bridal:k9": ARJUN },
                { draftEditors: { "site:footer": MOHIT } },
            ),
        );

        expect(units.map((u) => [u.key, u.label, u.where, u.editedBy])).toEqual(
            [
                [
                    "section:p_bridal:k1",
                    "Changed · Intro",
                    "Bridal packages",
                    "u_ritika",
                ],
                [
                    "section:p_bridal:k9",
                    "Added · Two photos",
                    "Bridal packages",
                    "u_arjun",
                ],
                ["site:footer", "Changed · Footer", "Every page", "u_mohit"],
            ],
        );
        // Newest editor first.
        expect(groupByPerson(units)).toEqual([
            { userId: "u_arjun", units: ["section:p_bridal:k9"] },
            { userId: "u_mohit", units: ["site:footer"] },
            { userId: "u_ritika", units: ["section:p_bridal:k1"] },
        ]);
    });

    it("lists nothing when the draft is what is live", () => {
        const live = snapshot([BRIDAL_LIVE]);
        expect(changeUnits(live, live, stamps())).toEqual([]);
    });

    it("says a removed section is removed, by whoever removed it", () => {
        const draft = {
            ...BRIDAL_LIVE,
            sections: BRIDAL_LIVE.sections.slice(0, 2),
        };
        const [unit] = changeUnits(
            snapshot([draft]),
            snapshot([BRIDAL_LIVE]),
            stamps({}, { draftEditors: { "section:p_bridal:k2": RITIKA } }),
        );
        expect(unit).toMatchObject({
            key: "section:p_bridal:k2",
            change: "removed",
            label: "Removed · From our brides",
            editedBy: "u_ritika",
        });
    });

    it("says a hidden section is hidden, not removed", () => {
        const draft = {
            ...BRIDAL_LIVE,
            sections: BRIDAL_LIVE.sections.slice(0, 2),
        };
        const [unit] = changeUnits(
            snapshot([draft]),
            snapshot([BRIDAL_LIVE]),
            stamps({ "p_bridal:k2": ARJUN }, { hidden: ["p_bridal:k2"] }),
        );
        expect(unit).toMatchObject({
            label: "Hidden · From our brides",
            editedBy: "u_arjun",
        });
    });

    it("puts a change nobody was stamped for under Earlier changes", () => {
        const draft: Page = {
            ...BRIDAL_LIVE,
            sections: [
                { key: "k0", section: HERO },
                { key: "k1", section: text("Intro", "Older edit") },
                { key: "k2", section: text("From our brides", "New") },
            ],
        };
        const units = changeUnits(
            snapshot([draft]),
            snapshot([BRIDAL_LIVE]),
            stamps({ "p_bridal:k2": RITIKA }),
        );
        expect(units[0]!.editedBy).toBeNull();
        expect(groupByPerson(units).map((g) => g.userId)).toEqual([
            "u_ritika",
            null,
        ]);
    });

    it("counts only the section that moved, not its neighbours", () => {
        const [a, b, c] = BRIDAL_LIVE.sections;
        const draft = { ...BRIDAL_LIVE, sections: [a!, c!, b!] };
        const units = changeUnits(
            snapshot([draft]),
            snapshot([BRIDAL_LIVE]),
            stamps(),
        );
        expect(units).toHaveLength(1);
        expect(units[0]!.change).toBe("moved");
    });

    it("calls the hero the Top of the page (RULES §1)", () => {
        expect(sectionLabel(HERO)).toBe("Top of the page");
        expect(sectionLabel({ type: "text", content: {} })).not.toBe("");
    });

    it("lists a renamed page once, with the old link that forwards in its unit", () => {
        const draft = { ...BRIDAL_LIVE, path: "/bridal-makeup" };
        const units = changeUnits(
            snapshot([draft], {
                redirects: [{ from: "/bridal", to: "/bridal-makeup" }],
            }),
            snapshot([BRIDAL_LIVE]),
            stamps({}, { pages: { p_bridal: RITIKA } }),
        );
        expect(units).toEqual([
            expect.objectContaining({
                key: "page:p_bridal",
                label: "Page link changed",
                editedBy: "u_ritika",
            }),
        ]);
    });

    describe("a renamed page is one unit", () => {
        const renamed = (path: string, sections = BRIDAL_LIVE.sections) =>
            snapshot([{ ...BRIDAL_LIVE, path, sections }], {
                redirects:
                    path === "/bridal" ? [] : [{ from: "/bridal", to: path }],
            });
        const keys = (draft: unknown, withKeys: boolean) =>
            changeUnits(
                draft,
                snapshot([BRIDAL_LIVE], { withKeys }),
                stamps(),
            ).map((u) => [u.key, u.label]);

        it.each([true, false])("live with keys: %s", (withKeys) => {
            expect(keys(renamed("/bridal-makeup"), withKeys)).toEqual([
                ["page:p_bridal", "Page link changed"],
            ]);
            // Renamed twice: chains collapse to one forward from the live link.
            expect(keys(renamed("/bridal-looks"), withKeys)).toEqual([
                ["page:p_bridal", "Page link changed"],
            ]);
            expect(keys(renamed("/bridal"), withKeys)).toEqual([]);
        });

        it("keeps a section edit its own unit on a page from before keys", () => {
            const sections = [
                BRIDAL_LIVE.sections[0]!,
                { key: "k1", section: text("Intro", "Rewritten") },
                BRIDAL_LIVE.sections[2]!,
            ];
            expect(keys(renamed("/bridal-makeup", sections), false)).toEqual([
                ["page:p_bridal", "Page link changed"],
                ["section:p_bridal:k1", "Changed · Intro"],
            ]);
        });
    });

    it("names who added an old link when that is all that changed", () => {
        const units = changeUnits(
            snapshot([BRIDAL_LIVE], {
                redirects: [{ from: "/bridal-packages", to: "/bridal" }],
            }),
            snapshot([BRIDAL_LIVE]),
            stamps({}, { redirects: { "/bridal-packages": ARJUN } }),
        );
        expect(units).toEqual([
            expect.objectContaining({
                key: "page:p_bridal",
                label: "Old links that forward",
                editedBy: "u_arjun",
            }),
        ]);
    });

    it("makes a new page's sections go with the page", () => {
        const page: Page = {
            id: "p_new",
            path: "/trial",
            title: "Trial",
            sections: [{ key: "t1", section: text("Book a trial") }],
        };
        const units = changeUnits(
            snapshot([BRIDAL_LIVE, page]),
            snapshot([BRIDAL_LIVE]),
            stamps({}, { pages: { p_new: MOHIT } }),
        );
        expect(units).toEqual([
            expect.objectContaining({
                key: "page:p_new",
                label: "New page",
                editedBy: "u_mohit",
            }),
            expect.objectContaining({
                key: "section:p_new:t1",
                requires: ["page:p_new"],
                // Nobody stamped the section: the page's maker made it.
                editedBy: "u_mohit",
            }),
        ]);
    });

    it("lists a deleted page and its sections, by who deleted it", () => {
        const units = changeUnits(
            snapshot([]),
            snapshot([BRIDAL_LIVE]),
            stamps({}, { draftEditors: { "page:p_bridal": MOHIT } }),
        );
        expect(units.map((u) => [u.key, u.change, u.editedBy])).toEqual([
            ["page:p_bridal", "removed", "u_mohit"],
            ["section:p_bridal:k0", "removed", "u_mohit"],
            ["section:p_bridal:k1", "removed", "u_mohit"],
            ["section:p_bridal:k2", "removed", "u_mohit"],
        ]);
        expect(units[1]!.requires).toEqual(["page:p_bridal"]);
    });

    it("reads a live site published before keys by place", () => {
        const draft = {
            ...BRIDAL_LIVE,
            sections: BRIDAL_LIVE.sections.slice(0, 1),
        };
        const units = changeUnits(
            snapshot([draft]),
            snapshot([BRIDAL_LIVE], { withKeys: false }),
            stamps(),
        );
        expect(units.map((u) => u.key)).toEqual([
            "section:p_bridal:@1",
            "section:p_bridal:@2",
        ]);
    });

    it("gives a unit a new fingerprint when its change changes", () => {
        const edit = (body: string) =>
            changeUnits(
                snapshot([
                    {
                        ...BRIDAL_LIVE,
                        sections: [
                            BRIDAL_LIVE.sections[0]!,
                            { key: "k1", section: text("Intro", body) },
                            BRIDAL_LIVE.sections[2]!,
                        ],
                    },
                ]),
                snapshot([BRIDAL_LIVE]),
                stamps(),
            )[0]!.fingerprint;
        expect(edit("One")).toBe(edit("One"));
        expect(edit("One")).not.toBe(edit("Two"));
    });
});

describe("no drift from the existing count", () => {
    const sectionUnits = (draft: Page[], live: Page[], withKeys = true) =>
        changeUnits(
            snapshot(draft),
            snapshot(live, { withKeys }),
            stamps(),
        ).filter((u) => u.kind === "section").length;
    const positional = (draft: Page[], live: Page[]) =>
        countPendingSectionChanges(
            snapshot(draft).pages as PublishablePage[],
            snapshot(live),
        );

    const NEW_PAGE: Page = {
        id: "p_new",
        path: "/trial",
        title: "Trial",
        sections: [{ key: "t1", section: text("Book") }],
    };
    const cases: [string, Page[]][] = [
        [
            "an edit in place",
            [
                {
                    ...BRIDAL_LIVE,
                    sections: [
                        BRIDAL_LIVE.sections[0]!,
                        { key: "k1", section: text("Intro", "New") },
                        BRIDAL_LIVE.sections[2]!,
                    ],
                },
            ],
        ],
        [
            "a section added at the end",
            [
                {
                    ...BRIDAL_LIVE,
                    sections: [
                        ...BRIDAL_LIVE.sections,
                        { key: "k9", section: text("More") },
                    ],
                },
            ],
        ],
        [
            "the last section removed",
            [{ ...BRIDAL_LIVE, sections: BRIDAL_LIVE.sections.slice(0, 2) }],
        ],
        ["a new page", [BRIDAL_LIVE, NEW_PAGE]],
        ["a page deleted", []],
    ];
    it.each(cases)("counts %s as the section count does", (_name, draft) => {
        expect(sectionUnits(draft, [BRIDAL_LIVE])).toBe(
            positional(draft, [BRIDAL_LIVE]),
        );
    });

    it("counts by place against a snapshot from before keys, whatever moved", () => {
        const [a, b, c] = BRIDAL_LIVE.sections;
        const draft = [
            {
                ...BRIDAL_LIVE,
                sections: [a!, { key: "k9", section: text("New") }, b!, c!],
            },
        ];
        expect(sectionUnits(draft, [BRIDAL_LIVE], false)).toBe(
            positional(draft, [BRIDAL_LIVE]),
        );
    });
});

describe("carrying stamps across a save", () => {
    const by = { userId: "u_mohit", at: new Date("2026-11-17T09:00:00Z") };
    const row = (key: string, heading: string, stamp?: ChangeStamp) => ({
        key,
        ...text(heading),
        hidden: false,
        lastEditedByUserId: stamp?.userId ?? null,
        lastEditedAt: stamp ? new Date(stamp.at) : null,
    });

    it("stamps only the section whose content changed", () => {
        const before = [row("k1", "Intro", RITIKA), row("k2", "Brides", ARJUN)];
        const { stamps: after, removed } = carryStamps(
            before,
            [
                { key: "k1", ...text("Intro, rewritten"), hidden: false },
                { key: "k2", ...text("Brides"), hidden: false },
            ],
            by,
        );
        expect(after.map((s) => s.lastEditedByUserId)).toEqual([
            "u_mohit",
            "u_arjun",
        ]);
        expect(removed).toEqual([]);
    });

    it("leaves every stamp alone on a save that changes nothing", () => {
        const before = [row("k1", "Intro", RITIKA)];
        const { stamps: after } = carryStamps(
            before,
            [{ key: "k1", ...text("Intro"), hidden: false }],
            by,
        );
        expect(after[0]).toEqual({
            lastEditedByUserId: "u_ritika",
            lastEditedAt: new Date(RITIKA.at),
        });
    });

    it("makes the last person to edit a section its editor", () => {
        const before = [row("k1", "Intro, Ritika's", RITIKA)];
        const { stamps: after } = carryStamps(
            before,
            [{ key: "k1", ...text("Intro, Mohit's"), hidden: false }],
            by,
        );
        expect(after[0]!.lastEditedByUserId).toBe("u_mohit");
    });

    it("stamps a hidden or moved section and reports a removed one", () => {
        const before = [
            row("k1", "A", RITIKA),
            row("k2", "B", RITIKA),
            row("k3", "C", RITIKA),
            row("k4", "D", RITIKA),
        ];
        const { stamps: after, removed } = carryStamps(
            before,
            [
                { key: "k3", ...text("C"), hidden: false },
                { key: "k1", ...text("A"), hidden: false },
                { key: "k2", ...text("B"), hidden: true },
            ],
            by,
        );
        expect(after.map((s) => s.lastEditedByUserId)).toEqual([
            "u_mohit", // moved
            "u_ritika", // only its neighbour moved
            "u_mohit", // hidden
        ]);
        expect(removed).toEqual(["k4"]);
    });
});

describe("readDraftEditors", () => {
    it("keeps well-formed stamps and drops the rest", () => {
        expect(
            readDraftEditors({
                "site:footer": MOHIT,
                "site:menu": { userId: 3 },
            }),
        ).toEqual({ "site:footer": MOHIT });
        expect(readDraftEditors(null)).toEqual({});
    });
});
