/**
 * Product settings' and Collections' read routes (DEC-259): the categories
 * (with the option names when asked), the Product settings page and every
 * collection. Each answers what its server read holds, to whoever may open
 * Products while Sell is on (`store:read`), and to nobody else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        categories: Fn;
        options: Fn;
        catalogue: Fn;
        fields: Fn;
        allergens: Fn;
        sku: Fn;
        preview: Fn;
        collections: Fn;
    } => {
        const f = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
        return {
            active: "org_a",
            business: null,
            modules: { state: "available" },
            categories: f(),
            options: f(),
            catalogue: f(),
            fields: f(),
            allergens: f(),
            sku: f(),
            preview: f(),
            collections: f(),
        };
    },
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
}));
vi.mock("@/lib/products/service", () => ({
    listCategories: () => h.categories(),
    listCataloguePage: vi.fn(),
}));
vi.mock("@/lib/products/settings", () => ({
    listOptionNames: () => h.options(),
    getCatalogue: () => h.catalogue(),
    listFields: () => h.fields(),
    listAllergens: () => h.allergens(),
    getSkuSettings: () => h.sku(),
    getSkuPreview: (p: string) => h.preview(p),
}));
vi.mock("@/lib/collections/service", () => ({
    listCollections: () => h.collections(),
}));
vi.mock("@/lib/products/overview", () => ({
    getProductOverview: vi.fn(),
    withStorefrontFallback: vi.fn(),
}));
vi.mock("@/lib/stock/service", () => ({
    getStockLevels: vi.fn(),
    stockTrackingOnce: vi.fn(),
}));

import { collectionsServer } from "@/lib/collections/access";
import {
    categoriesServer,
    productSettingsServer,
} from "@/lib/products/settings-access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import * as collectionsRoute from "../../collections/route";
import * as categoriesRoute from "../categories/route";
import * as settingsRoute from "./route";

const OWNER = { id: "org_a", role: "OWNER", actions: ["store:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["store:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const CATALOGUE = {
    categories: [],
    uncategorizedCount: 0,
    options: [],
    defaults: {
        entries: {},
        stillOnDefault: {},
        productCounts: {},
        suggestions: [],
    },
    canWrite: true,
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.categories.mockReset().mockResolvedValue([
        {
            id: "c1",
            name: "Bread",
            slug: "bread",
            parentId: null,
            _count: { products: 3, children: 0 },
        },
    ]);
    h.options.mockReset().mockResolvedValue([{ id: "o1", name: "Size" }]);
    h.catalogue.mockReset().mockResolvedValue(CATALOGUE);
    h.fields.mockReset().mockResolvedValue([]);
    h.allergens.mockReset().mockResolvedValue(null);
    h.sku
        .mockReset()
        .mockResolvedValue({ pattern: "{N}", suggest: true, n: 1 });
    h.preview
        .mockReset()
        .mockResolvedValue({ rows: [], total: 0, problem: "" });
    h.collections.mockReset().mockResolvedValue([]);
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/products/categories": categoriesRoute.GET,
    "/api/products/settings": settingsRoute.GET,
    "/api/collections": collectionsRoute.GET,
};

describe("/api/products/categories, /api/products/settings, /api/collections", () => {
    it("answers what each server read holds, for what the screen asks", async () => {
        await expectReadContract(
            categoriesServer,
            categoriesRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(
            categoriesServer,
            categoriesRoute.GET,
            "org_a",
            { options: "1" },
            { options: "1" },
        );
        await expectReadContract(
            productSettingsServer,
            settingsRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(
            productSettingsServer,
            settingsRoute.GET,
            "org_a",
            { sku: "1" },
            { sku: "1" },
        );
        expect(h.preview).toHaveBeenLastCalledWith("{N}");
        await expectReadContract(
            collectionsServer,
            collectionsRoute.GET,
            "org_a",
            {},
        );
    });

    it("sends a category's id, name and parent only", async () => {
        const res = await categoriesRoute.GET(
            readRequest("/api/products/categories", { orgId: "org_a" }),
        );
        expect(await res.json()).toEqual({
            categories: [{ id: "c1", name: "Bread", parentId: null }],
        });
        expect(h.options).not.toHaveBeenCalled();
    });

    it("is the section's gate on every route: store:read while Sell is on", async () => {
        for (const [path, GET] of Object.entries(ROUTES)) {
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    member: { as: as(MEMBER), status: 200 },
                    reviewer: { as: as(REVIEWER), status: 403 },
                    "Sell off": {
                        as: () => (
                            as(OWNER)(),
                            (h.modules = { state: "unavailable" })
                        ),
                        status: 403,
                    },
                    "signed out": {
                        as: () => (as(null)(), (h.active = null)),
                        status: 401,
                    },
                    "another business open in this tab": {
                        as: () => (as(OWNER)(), (h.active = "org_b")),
                        status: 409,
                    },
                },
                () => GET(readRequest(path, { orgId: "org_a" })),
            );
        }
    });

    it("takes only its params; a catalogue that can't be read is a failure, never empty", async () => {
        for (const [path, params] of [
            ["/api/products/categories", { options: "true" }],
            ["/api/products/settings", { tab: "sku" }],
            ["/api/collections", { q: "x" }],
        ] as const) {
            const res = await ROUTES[path](
                readRequest(path, { orgId: "org_a", params }),
            );
            expect(res.status, path).toBe(400);
        }
        expect(h.catalogue).not.toHaveBeenCalled();
        h.catalogue.mockResolvedValue(null);
        const none = await settingsRoute.GET(
            readRequest("/api/products/settings", { orgId: "org_a" }),
        );
        expect(none.status).toBe(404);
        h.collections.mockRejectedValue(new Error("down"));
        const failed = await collectionsRoute.GET(
            readRequest("/api/collections", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        for (const GET of Object.values({
            a: categoriesRoute.POST,
            b: settingsRoute.POST,
            c: collectionsRoute.POST,
        })) {
            expect((await GET()).status).toBe(405);
        }
    });
});
