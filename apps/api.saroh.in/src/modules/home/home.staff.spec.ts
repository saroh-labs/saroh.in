import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";
import type { HomeInput } from "./home-model";
import {
    diaryWhere,
    inStores,
    isStaffView,
    onOneStore,
    readStaffNarrow,
    seesBusinessBookings,
    storeSql,
    storeWhere,
} from "./home-staff";
import { weekScope } from "./home-week";
import { HomeService } from "./home.service";

/**
 * The staff landing (round 2, F11): a Member, Front desk or Dentist lands
 * on their own day — the storefronts they work on, their own diary — and
 * every part still follows their own capabilities (DEC-039). The reads
 * against a real Postgres are `home.staff.db.spec.ts`.
 */

const ORG = "org_rye";

const MEMBER_ACTIONS = new Set<OrgAction>([
    "org:read",
    "store:read",
    "product-review:read",
    "booking:read",
    "contact:read",
    "order:stage",
] as OrgAction[]);

function member(extra: OrgAction[] = []): HomeInput {
    return {
        organizationId: ORG,
        userId: "user_arjun",
        organizationRole: "MEMBER",
        organizationActions: new Set([...MEMBER_ACTIONS, ...extra]),
    };
}

interface Fixture {
    roles?: { store: { id: string; name: string } }[];
    storefronts?: number;
    staffMember?: {
        id: string;
        status: string;
        services: { serviceId: string }[];
    } | null;
}

/** A client whose every table answers "nothing", but the staff reads. */
function fakeDb(fixture: Fixture = {}) {
    const calls: { table: string; method: string; args: unknown }[] = [];
    const answers: Record<string, Record<string, unknown>> = {
        storeMembers: { findMany: fixture.roles ?? [] },
        store: { count: fixture.storefronts ?? 2 },
        membership: {
            findUnique:
                fixture.staffMember === undefined
                    ? null
                    : { staffMember: fixture.staffMember },
        },
        businessProfile: { findUnique: { timezone: "Asia/Kolkata" } },
    };
    const empty: Record<string, unknown> = {
        findMany: [],
        count: 0,
        findFirst: null,
        findUnique: null,
        groupBy: [],
        aggregate: { _max: {} },
    };
    const raw: unknown[] = [];
    const db = new Proxy(
        {},
        {
            get(_t, table: string) {
                if (table === "$queryRaw") {
                    return (sql: unknown) => {
                        raw.push(sql);
                        return Promise.resolve([]);
                    };
                }
                return new Proxy(
                    {},
                    {
                        get(_m, method: string) {
                            return (args: unknown) => {
                                calls.push({ table, method, args });
                                const own = answers[table];
                                const value =
                                    own && method in own
                                        ? own[method]
                                        : empty[method];
                                return Promise.resolve(value);
                            };
                        },
                    },
                );
            },
        },
    );
    return { db, calls, raw };
}

function service(db: unknown, views: string[] = ["COMMERCE"]) {
    const availability = {
        listViews: jest.fn().mockResolvedValue(
            views.map((key) => ({
                key,
                label: key,
                readiness: "ACTIVE",
                blockers: [],
            })),
        ),
    } as unknown as ModuleAvailabilityService;
    return new HomeService(availability, db as never);
}

describe("isStaffView", () => {
    it("lands a Member, and a role the business made, on the staff view", () => {
        // A custom role resolves to MEMBER in the request context.
        expect(isStaffView(member())).toBe(true);
    });

    it("keeps an Owner, an Admin and a Reviewer on their own Home", () => {
        for (const role of ["OWNER", "ADMIN", "REVIEWER"] as const) {
            expect(
                isStaffView({
                    organizationId: ORG,
                    userId: "u",
                    organizationRole: role,
                }),
            ).toBe(false);
        }
    });

    it("has no staff view without a viewer to narrow to", () => {
        expect(
            isStaffView({ organizationId: ORG, organizationRole: "MEMBER" }),
        ).toBe(false);
    });
});

