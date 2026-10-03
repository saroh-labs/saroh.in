import { describe, expect, it } from "vitest";

import {
    ASHA,
    fakeCatalog,
    fakePricing,
    fakeVersion,
    RAVI,
} from "@/test/pricing-fixture";

import {
    changeCount,
    checkDraft,
    conflictMessage,
    draftSummary,
    namesList,
    otherEditors,
    parseConflict,
    publishedByName,
    tabFrom,
    tabLabels,
    upcomingVersions,
} from "./pricing-draft";

describe("tabFrom", () => {
    it("opens the tab the link names", () => {
        expect(tabFrom("versions")).toBe("versions");
        expect(tabFrom(["publish", "plans"])).toBe("publish");
    });

    it("opens Plans for an unknown or missing tab", () => {
        expect(tabFrom("review")).toBe("plans");
        expect(tabFrom("")).toBe("plans");
        expect(tabFrom(undefined)).toBe("plans");
    });
});

describe("tabLabels", () => {
    it("counts versions, and changes only while there is a draft", () => {
        expect(
            tabLabels({ versions: 2, hasDraft: false, changes: 0 }),
        ).toMatchObject({
            versions: "Versions · 2",
            publish: "Review & publish",
        });
        expect(
            tabLabels({ versions: 2, hasDraft: true, changes: 1 }).publish,
        ).toBe("Review & publish · 1");
    });
});

describe("checkDraft", () => {
    it("says what a draft changes from live", () => {
        const live = fakeCatalog();
        const draft = fakeCatalog();
        draft.plans = draft.plans.map((p) =>
            p.id === "c" ? { ...p, name: "Plan Z" } : p,
        );
        const check = checkDraft(live, draft);
        expect(check.valid).toBe(true);
        expect(check.changes).toEqual(["Plan C renamed to Plan Z"]);
        expect(changeCount(check.changes.length)).toBe("1 change");
    });

    it("lists what stops an invalid draft, and no changes", () => {
        const draft = fakeCatalog();
        draft.plans = draft.plans.map((p) => ({ ...p, featured: true }));
        const check = checkDraft(fakeCatalog(), draft);
        expect(check.valid).toBe(false);
        expect(check.errors.join(" ")).toContain(
            "Only one plan can be highlighted",
        );
        expect(check.changes).toEqual([]);
    });
});

describe("draftSummary", () => {
    const check = {
        valid: true,
        errors: [],
        changes: ["One", "Two", "Three", "Four"],
    };

    it("names who it affects, the revenue change and the first two changes", () => {
        const line = draftSummary({
            check,
            impact: {
                items: [],
                touched: 2,
                total: 3,
                revenue: { nowPaise: 11_100, nextPaise: 22_200 },
            },
        });
        expect(line).toMatch(
            /^2 businesses affected · \+.+111 a month if everyone moves · One · Two · and 2 more$/,
        );
    });

    it("leaves out revenue that doesn't move, and says nobody is affected", () => {
        expect(
            draftSummary({
                check: { ...check, changes: ["One"] },
                impact: {
                    items: [],
                    touched: 0,
                    total: 3,
                    revenue: { nowPaise: 111, nextPaise: 111 },
                },
            }),
        ).toBe("No business affected · One");
    });

    it("says only the changes until the impact is worked out", () => {
        expect(
            draftSummary({
                check: { ...check, changes: ["One"] },
                impact: null,
            }),
        ).toBe("One");
    });

    it("says what is wrong with an invalid draft", () => {
        expect(
            draftSummary({
                check: { valid: false, errors: ["A", "B"], changes: [] },
                impact: null,
            }),
        ).toBe("Not ready to publish: A · and 1 more");
    });
});

describe("editors", () => {
    it("names everyone else who edited the draft (D-2)", () => {
        expect(otherEditors([ASHA, RAVI], ASHA)).toEqual([RAVI]);
        expect(namesList([ASHA, RAVI])).toBe("Asha and Ravi");
        expect(namesList([ASHA, RAVI, ASHA, RAVI])).toBe(
            "Asha, Ravi and 2 others",
        );
    });
});

describe("a refused save", () => {
    it("names who saved since", () => {
        const c = parseConflict({
            revision: 4,
            updatedBy: RAVI,
            updatedAt: "2026-10-01T00:00:00.000Z",
        });
        expect(c).toEqual({
            revision: 4,
            updatedBy: RAVI,
            updatedAt: "2026-10-01T00:00:00.000Z",
        });
        expect(c && conflictMessage(c)).toBe(
            "Ravi saved the draft since. Reload the draft to see their changes.",
        );
    });

    it("says when the draft was published or discarded meanwhile", () => {
        const c = parseConflict({
            revision: null,
            updatedBy: null,
            updatedAt: null,
        });
        expect(c?.revision).toBeNull();
        expect(c && conflictMessage(c)).toMatch(/published or discarded/);
    });

    it("is not a conflict without the draft's shape", () => {
        expect(parseConflict(undefined)).toBeNull();
        expect(parseConflict(["x"])).toBeNull();
    });
});

describe("versions", () => {
    it("lists what is still to go live, soonest first", () => {
        const pricing = fakePricing({
            versions: [
                fakeVersion({
                    version: 3,
                    status: "scheduled",
                    goLiveAt: "2026-12-01T00:00:00.000Z",
                }),
                fakeVersion({
                    version: 2,
                    status: "waiting",
                    goLiveAt: "2026-10-02T00:00:00.000Z",
                }),
                fakeVersion(),
            ],
        });
        expect(upcomingVersions(pricing).map((v) => v.version)).toEqual([2, 3]);
    });

    it("says the installer published as the Saroh team", () => {
        expect(publishedByName(fakeVersion())).toBe("Saroh team");
        expect(publishedByName(fakeVersion({ publishedBy: ASHA }))).toBe(
            "Asha",
        );
    });
});
