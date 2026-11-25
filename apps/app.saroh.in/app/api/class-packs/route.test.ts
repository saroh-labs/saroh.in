/**
 * Class packs' read routes (DEC-259): the Packs list, who holds one, and
 * one pack's page. Each answers what the page used to read, to whoever
 * holds `pack:read` while Class packs is on, and to nobody else; another
 * business's pack is a 404; the sell dialog's people are read only for a
 * role that may sell, and carry a name and an email, nothing more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn<A extends unknown[] = []> = ReturnType<
    typeof vi.fn<(...a: A) => Promise<unknown>>
>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        packs: Fn;
        purchases: Fn;
        detail: Fn<[string]>;
        contacts: Fn;
        part: Fn;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        packs: vi.fn<() => Promise<unknown>>(),
        purchases: vi.fn<() => Promise<unknown>>(),
        detail: vi.fn<(id: string) => Promise<unknown>>(),
        contacts: vi.fn<() => Promise<unknown>>(),
        part: vi.fn<() => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve(h.modules),
    modulesOrUnknown: () =>
        Promise.resolve([{ key: "PAYMENTS", readiness: "AVAILABLE" }]),
}));
vi.mock("@/lib/invoices/contacts", () => ({
    contactPickerOptions: () => h.contacts(),
}));
vi.mock("@/lib/services/service", () => ({
    readServices: () =>
        Promise.resolve({
            ok: true,
            services: [
                {
                    id: "s1",
                    priceCents: 50000,
                    payCents: 59000,
                    currency: "INR",
                    timezone: "Asia/Kolkata",
                },
            ],
        }),
}));
vi.mock("@/lib/class-packs/packs-page", () => ({
    FALLBACK_ZONE: "Asia/Kolkata",
    listPackCards: () => h.packs(),
    readFreeCancelHours: () => Promise.resolve(12),
    readMembershipPlans: () => Promise.resolve(null),
    readBusinessZone: () => Promise.resolve("Asia/Kolkata"),
}));
vi.mock("@/lib/class-packs/service", () => ({
    listPurchases: () => h.purchases(),
    listPacks: () => h.packs(),
    getSellingTerms: () =>
        Promise.resolve({ invoicesOnSale: true, gst: { asked: false } }),
}));
vi.mock("@/lib/class-packs/pack-detail-data", () => ({
    getPackDetail: (id: string) => h.detail(id),
    readPackHolders: () => h.part(),
    readPackUsed: () => h.part(),
    readPackSales: () => h.part(),
    readPackEvents: () => h.part(),
    readPackPurchases: () => h.part(),
    readSellContext: () => Promise.resolve({ held: [], packs: [] }),
}));

import {
    packPurchasesServer,
    packsListServer,
} from "@/lib/class-packs/access-server";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import * as packRoute from "./[packId]/route";
import * as purchasesRoute from "./purchases/route";
import * as listRoute from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["pack:read", "pack:sell", "pack:write", "invoice:read"],
};
// Reads packs, sells nothing.
const VIEWER = { id: "org_a", role: "MEMBER", actions: ["pack:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const CALENDAR = { id: "org_a", role: "MEMBER", actions: ["booking:read"] };

const PACK = {
    id: "pk_1",
    name: "Ten classes",
    status: "ACTIVE",
    price: "4500",
    currency: "INR",
    credits: 10,
    validityDays: 90,
    services: [{ id: "s1", name: "Hatha" }],
    createdAt: new Date("2026-11-01T00:00:00Z"),
};
const PERSON = { id: "c_1", name: "Asha Rao", email: "asha@example.com" };

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    for (const f of [h.packs, h.purchases, h.detail, h.contacts, h.part]) {
        f.mockReset();
    }
    h.packs.mockResolvedValue([]);
    h.purchases.mockResolvedValue([]);
    h.contacts.mockResolvedValue([PERSON]);
    h.part.mockResolvedValue({ state: "ok", data: [] });
    // The API's read: another business's pack is not found.
    h.detail.mockImplementation((id) =>
        Promise.resolve(id === "pk_1" ? PACK : null),
    );
};

beforeEach(() => as(OWNER)());

const getPack = (packId: string, params: Record<string, string> = {}) =>
    packRoute.GET(
        readRequest(`/api/class-packs/${packId}`, { orgId: "org_a", params }),
        { params: Promise.resolve({ packId }) },
    );

const ROUTES = {
    list: () =>
        listRoute.GET(readRequest("/api/class-packs", { orgId: "org_a" })),
    purchases: () =>
        purchasesRoute.GET(
            readRequest("/api/class-packs/purchases", { orgId: "org_a" }),
        ),
    pack: () => getPack("pk_1"),
};

describe("/api/class-packs/*", () => {
    it("answers what the page's read holds", async () => {
        await expectReadContract(packsListServer, listRoute.GET, "org_a", {});
        await expectReadContract(
            packPurchasesServer,
            purchasesRoute.GET,
            "org_a",
            {},
        );
        const res = await getPack("pk_1");
        expect(res.status).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.pack).toEqual({
            ...PACK,
            createdAt: "2026-11-01T00:00:00.000Z",
        });
        expect(body.invoices).toBe(true);
        expect(body.dropIns).toEqual([
            { id: "s1", priceCents: 59000, currency: "INR" },
        ]);
        // The pack on sale is offered by its own sell dialog.
        expect((body.sell as { packs: { id: string }[] }).packs).toEqual([
            expect.objectContaining({ id: "pk_1" }),
        ]);
    });

    it("reads the people to sell to only for a role that sells, a name and an email each", async () => {
        const owner = (await (await ROUTES.list()).json()) as {
            contacts: unknown[];
        };
        expect(owner.contacts).toEqual([PERSON]);
        as(VIEWER)();
        const viewer = (await (await ROUTES.list()).json()) as {
            contacts: unknown[];
        };
        expect(viewer.contacts).toEqual([]);
        const pack = (await (await ROUTES.pack()).json()) as {
            sell: unknown;
            invoices: boolean;
            receipts: unknown;
        };
        expect(pack.sell).toBeNull();
        // No invoice:read: no receipts read or sent.
        expect(pack.invoices).toBe(false);
        expect(pack.receipts).toBeNull();
        expect(h.contacts).not.toHaveBeenCalled();
    });

    it("is the pages' gate on every route: pack:read while Class packs is on", async () => {
        for (const [name, call] of Object.entries(ROUTES)) {
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    "pack:read only": { as: as(VIEWER), status: 200 },
                    reviewer: { as: as(REVIEWER), status: 403 },
                    "calendar-only": { as: as(CALENDAR), status: 403 },
                    "Class packs off": {
                        as: () => {
                            as(OWNER)();
                            h.modules = { state: "unavailable" };
                        },
                        status: 403,
                    },
                    "signed out": {
                        as: () => {
                            as(null)();
                            h.active = null;
                        },
                        status: 401,
                    },
                    "another business open in this tab": {
                        as: () => {
                            as(OWNER)();
                            h.active = "org_b";
                        },
                        status: 409,
                    },
                },
                call,
            ).catch((e: unknown) => {
                throw new Error(`${name}: ${String(e)}`);
            });
        }
    });

    it("another business's pack, or none, is a 404 with nothing in it", async () => {
        const res = await getPack("pk_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("takes no params, and the pack's id from the path only; anything else is a 400 and reads nothing", async () => {
        expect(
            (
                await listRoute.GET(
                    readRequest("/api/class-packs", {
                        orgId: "org_a",
                        params: { include: "drafts" },
                    }),
                )
            ).status,
        ).toBe(400);
        expect((await getPack("pk_1", { packId: "pk_2" })).status).toBe(400);
        expect((await getPack("../x")).status).toBe(400);
        expect(h.packs).not.toHaveBeenCalled();
        expect(h.detail).not.toHaveBeenCalled();
        for (const route of [listRoute, purchasesRoute, packRoute]) {
            expect((await route.POST()).status).toBe(405);
        }
    });

    it("a read that fails is a generic failure, never an empty list", async () => {
        h.packs.mockRejectedValue(new Error("down with details"));
        const res = await ROUTES.list();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
    });
});
