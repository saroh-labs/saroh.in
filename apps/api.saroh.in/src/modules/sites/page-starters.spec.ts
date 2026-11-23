import { starterSections, teamPageWhere } from "./page-starters";

/**
 * New page types (A7, DEC-248): each starts with sections that pass their
 * contracts, filled from the business, and Our team shows only the people
 * who opted in.
 */
function tx({
    service = { id: "svc_1" },
    services = [{ id: "svc_1" }, { id: "svc_2" }],
    people = [] as { name: string; title: string | null }[],
    book = { id: "pg_book" } as { id: string } | null,
} = {}) {
    return {
        service: {
            findFirst: jest.fn().mockResolvedValue(service),
            findMany: jest.fn().mockResolvedValue(services),
        },
        staffMember: { findMany: jest.fn().mockResolvedValue(people) },
        page: { findFirst: jest.fn().mockResolvedValue(book) },
    };
}
const input = (starter: "SERVICE" | "OFFER" | "TEAM") => ({
    organizationId: "org_1",
    siteId: "site_1",
    title: "Sample page",
    starter,
});

describe("page starters", () => {
    it("Service detail: top, included, its price and booking, a question", async () => {
        const got = await starterSections(tx() as never, input("SERVICE"));
        expect(got.map((s) => s.type)).toEqual([
            "hero",
            "richText",
            "servicesList",
            "booking",
            "faq",
        ]);
        expect(got[2]?.content).toMatchObject({ serviceIds: ["svc_1"] });
    });

    it("Service detail with no service: no price or booking", async () => {
        const got = await starterSections(
            tx({ service: null as never }) as never,
            input("SERVICE"),
        );
        expect(got.map((s) => s.type)).toEqual(["hero", "richText"]);
    });

    it("Offer: Book to the Book page, and its services read live", async () => {
        const got = await starterSections(tx() as never, input("OFFER"));
        expect(got[0]?.content).toMatchObject({
            cta: { action: { kind: "page", pageId: "pg_book" } },
        });
        expect(got[1]?.content).toMatchObject({
            serviceIds: ["svc_1", "svc_2"],
        });
    });

    it("Our team: only the people an owner or admin picked, bound to them", async () => {
        const t = tx({
            people: [
                { id: "st_1", name: "Ritika", title: "Bridal artist" },
                { id: "st_2", name: "Pooja", title: null },
            ],
        });
        const got = await starterSections(t as never, input("TEAM"));
        expect(t.staffMember.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: teamPageWhere("org_1") }),
        );
        expect(teamPageWhere("org_1")).toMatchObject({ showOnTeamPage: true });
        expect(got[1]?.content).toMatchObject({
            variant: "team",
            staffId: "st_1",
            name: "Ritika",
            role: "Bridal artist",
            people: [{ staffId: "st_2", name: "Pooja" }],
        });
    });

    it("Our team with nobody opted in shows nobody", async () => {
        const got = await starterSections(
            tx({ book: null }) as never,
            input("TEAM"),
        );
        expect(got.map((s) => s.type)).toEqual(["hero"]);
        expect(got[0]?.content).not.toHaveProperty("cta");
    });
});
