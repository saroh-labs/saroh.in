import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import {
    attentionFor,
    attentionSuggestionsFor,
    canSeeSensitive,
} from "./attention-read";

/**
 * Needs attention, read (DEC-040, C1): one helper decides what a viewer
 * sees. A sensitive entry's words never leave the database for a viewer
 * without the sensitive permission; they get a count instead.
 */

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const ADMIN: OrganizationContext = { ...OWNER, role: "ADMIN" };
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

const T0 = new Date("2026-09-20T10:00:00Z");
const T1 = new Date("2026-09-21T10:00:00Z");

function row(over: Record<string, unknown>) {
    return {
        id: "att_1",
        contactId: "c1",
        kind: "OTHER",
        label: "Prefers the window seat",
        detail: null,
        sensitive: false,
        source: "STAFF",
        status: "ACTIVE",
        bookingId: null,
        createdByUserId: "user_1",
        confirmedByUserId: null,
        createdAt: T0,
        updatedAt: T0,
        allergen: null,
        ...over,
    };
}

const ROWS = [
    row({ id: "att_other", createdAt: T0 }),
    row({
        id: "att_med",
        kind: "MEDICAL",
        label: "Blood thinners",
        sensitive: true,
        createdAt: T1,
    }),
    row({
        id: "att_sesame",
        kind: "ALLERGY",
        label: "Sesame",
        allergen: { id: "alg_sesame", name: "Sesame" },
        createdAt: T1,
        createdByUserId: null,
        source: "BOOKING_PAGE",
    }),
    row({
        id: "att_ravi",
        contactId: "c2",
        kind: "ACCESS",
        label: "Wheelchair",
    }),
];

function make() {
    const db = {
        contactAttention: {
            findMany: jest
                .fn()
                .mockImplementation(({ where }) =>
                    Promise.resolve(
                        ROWS.filter(
                            (r) =>
                                (
                                    where.contactId.in ?? [where.contactId]
                                ).includes(r.contactId) &&
                                (where.sensitive === undefined ||
                                    r.sensitive === where.sensitive),
                        ),
                    ),
                ),
            groupBy: jest
                .fn()
                .mockResolvedValue([{ contactId: "c1", _count: { _all: 1 } }]),
        },
        user: {
            findMany: jest
                .fn()
                .mockResolvedValue([{ id: "user_1", name: " Nisha " }]),
        },
        storeAllergen: {
            findMany: jest.fn().mockResolvedValue([
                { id: "alg_sesame", name: "Sesame" },
                { id: "alg_sesame_stall", name: "sesame " },
                { id: "alg_nuts", name: "Nuts" },
            ]),
        },
    };
    return db;
}

describe("canSeeSensitive", () => {
    it("is contact:write until C13 gives it its own capability", () => {
        expect(canSeeSensitive(OWNER)).toBe(true);
        expect(canSeeSensitive(ADMIN)).toBe(true);
        expect(canSeeSensitive(MEMBER)).toBe(false);
        const frontDesk = {
            ...MEMBER,
            actions: new Set<OrgAction>(["contact:read", "contact:write"]),
        };
        expect(canSeeSensitive(frontDesk)).toBe(true);
        const counter = {
            ...OWNER,
            actions: new Set<OrgAction>(["contact:read"]),
        };
        expect(canSeeSensitive(counter)).toBe(false);
    });
});

describe("attentionFor", () => {
    it("gives an Owner every active entry, Allergy first, with who added it", async () => {
        const db = make();

        const read = await attentionFor(OWNER, ["c1"], db as never);

        const c1 = read.get("c1");
        expect(c1?.hiddenSensitiveCount).toBe(0);
        expect(c1?.entries.map((e) => e.id)).toEqual([
            "att_sesame",
            "att_med",
            "att_other",
        ]);
        expect(c1?.entries[1]).toMatchObject({
            kind: "MEDICAL",
            label: "Blood thinners",
            sensitive: true,
            addedBy: "Nisha",
        });
        // Only active, not removed, in this organization.
        expect(db.contactAttention.findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            contactId: { in: ["c1"] },
            status: "ACTIVE",
            removedAt: null,
        });
        expect(db.contactAttention.groupBy).not.toHaveBeenCalled();
    });

    it("widens an Allergy entry's allergen to every allergen of its name", async () => {
        const read = await attentionFor(OWNER, ["c1"], make() as never);

        const sesame = read.get("c1")?.entries[0];
        expect(sesame?.allergen).toEqual({ id: "alg_sesame", name: "Sesame" });
        expect(sesame?.matchAllergens).toEqual([
            { id: "alg_sesame", name: "Sesame" },
            { id: "alg_sesame_stall", name: "sesame " },
        ]);
        expect(sesame?.addedBy).toBeNull();
    });

    it("gives a Member the rest and a count, never the sensitive words", async () => {
        const db = make();

        const read = await attentionFor(MEMBER, ["c1"], db as never);

        const c1 = read.get("c1");
        expect(c1?.entries.map((e) => e.id)).toEqual([
            "att_sesame",
            "att_other",
        ]);
        expect(c1?.hiddenSensitiveCount).toBe(1);
        expect(JSON.stringify(c1)).not.toContain("Blood thinners");
        // Asked of the database, not filtered after it.
        expect(
            db.contactAttention.findMany.mock.calls[0][0].where.sensitive,
        ).toBe(false);
        expect(db.contactAttention.groupBy.mock.calls[0][0].where).toEqual(
            expect.objectContaining({ sensitive: true, status: "ACTIVE" }),
        );
    });

    it("answers for every contact asked, each with its own entries", async () => {
        const read = await attentionFor(
            OWNER,
            ["c1", "c2", "c3", "c2"],
            make() as never,
        );

        expect([...read.keys()]).toEqual(["c1", "c2", "c3"]);
        expect(read.get("c2")?.entries.map((e) => e.label)).toEqual([
            "Wheelchair",
        ]);
        expect(read.get("c3")).toEqual({
            entries: [],
            hiddenSensitiveCount: 0,
        });
    });

    it("reads nothing when asked about no one", async () => {
        const db = make();
        const read = await attentionFor(OWNER, [], db as never);
        expect(read.size).toBe(0);
        expect(db.contactAttention.findMany).not.toHaveBeenCalled();
    });
});

describe("attentionSuggestionsFor", () => {
    it("shows suggestions only to someone who can add them", async () => {
        const db = make();
        expect(
            await attentionSuggestionsFor(MEMBER, "c1", db as never),
        ).toBeUndefined();
        expect(db.contactAttention.findMany).not.toHaveBeenCalled();

        await attentionSuggestionsFor(OWNER, "c1", db as never);
        expect(db.contactAttention.findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            contactId: "c1",
            status: "SUGGESTED",
            removedAt: null,
        });
    });

    it("gives a custom role holding contact:write the sensitive ones too, until C13", async () => {
        const db = make();
        const writer = {
            ...MEMBER,
            actions: new Set<OrgAction>(["contact:read", "contact:write"]),
        };
        await attentionSuggestionsFor(writer, "c1", db as never);
        expect(
            db.contactAttention.findMany.mock.calls[0][0].where,
        ).not.toHaveProperty("sensitive");
    });
});
