// Our team read live (round 3): a bound person shows only while still
// chosen, under the name Team has now; a typed-in person is drawn as typed,
// and a page with no bound people is returned untouched.
jest.mock("@saroh/database", () => ({
    prisma: { staffMember: { findMany: jest.fn() } },
}));

import { prisma } from "@saroh/database";

import {
    boundStaffIds,
    liveTeamSection,
    liveTeamSnapshot,
    withLiveTeam,
} from "./team-live";

const snapshot = (sections: unknown[]) => ({
    site: { name: "Northwind" },
    pages: [{ path: "/our-team", title: "Our team", sections }],
    keys: {
        "/our-team": { id: "p1", sections: sections.map((_, i) => `k${i}`) },
    },
});

const team = {
    type: "person",
    contractVersion: 1,
    content: {
        variant: "team",
        title: "Our team",
        staffId: "st_1",
        name: "Asha (old)",
        role: "Warehouse lead",
        people: [
            { staffId: "st_2", name: "Farah", role: "Trade accounts" },
            { name: "Typed Person", role: "Guest" },
        ],
    },
};

describe("Our team, read live", () => {
    it("returns a snapshot with no bound people as the same object (live sites look the same)", () => {
        const plain = snapshot([
            { type: "hero", content: { heading: "Hi" } },
            {
                type: "person",
                content: {
                    variant: "team",
                    name: "Anika",
                    people: [{ name: "B" }],
                },
            },
        ]);
        expect(boundStaffIds(plain).size).toBe(0);
        // The pin: unchanged sections stay deep-equal through the filter.
        expect(withLiveTeam(plain, new Map())).toEqual(plain);
    });

    it("reads nothing for a page with no bound people, and hands back the same snapshot", async () => {
        const plain = snapshot([{ type: "hero", content: { heading: "Hi" } }]);
        await expect(liveTeamSnapshot(plain, "org_1")).resolves.toBe(plain);
        expect(prisma.staffMember.findMany).not.toHaveBeenCalled();
    });

    it("asks only for this business's chosen, active people", async () => {
        (prisma.staffMember.findMany as jest.Mock).mockResolvedValueOnce([
            { id: "st_2", name: "Farah" },
        ]);
        await liveTeamSnapshot(snapshot([team]), "org_1");
        expect(prisma.staffMember.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    status: "ACTIVE",
                    showOnTeamPage: true,
                }),
            }),
        );
    });

    it("finds every team member a snapshot names", () => {
        expect([...boundStaffIds(snapshot([team]))].sort()).toEqual([
            "st_1",
            "st_2",
        ]);
    });

    it("keeps chosen people under their live name, and the typed-in as typed", () => {
        const out = liveTeamSection(
            team.content,
            new Map([
                ["st_1", "Asha Rao"],
                ["st_2", "Farah Sheikh"],
            ]),
        );
        expect(out).toMatchObject({
            title: "Our team",
            staffId: "st_1",
            name: "Asha Rao",
            role: "Warehouse lead",
            people: [
                { staffId: "st_2", name: "Farah Sheikh" },
                { name: "Typed Person" },
            ],
        });
    });

    it("takes off someone no longer chosen, moving the next person up", () => {
        const out = liveTeamSection(team.content, new Map([["st_2", "Farah"]]));
        expect(out).toMatchObject({
            staffId: "st_2",
            name: "Farah",
            role: "Trade accounts",
            people: [{ name: "Typed Person" }],
        });
        expect(JSON.stringify(out)).not.toContain("Asha");
    });

    it("drops a section left with nobody, and its key", () => {
        const only = {
            type: "person",
            content: { variant: "team", staffId: "st_1", name: "Asha" },
        };
        const out = withLiveTeam(
            snapshot([{ type: "hero", content: {} }, only]),
            new Map(),
        ) as ReturnType<typeof snapshot>;
        expect(out.pages[0]?.sections).toHaveLength(1);
        expect(out.keys["/our-team"]?.sections).toEqual(["k0"]);
        expect(JSON.stringify(out)).not.toContain("Asha");
    });
});
