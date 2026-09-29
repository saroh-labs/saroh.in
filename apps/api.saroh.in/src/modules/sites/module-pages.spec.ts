/**
 * The module page states the public site read carries (G15), without a
 * database: which kinds a snapshot holds, and what a state that can't be
 * read becomes. The real gates are exercised in `module-pages.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        organizationModule: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
    },
}));

import {
    publicModulePageStates,
    snapshotModulePageKinds,
} from "./module-pages";

describe("snapshotModulePageKinds", () => {
    it("lists the module kinds a snapshot holds, in the menu's order", () => {
        expect(
            snapshotModulePageKinds({
                pages: [
                    { path: "/", title: "Home" },
                    { path: "/contact", kind: "CONTACT" },
                    { path: "/book", kind: "BOOK" },
                    { path: "/about", kind: "FREE" },
                ],
            }),
        ).toEqual(["BOOK", "CONTACT"]);
    });

    it("finds none in a snapshot published before module pages", () => {
        expect(snapshotModulePageKinds({ pages: [{ path: "/" }] })).toEqual([]);
        expect(snapshotModulePageKinds({})).toEqual([]);
        expect(snapshotModulePageKinds(null)).toEqual([]);
        expect(snapshotModulePageKinds({ pages: [null, 3] })).toEqual([]);
    });
});

describe("publicModulePageStates", () => {
    it("asks nothing, and adds nothing, for a site without module pages", async () => {
        await expect(
            publicModulePageStates({ pages: [{ path: "/" }] }, "org_1"),
        ).resolves.toBeNull();
    });

    it("says Journal and Contact are on: they need nothing beyond the site", async () => {
        await expect(
            publicModulePageStates(
                {
                    pages: [
                        { path: "/journal", kind: "JOURNAL" },
                        { path: "/contact", kind: "CONTACT" },
                    ],
                },
                "org_1",
            ),
        ).resolves.toEqual({ JOURNAL: "on", CONTACT: "on" });
    });
});
