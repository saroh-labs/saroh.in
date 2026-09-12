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
            },
        ]);
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
