/**
 * The Website area's read routes (DEC-259): the site header, Overview,
 * Pages, Writing's posts and categories, Forms, Links, Version history and
 * an AI app's publish request. Each service and its route answer the same
 * JSON; they go to whoever may read the site (`site:read`; Forms also
 * `form:read`), and to nobody else. Another business's site is a 404. A
 * post or a web address crosses as the fields the screen draws, nothing
 * more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        site: Fn;
        sites: Fn;
        overview: Fn;
        changes: Fn;
        redirects: Fn;
        publications: Fn;
        review: Fn;
        posts: Fn;
        categories: Fn;
        forms: Fn;
        request: Fn;
        releases: Fn;
    } => {
        const f = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
        return {
            active: "org_a",
            business: null,
            site: f(),
            sites: f(),
            overview: f(),
            changes: f(),
            redirects: f(),
            publications: f(),
            review: f(),
            posts: f(),
            categories: f(),
            forms: f(),
            request: f(),
            releases: f(),
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
vi.mock("@/lib/sites/service", () => ({
    getSite: (id: string) => h.site(id),
    listSites: () => h.sites(),
    getSiteOverview: (id: string) => h.overview(id),
    getSiteChanges: (id: string) => h.changes(id),
    listSiteRedirects: (id: string) => h.redirects(id),
    listPublications: (id: string) => h.publications(id),
    getReviewState: (id: string) => h.review(id),
}));
vi.mock("@/lib/content/service", () => ({
    listPosts: (id: string) => h.posts(id),
    listPostCategories: (id: string) => h.categories(id),
}));
vi.mock("@/lib/forms/service", () => ({ listForms: () => h.forms() }));
vi.mock("@/lib/sites/publish-requests-api", () => ({
    readPublishRequest: (siteId: string, id: string) => h.request(siteId, id),
}));
vi.mock("@/lib/sites/test-releases-api", () => ({
    readTestReleases: () => h.releases(),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    pausedOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    RENDERER_APEX: "saroh.app",
    readWebAddressLinks: () =>
        Promise.resolve({
            address: "gulmohar",
            origin: "https://gulmohar.saroh.app",
            platformOrigin: "https://gulmohar.saroh.app",
            customDomain: null,
            links: { site: "/", shop: null, book: null },
            canChange: true,
            // What an API that leaked more might send.
            verificationToken: "secret-token",
        }),
}));
vi.mock("@/lib/sites/website-area-switch", () => ({
    restoresAsDraft: () => Promise.resolve(true),
}));
vi.mock("@/lib/settings/api-area-switch", () => ({ apiAreaOn: () => false }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/ai-connections/service", () => ({
    listAiConnections: () => Promise.resolve([]),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import {
    postCategoriesServer,
    publishRequestServer,
    siteFormsServer,
    siteFrameServer,
    siteLinksServer,
    siteOverviewServer,
    sitePagesServer,
    sitePostsServer,
    siteVersionsServer,
} from "@/lib/sites/access";

import * as formsRoute from "./[siteId]/forms/route";
import * as linksRoute from "./[siteId]/links/route";
import * as overviewRoute from "./[siteId]/overview/route";
import * as pagesRoute from "./[siteId]/pages/route";
import * as categoriesRoute from "./[siteId]/post-categories/route";
import * as postsRoute from "./[siteId]/posts/route";
import * as requestRoute from "./[siteId]/publish-requests/[requestId]/route";
import * as frameRoute from "./[siteId]/route";
import * as versionsRoute from "./[siteId]/versions/route";

const READ = ["site:read"];
const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: [...READ, "section:write", "form:read", "site:publish"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: READ };
const REVIEWER = {
    id: "org_a",
    role: "REVIEWER",
    actions: [...READ, "site:comment", "site:approve"],
};
const CALENDAR_ONLY = {
    id: "org_a",
    role: "MEMBER",
    actions: ["booking:read"],
};

const PAGE = {
    id: "p1",
    path: "/",
    title: "Home",
    isHome: true,
    hidden: false,
};
const SITE = {
    id: "site_1",
    name: "Gulmohar Salon ",
    slug: "gulmohar",
    subdomain: "gulmohar",
    currentPublicationId: "pub_1",
    currentPublication: { publishedAt: "2026-11-01T10:00:00.000Z" },
    pendingSectionChanges: 2,
    pendingSiteChanges: [],
    pendingChanges: 2,
    can: {
        edit: true,
        publish: true,
        comment: true,
        approve: false,
        manageSettings: true,
        manageDomain: true,
    },
    pages: [PAGE],
    socialImageUrl: null,
    postsPrefix: null,
    addablePageKinds: ["BOOK"],
    publishNeedsApproval: false,
    canOverride: true,
};
const POST = {
    id: "post_1",
    title: "November",
    slug: "november",
    excerpt: "draft words",
    content: "<p>the whole body</p>",
    status: "DRAFT",
    featured: false,
    image: null,
    publishedAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    category: { id: "c1", name: "News", slug: "news" },
    author: "Asha",
    live: false,
};
const FORM = {
    id: "f1",
    name: "Bridal enquiry",
    siteId: "site_1",
    status: "ACTIVE",
    fields: [{ name: "email", label: "Email", type: "email" }],
    submissionCount: 3,
    lastSubmissionAt: "2026-11-03T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    for (const [f, data] of [
        [h.site, SITE],
        [h.sites, [SITE]],
        [h.overview, { needsDoing: [], pageEdits: [], lastPublished: null }],
        [h.changes, { units: [] }],
        [h.redirects, []],
        [h.publications, []],
        [h.review, { outstanding: false }],
        [h.posts, [POST]],
        [h.categories, [{ id: "c1", name: "News", slug: "news" }]],
        [h.forms, [FORM, { ...FORM, id: "f2", siteId: "site_2" }]],
        [h.request, { siteId: "site_1", siteName: "Gulmohar" }],
        [h.releases, { state: "off" }],
    ] as const) {
        f.mockReset();
        f.mockImplementation(() => Promise.resolve(data));
    }
};

beforeEach(() => as(OWNER)());

const seg = (params: Record<string, string>) => ({
    params: Promise.resolve(params),
});
const S = { siteId: "site_1" };
const R = { siteId: "site_1", requestId: "req_1" };

type GET = (r: Request, s?: ReturnType<typeof seg>) => Promise<Response>;
const ROUTES: [string, GET, Record<string, string>][] = [
    ["/api/sites/site_1", frameRoute.GET, S],
    ["/api/sites/site_1/overview", overviewRoute.GET, S],
    ["/api/sites/site_1/pages", pagesRoute.GET, S],
    ["/api/sites/site_1/posts", postsRoute.GET, S],
    ["/api/sites/site_1/post-categories", categoriesRoute.GET, S],
    ["/api/sites/site_1/forms", formsRoute.GET, S],
    ["/api/sites/site_1/links", linksRoute.GET, S],
    ["/api/sites/site_1/versions", versionsRoute.GET, S],
    ["/api/sites/site_1/publish-requests/req_1", requestRoute.GET, R],
];

const call = (path: string, GET: GET, s: Record<string, string>) =>
    GET(readRequest(path, { orgId: "org_a" }), seg(s));

describe("/api/sites/*", () => {
    it("answers what each service gives, on the wire", async () => {
        const pairs = [
            [siteFrameServer, frameRoute.GET, S],
            [siteOverviewServer, overviewRoute.GET, S],
            [sitePagesServer, pagesRoute.GET, S],
            [sitePostsServer, postsRoute.GET, S],
            [postCategoriesServer, categoriesRoute.GET, S],
            [siteFormsServer, formsRoute.GET, S],
            [siteLinksServer, linksRoute.GET, S],
            [siteVersionsServer, versionsRoute.GET, S],
            [publishRequestServer, requestRoute.GET, R],
        ] as const;
        for (const [server, GET, params] of pairs) {
            await expectReadContract(
                server as never,
                (r) => GET(r, seg(params)),
                "org_a",
                params as never,
            );
        }
        expect(h.request).toHaveBeenLastCalledWith("site_1", "req_1");
    });

    it("draws the header from the site: its name, address, status and the Publish sheet's facts", async () => {
        const res = await call("/api/sites/site_1", frameRoute.GET, S);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toMatchObject({
            id: "site_1",
            name: "Gulmohar Salon",
            host: "gulmohar.saroh.app",
            liveUrl: "https://gulmohar.saroh.app",
            status: { label: "Live · 2 changes waiting", waiting: 2 },
            canEdit: true,
        });
        // The web address crosses as the fix's three facts only.
        expect(JSON.stringify(body)).not.toContain("secret-token");
        expect(
            (body.publish as { addressFix: unknown }).addressFix,
        ).toStrictEqual({
            address: "gulmohar",
            platformOrigin: "https://gulmohar.saroh.app",
            canChange: true,
        });
    });

    it("gives Publish only to whoever may publish", async () => {
        h.site.mockImplementation(() =>
            Promise.resolve({
                ...SITE,
                can: { ...SITE.can, edit: false, publish: false },
            }),
        );
        const res = await call("/api/sites/site_1", frameRoute.GET, S);
        const body = (await res.json()) as {
            publish: unknown;
            status: unknown;
        };
        expect(body.publish).toBeNull();
        // A reader is told whether it's live, never what waits (DEC-200).
        expect(body.status).toMatchObject({ label: "Live", waiting: 0 });
    });

    it("lists a post as its row: no body, no excerpt; a form as this site's only", async () => {
        const posts = (await (
            await call("/api/sites/site_1/posts", postsRoute.GET, S)
        ).json()) as { posts: Record<string, unknown>[]; prefix: string };
        expect(posts.prefix).toBe("blog");
        expect(Object.keys(posts.posts[0]).sort()).toEqual(
            [
                "author",
                "category",
                "createdAt",
                "featured",
                "id",
                "live",
                "paused",
                "slug",
                "status",
                "title",
                "updatedAt",
            ].sort(),
        );
        expect(posts.posts[0].category).toStrictEqual({ name: "News" });
        const forms = (await (
            await call("/api/sites/site_1/forms", formsRoute.GET, S)
        ).json()) as { id: string; fields: unknown }[];
        expect(forms.map((f) => f.id)).toEqual(["f1"]);
        expect(forms[0].fields).toStrictEqual([{ label: "Email" }]);
    });

    it("is the area's gate on every route: site:read (Forms also form:read)", async () => {
        for (const [path, GET, params] of ROUTES) {
            const forms = path.endsWith("/forms");
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    member: { as: as(MEMBER), status: forms ? 403 : 200 },
                    reviewer: { as: as(REVIEWER), status: forms ? 403 : 200 },
                    "calendar-only": { as: as(CALENDAR_ONLY), status: 403 },
                    "no permissions known": {
                        as: as({ id: "org_a", role: "OWNER" }),
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
                () => call(path, GET, params),
            );
        }
    });

    it("another business's site, or a request not here, is a 404", async () => {
        h.site.mockImplementation(() => Promise.resolve(null));
        for (const [path, GET, params] of ROUTES) {
            if (path.endsWith("/post-categories") || path.endsWith("/forms"))
                continue;
            if (path.includes("publish-requests")) continue;
            const res = await call(path, GET, params);
            expect(res.status, path).toBe(404);
        }
        h.request.mockImplementation(() => Promise.resolve(null));
        const gone = await call(
            "/api/sites/site_1/publish-requests/req_1",
            requestRoute.GET,
            R,
        );
        expect(gone.status).toBe(404);
    });

    it("takes only the segment, bounded; anything else is a 400 and reads nothing", async () => {
        const extra = await frameRoute.GET(
            readRequest("/api/sites/site_1", {
                orgId: "org_a",
                params: { page: "2" },
            }),
            seg(S),
        );
        expect(extra.status).toBe(400);
        const bad = await frameRoute.GET(
            readRequest("/api/sites/x", { orgId: "org_a" }),
            seg({ siteId: "../orders" }),
        );
        expect(bad.status).toBe(400);
        expect(h.site).not.toHaveBeenCalled();
        expect((await frameRoute.POST()).status).toBe(405);
    });

    it("a part that fails on its own costs only itself: Overview without its overview", async () => {
        h.overview.mockImplementation(() => Promise.reject(new Error("down")));
        const res = await call(
            "/api/sites/site_1/overview",
            overviewRoute.GET,
            S,
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as { overview: unknown }).overview).toBe(
            null,
        );
        h.site.mockImplementation(() => Promise.reject(new Error("down")));
        const failed = await call(
            "/api/sites/site_1/overview",
            overviewRoute.GET,
            S,
        );
        expect(failed.status).toBe(503);
    });
});
