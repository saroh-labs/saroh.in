import { busyPeople } from "./busy-people";

const conn = (id: string, status: string, staff = "s1") => ({
    id,
    status,
    membership: { staffMember: { id: staff } },
});

describe("who's connected, by person", () => {
    it("a working account is CONNECTED", () => {
        expect(busyPeople([conn("a", "CONNECTED")], new Set(["a"]))).toEqual([
            { staffId: "s1", state: "CONNECTED" },
        ]);
    });
    it("a live account held back by the plan is PAUSED, not LAPSED", () => {
        expect(busyPeople([conn("a", "CONNECTED")], new Set())).toEqual([
            { staffId: "s1", state: "PAUSED" },
        ]);
        expect(busyPeople([conn("a", "CONNECTED")], null)).toEqual([
            { staffId: "s1", state: "PAUSED" },
        ]);
    });
    it("a lapsed account is LAPSED", () => {
        expect(busyPeople([conn("a", "LAPSED")], new Set())).toEqual([
            { staffId: "s1", state: "LAPSED" },
        ]);
    });
    it("one working account wins over a paused or lapsed one", () => {
        expect(
            busyPeople(
                [
                    conn("a", "LAPSED"),
                    conn("b", "CONNECTED"),
                    conn("c", "CONNECTED"),
                ],
                new Set(["c"]),
            ),
        ).toEqual([{ staffId: "s1", state: "CONNECTED" }]);
    });
});