describe("readStaffNarrow", () => {
    const HILL = { id: "store_hill", name: "Hill Road" };
    const ONLINE = { id: "store_online", name: "Online" };

    it("narrows to the storefronts the person has a role on", async () => {
        const { db, calls } = fakeDb({ roles: [{ store: HILL }] });
        const read = await readStaffNarrow(db as never, member());
        expect(read.staff).toEqual({ stores: [HILL], ownDiary: false });
        expect(read.narrow).toEqual({ storeIds: ["store_hill"], staff: null });
        // Their own roles, in this business's live storefronts only.
        const roles = calls.find((c) => c.table === "storeMembers");
        expect(roles?.args).toMatchObject({
            where: {
                userId: "user_arjun",
                store: { organizationId: ORG, deletedAt: null },
            },
        });
    });

    it("means every storefront when the person has no storefront role", async () => {
        const { db } = fakeDb({ roles: [] });
        const read = await readStaffNarrow(db as never, member());
        expect(read.staff.stores).toBeNull();
        expect(read.narrow.storeIds).toBeNull();
    });

    it("says nothing is narrowed when they work on every storefront", async () => {
        const { db } = fakeDb({
            roles: [{ store: HILL }, { store: ONLINE }],
            storefronts: 2,
        });
        const read = await readStaffNarrow(db as never, member());
        expect(read.staff.stores).toBeNull();
        expect(read.narrow.storeIds).toBeNull();
    });

    it("narrows Today to the staff member they are on the diary as", async () => {
        const { db } = fakeDb({
            staffMember: {
                id: "staff_arun",
                status: "ACTIVE",
                services: [{ serviceId: "svc_clean" }],
            },
        });
        const read = await readStaffNarrow(db as never, member());
        expect(read.narrow.staff).toEqual({
            id: "staff_arun",
            serviceIds: ["svc_clean"],
        });
        expect(read.staff.ownDiary).toBe(true);
    });

    it("keeps the whole diary for an archived staff member", async () => {
        const { db } = fakeDb({
            staffMember: { id: "staff_old", status: "ARCHIVED", services: [] },
        });
        const read = await readStaffNarrow(db as never, member());
        expect(read.narrow.staff).toBeNull();
        expect(read.staff.ownDiary).toBe(false);
    });

    it("never gives Calendar only the whole diary off it (#868)", async () => {
        const { db } = fakeDb({ staffMember: null });
        const calendarOnly = {
            ...member(),
            organizationRoleKey: "calendar-only",
        };
        const read = await readStaffNarrow(db as never, calendarOnly);
        // A diary nobody's booking is on: none, never everyone's.
        expect(read.narrow.staff).toEqual({ id: "", serviceIds: [] });
        expect(diaryWhere(read.narrow.staff)).toEqual({ staffId: "" });
        expect(read.staff.ownDiary).toBe(false);
        // And no count of the business's bookings this week.
        expect(seesBusinessBookings(calendarOnly)).toBe(false);
        expect(seesBusinessBookings(member())).toBe(true);
    });
});

describe("the narrowing's pieces", () => {
    it("filters by storefront only when narrowed", () => {
        expect(storeWhere(null)).toEqual({});
        expect(storeWhere(["a", "b"])).toEqual({ storeId: { in: ["a", "b"] } });
        expect(storeSql(null, "o").sql).toBe("");
        const sql = storeSql(["a", "b"], "o");
        expect(sql.sql).toContain(`o."storeId" IN`);
        expect(sql.values).toEqual(["a", "b"]);
        // Narrowed to nothing matches nothing, never everything.
        expect(storeSql([], "o").sql).toContain("FALSE");
    });

    it("keeps only the narrowed storefronts' rows", () => {
        const rows = [{ storeId: "a" }, { storeId: "b" }];
        expect(inStores(rows, null)).toEqual(rows);
        expect(inStores(rows, ["b"])).toEqual([{ storeId: "b" }]);
    });

    it("reads a staff member's own bookings, and those nobody took for their services", () => {
        expect(diaryWhere(null)).toEqual({});
        expect(diaryWhere({ id: "s1", serviceIds: [] })).toEqual({
            staffId: "s1",
        });
        expect(diaryWhere({ id: "s1", serviceIds: ["svc"] })).toEqual({
            OR: [
                { staffId: "s1" },
                { staffId: null, serviceId: { in: ["svc"] } },
            ],
        });
    });

    it("opens the Orders list on the one storefront a count covers", () => {
        expect(onOneStore("/commerce/orders", ["hill"])).toBe(
            "/commerce/orders?storefront=hill",
        );
        expect(onOneStore("/commerce/orders", ["a", "b"])).toBe(
            "/commerce/orders",
        );
        expect(onOneStore("/commerce/orders", null)).toBe("/commerce/orders");
    });
});

