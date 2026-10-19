import type { ShareOutBusiness, ShareOutManager } from "./share-out";
import { planShareOut, shareOutOrder } from "./share-out";

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

const manager = (
    id: string,
    name: string,
    load = 0,
    capacity: number | null = null,
): ShareOutManager => ({
    platformAdminId: id,
    name,
    userId: `user-${id}`,
    load,
    capacity,
});

const business = (
    id: string,
    { paying = false, made = 1, owners = [] as string[] } = {},
): ShareOutBusiness => ({
    organizationId: id,
    paying,
    createdAt: day(made),
    ownerUserIds: owners,
});

describe("Share out evenly (DEC-169, U25)", () => {
    it("puts paying businesses first, then the oldest", () => {
        const order = shareOutOrder([
            business("free-old", { made: 1 }),
            business("paying-new", { paying: true, made: 9 }),
            business("paying-old", { paying: true, made: 2 }),
            business("free-new", { made: 8 }),
        ]).map((b) => b.organizationId);
        expect(order).toEqual([
            "paying-old",
            "paying-new",
            "free-old",
            "free-new",
        ]);
    });

    it("gives each business to whoever looks after the fewest", () => {
        const plan = planShareOut(
            [
                business("a", { made: 1 }),
                business("b", { made: 2 }),
                business("c", { made: 3 }),
                business("d", { made: 4 }),
            ],
            [manager("m1", "Asha", 2), manager("m2", "Vikram", 0)],
        );
        // Vikram has none: he takes two before they are level, then the
        // tie goes by name.
        expect(plan.assignments).toEqual([
            { organizationId: "a", platformAdminId: "m2" },
            { organizationId: "b", platformAdminId: "m2" },
            { organizationId: "c", platformAdminId: "m1" },
            { organizationId: "d", platformAdminId: "m2" },
        ]);
        expect(plan.left).toEqual([]);
    });

    it("stops at someone's capacity and leaves what nobody can take", () => {
        const plan = planShareOut(
            [
                business("a"),
                business("b", { made: 2 }),
                business("c", { made: 3 }),
            ],
            [manager("m1", "Asha", 1, 2), manager("m2", "Vikram", 3, 3)],
        );
        expect(plan.assignments).toEqual([
            { organizationId: "a", platformAdminId: "m1" },
        ]);
        expect(plan.left).toEqual(["b", "c"]);
    });

    it("never gives someone a business they own", () => {
        const plan = planShareOut(
            [business("own", { owners: ["user-m1"] })],
            [manager("m1", "Asha", 0), manager("m2", "Vikram", 5)],
        );
        expect(plan.assignments).toEqual([
            { organizationId: "own", platformAdminId: "m2" },
        ]);
    });

    it("leaves everything when there is nobody to give to", () => {
        expect(planShareOut([business("a")], [])).toEqual({
            assignments: [],
            left: ["a"],
        });
    });
});
