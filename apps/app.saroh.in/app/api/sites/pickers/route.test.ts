/**
 * The site editor's pickers (DEC-259, U33): `?kind=services` or
 * `?kind=products`, each the shape its picker draws, to whoever may read
 * the site. A role the API won't show them to gets the picker's own
 * "can't see these" (`forbidden`), never an empty list and never the rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
const h = vi.hoisted(() => ({
    // Set by `as` before every call.
    active: null as string | null,
    business: null as { id: string; role?: string; actions?: string[] } | null,
    services: vi.fn<() => Promise<unknown>>(),
    catalogue: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/services/service", () => ({
    readServicesForPicker: () => h.services(),
}));
vi.mock("@/lib/sites/grid-catalogue", () => ({
    readGridCatalogue: () => h.catalogue(),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import { pickerServer } from "@/lib/sites/access";

import * as route from "./route";

const SERVICES = {
    ok: true,
    services: [{ id: "s1", name: "Bridal makeup", status: "ACTIVE" }],
};
const CATALOGUE = {
    ok: true,
    products: [{ id: "p1", name: "Carton", status: "PUBLISHED" }],
    collections: [],
};
const OWNER = { id: "org_a", role: "OWNER", actions: ["site:read"] };
const REVIEWER = {
    id: "org_a",
    role: "REVIEWER",
    actions: ["site:read", "site:approve"],
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.services.mockReset().mockResolvedValue(SERVICES);
    h.catalogue.mockReset().mockResolvedValue(CATALOGUE);
};
beforeEach(() => as(OWNER)());

const get = (kind: string) =>
    route.GET(
        readRequest("/api/sites/pickers", {
            orgId: "org_a",
            params: { kind },
        }),
    );

describe("/api/sites/pickers", () => {
    it("answers each kind with its picker's shape", async () => {
        await expectReadContract(
            pickerServer,
            route.GET,
            "org_a",
            { kind: "services" },
            { kind: "services" },
        );
        await expectReadContract(
            pickerServer,
            route.GET,
            "org_a",
            { kind: "products" },
            { kind: "products" },
        );
        expect(await (await get("services")).json()).toEqual(SERVICES);
        expect(await (await get("products")).json()).toEqual(CATALOGUE);
    });

    it("a role the API refuses gets `forbidden`, not the rows", async () => {
        as(REVIEWER)();
        h.services.mockResolvedValue({ ok: false, forbidden: true });
        expect(await (await get("services")).json()).toEqual({
            ok: false,
            forbidden: true,
        });
    });

    it("is the site's gate: site:read", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 200 },
                "calendar-only": {
                    as: as({
                        id: "org_a",
                        role: "MEMBER",
                        actions: ["booking:read"],
                    }),
                    status: 403,
                },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business open": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => get("services"),
        );
    });

    it("takes only a known kind; anything else is a 400 and reads nothing", async () => {
        for (const kind of ["pages", "", "services&x=1"]) {
            expect((await get(kind)).status, kind).toBe(400);
        }
        expect(
            (
                await route.GET(
                    readRequest("/api/sites/pickers", { orgId: "org_a" }),
                )
            ).status,
        ).toBe(400);
        expect(h.services).not.toHaveBeenCalled();
        expect(h.catalogue).not.toHaveBeenCalled();
    });
});