describe("Home for a staff member (F11)", () => {
    it("answers the staff view, narrowed to Hill Road", async () => {
        const { db, raw, calls } = fakeDb({
            roles: [{ store: { id: "store_hill", name: "Hill Road" } }],
        });
        const home = await service(db).build(member());

        expect(home.view).toBe("staff");
        expect(home.staff).toEqual({
            stores: [{ id: "store_hill", name: "Hill Road" }],
            ownDiary: false,
        });
        // Open orders: Hill Road's only.
        const openOrders = raw[0] as { values: unknown[] };
        expect(openOrders.values).toContain("store_hill");
        // Reviews: Hill Road's only.
        const reviews = calls.find(
            (c) => c.table === "productReview" && c.method === "findMany",
        );
        expect(reviews?.args).toMatchObject({
            where: { storeId: { in: ["store_hill"] } },
        });
    });

    it("reads every storefront for a Member with no storefront role", async () => {
        const { db, raw } = fakeDb({ roles: [] });
        const home = await service(db).build(member());
        expect(home.view).toBe("staff");
        expect(home.staff?.stores).toBeNull();
        const openOrders = raw[0] as { sql: string };
        expect(openOrders.sql).not.toContain(`"storeId" IN`);
    });

    it("never reads storefront roles for an Owner", async () => {
        const { db, calls } = fakeDb();
        const home = await service(db).build({
            organizationId: ORG,
            userId: "user_priya",
            organizationRole: "OWNER",
        });
        expect(home.view).toBe("business");
        expect(home.staff).toBeUndefined();
        expect(calls.some((c) => c.table === "storeMembers")).toBe(false);
    });

    it("offers a staff member no setup rows they can't act on", async () => {
        const availability = {
            listViews: jest.fn().mockResolvedValue([
                {
                    key: "COMMERCE",
                    label: "Commerce",
                    readiness: "ACTIVE",
                    blockers: [],
                },
                {
                    key: "CRM",
                    label: "CRM",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        {
                            code: "CRM_NO_PIPELINE",
                            message:
                                "Create a pipeline to start tracking leads.",
                        },
                    ],
                },
            ]),
        } as unknown as ModuleAvailabilityService;
        const codes = async (input: HomeInput) =>
            (
                await new HomeService(
                    availability,
                    fakeDb({ roles: [] }).db as never,
                ).build(input)
            ).actions.map((a) => a.code);

        expect(await codes(member())).not.toContain("CRM_SETUP");
        // Someone given module:manage (a custom role, or an extra) may.
        expect(await codes(member(["module:manage"]))).toContain("CRM_SETUP");
        // An Owner's Home keeps it.
        expect(
            await codes({
                organizationId: ORG,
                userId: "user_priya",
                organizationRole: "OWNER",
            }),
        ).toContain("CRM_SETUP");
    });

    it("follows the person's own capabilities: no money without payment:read", async () => {
        const all = new Set(["COMMERCE", "PAYMENTS", "APPOINTMENTS"]);
        expect(weekScope(member(), all)?.takings).toBe(false);
        // Given `payment:read` as an extra permission (F17), they see it.
        expect(weekScope(member(["payment:read"]), all)?.takings).toBe(true);
        // A Member's bundle really lacks it.
        expect(can("MEMBER", "payment:read")).toBe(false);
    });

    it("narrows Today and the next booking to their own diary", async () => {
        const { db, calls } = fakeDb({
            staffMember: {
                id: "staff_arun",
                status: "ACTIVE",
                services: [],
            },
        });
        const home = await service(db, ["APPOINTMENTS"]).build(member());
        expect(home.staff?.ownDiary).toBe(true);
        const bookingReads = calls.filter(
            (c) => c.table === "booking" && c.method === "findMany",
        );
        // Today's read and the schedule's, each the diary's own.
        expect(bookingReads.length).toBeGreaterThanOrEqual(2);
        for (const read of bookingReads) {
            expect(read.args).toMatchObject({
                where: { staffId: "staff_arun" },
            });
        }
    });

    it("leaves the business's Home whole for someone not on the diary", async () => {
        const { db, calls } = fakeDb({ roles: [] });
        await service(db, ["APPOINTMENTS"]).build(member());
        for (const read of calls.filter((c) => c.table === "booking")) {
            const where = (read.args as { where?: object }).where ?? {};
            expect(where).not.toHaveProperty("staffId");
            expect(where).not.toHaveProperty("OR");
        }
    });
});
