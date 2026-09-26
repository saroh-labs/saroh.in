import { createServer } from "node:http";

// Only for the isolated production-rendering tests. No database or real login.
/**
 * The site as `GET :siteId` returns it. `can` is what every website surface
 * now reads (#275) — a site without it makes the app throw rather than render
 * a denial, which is how this fixture went stale when that shipped.
 */
const siteFor = (scenario) => ({
    id: "site_1",
    name: "Permission test site",
    slug: "permission-test",
    canEdit: false,
    can: {
        edit: false,
        publish: false,
        comment: scenario === "REVIEWER",
        approve: scenario === "REVIEWER",
        manageSettings: false,
        manageDomain: false,
    },
    currentPublicationId: null,
    style: null,
    styleOptions: null,
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    socialImageWidth: null,
    socialImageHeight: null,
    socialImageBytes: null,
    pendingSectionChanges: null,
    pendingSiteChanges: null,
    pages: [
        { id: "page_1", title: "Home", path: "/", isHome: true, hidden: false },
    ],
});
/**
 * The product editor's roles (#525): a stock-only custom role ("Packer",
 * `inventory:write` without `store:write`) and one that can't see products.
 */
const PRODUCT_ROLES = {
    OWNER: {
        role: "OWNER",
        roleLabel: null,
        actions: ["store:read", "store:write", "inventory:write", "order:read"],
    },
    STOCK: {
        role: "MEMBER",
        roleLabel: "Packer",
        actions: ["store:read", "inventory:write", "order:read"],
    },
    NOREAD: {
        role: "MEMBER",
        roleLabel: "Front desk",
        actions: ["order:read", "booking:read"],
    },
};
const STORE = {
    id: "store_1",
    name: "Hill Road",
    slug: "hill-road",
    description: null,
    logo: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
};
/** A product counted as a whole, as `GET …/products/:id` returns it. */
const PRODUCT = {
    id: "prod_1",
    storeId: "store_1",
    name: "Sourdough loaf",
    slug: "sourdough-loaf",
    // Spelled as Tiptap writes it, so the Editor has nothing to rewrite on
    // open and makes no transaction — the case that left the description an
    // empty box, because only a transaction woke its toolbar.
    description:
        "<p>Baked each morning.</p><ul><li><p>Long ferment</p></li></ul>",
    image: null,
    categoryId: null,
    category: null,
    price: "480.00",
    mrp: null,
    currency: "INR",
    status: "PUBLISHED",
    archivedAt: null,
    variants: [],
    customFields: [],
    allergens: { contains: [], mayContain: [] },
    inventory: { quantity: 12, reserved: 2, lowStockAlert: 4 },
    howToUse: null,
    materials: null,
    keyPoints: [],
    madeHere: true,
    maker: null,
    madeIn: null,
    supplierCode: null,
    gstRate: null,
    hsnCode: null,
    warranty: null,
    returnsMode: "STOREFRONT",
    returnsText: null,
    shopFields: {},
    seoTitle: null,
    seoDescription: null,
    seoImageId: null,
    optionId: null,
    stockTracked: true,
    storefronts: [],
    images: [],
    stockMode: "product",
    variantPromises: {},
    option: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
};
/**
 * An older product (#525): a variant with no option value, counted as a
 * whole — Northwind's Platform Trolley and Stretch Film Hand Dispenser —
 * sold at two storefronts.
 */
const OLDER = {
    ...PRODUCT,
    id: "prod_2",
    name: "Stretch Film Hand Dispenser",
    slug: "stretch-film-hand-dispenser",
    description: null,
    status: "PUBLISHED",
    variants: [
        {
            id: "var_1",
            productId: "prod_2",
            sku: "SFD-500",
            title: "500mm",
            price: null,
            image: null,
            optionValueId: null,
            imageId: null,
            position: 0,
            inventory: null,
        },
    ],
    inventory: { quantity: 16, reserved: 14, lowStockAlert: 5 },
    stockMode: "product",
    variantPromises: { var_1: 14 },
};
const STORES = [
    STORE,
    { ...STORE, id: "store_2", name: "Online", slug: "online" },
];
createServer((req, res) => {
    const path = new URL(req.url, "http://fixture").pathname;
    const cookies = req.headers.cookie ?? "";
    const scenario = /permission_case=([^;]+)/.exec(cookies)?.[1] ?? "MEMBER";
    const reply = (status, data) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
    };
    if (path === "/health") return reply(200, { ok: true });
    if (path === "/api/auth/get-session")
        return reply(200, {
            session: {
                id: "session_1",
                userId: "user_1",
                expiresAt: "2099-01-01T00:00:00Z",
            },
            user: {
                id: "user_1",
                name: "Test colleague",
                email: "demo@saroh.dev",
                emailVerified: true,
            },
        });
    if (path === "/organizations")
        return reply(200, [
            {
                id: "org_1",
                name: "Permission tests",
                slug: "permissions",
                role: scenario === "REVIEWER" ? "REVIEWER" : "MEMBER",
                ...(PRODUCT_ROLES[scenario] ?? {}),
            },
        ]);
    // The product editor (#525). An owner's business has two storefronts.
    const stores = scenario === "OWNER" ? STORES : [STORE];
    if (path === "/stores") return reply(200, stores);
    if (path.endsWith("/storefronts"))
        return reply(
            200,
            stores.map((s) => ({
                id: s.id,
                name: s.name,
                orderCount: 0,
                kind: "SHOP",
                paused: false,
            })),
        );
    if (path.endsWith("/products/prod_2")) return reply(200, OLDER);
    if (path.endsWith("/products/prod_2/listings"))
        return reply(
            200,
            STORES.map((s) => ({
                storeId: s.id,
                storeName: s.name,
                listed: true,
                stock: null,
                variants: [{ variantId: "var_1", soldHere: true, stock: null }],
            })),
        );
    if (path.endsWith("/products/prod_1"))
        return scenario === "NOREAD"
            ? reply(403, { error: "fixture" })
            : reply(200, PRODUCT);
    if (path.endsWith("/products/prod_1/inventory") && req.method === "PUT")
        return reply(200, {
            productId: "prod_1",
            quantity: 12,
            reserved: 2,
            lowStockAlert: 4,
        });
    if (path.endsWith("/modules"))
        return reply(200, {
            data: [
                {
                    key: "WEBSITE",
                    label: "Website",
                    lifecycle: "ENABLED",
                    readiness: scenario === "disabled" ? "DISABLED" : "ACTIVE",
                    selectedForProject: true,
                    canManage: false,
                    dependencies: [],
                    blockers:
                        scenario === "disabled"
                            ? [{ code: "ORG_MODULE_DISABLED" }]
                            : [],
                },
                {
                    key: "CRM",
                    label: "CRM",
                    lifecycle: "ENABLED",
                    readiness: "DISABLED",
                    selectedForProject: true,
                    canManage: false,
                    dependencies: [],
                    blockers: [{ code: "UNAUTHORIZED" }],
                },
            ],
            meta: { organizationId: "org_1" },
        });
    if (path.endsWith("/settings"))
        return reply(scenario === "failure" ? 500 : 403, { error: "fixture" });
    if (path.endsWith("/sites/site_1"))
        return scenario === "denied"
            ? reply(403, { error: "fixture" })
            : reply(200, siteFor(scenario));
    if (path.endsWith("/sites")) return reply(200, [siteFor(scenario)]);
    if (path.endsWith("/comments")) return reply(200, []);
    // What a reviewer reads instead of the editor's draft (#275).
    if (path.endsWith("/read"))
        return reply(200, {
            sections: [
                {
                    key: "sec_1",
                    type: "hero",
                    contractVersion: 1,
                    label: "Racking that fits",
                    hidden: false,
                    content: {
                        heading: "Racking that fits",
                        subheading: "Shelving for small warehouses.",
                    },
                },
            ],
        });
    if (path.endsWith("/review"))
        return reply(200, {
            openNotes: 0,
            pending: false,
            approvalIsStale: false,
            outstanding: false,
            latestApproval: null,
        });
    if (path.endsWith("/draft"))
        return reply(403, {
            error: "Read-only roles must not load the editor draft",
        });
    if (path.endsWith("/notifications/unread-count"))
        return reply(200, { count: 0 });
    return reply(404, { error: "Fixture route not found" });
}).listen(Number(process.env.PORT), "127.0.0.1");
