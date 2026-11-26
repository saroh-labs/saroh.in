/**
 * The Website area's last read routes (U18 close-out): All sites, New site,
 * a site's Settings and its Search and tracking, a form's entries, a past
 * version, a test release, and the editor's pickers beside services and
 * products. Each service and its route answer the same JSON; each goes to
 * whoever its page went to (`site:read`; entries also `form:read`; New
 * site `site:create`), and to nobody else. Another business's site is a
 * 404. Customers' words and the team's own details cross as the fields
 * drawn, nothing more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(() => {
    const fn = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
    const who: { active: string | null; business: Business } = {
        active: "org_a",
        business: null,
    };
    return {
        ...who,
        site: fn(),
        sites: fn(),
        form: fn(),
        submissions: fn(),
        publication: fn(),
        release: fn(),
        comments: fn(),
        review: fn(),
        templates: fn(),
        defaults: fn(),
        modules: fn(),
        settings: fn(),
        contact: fn(),
        visited: fn(),
        approval: fn(),
        tracking: fn(),
        staff: fn(),
        reviews: fn(),
        offers: fn(),
        places: fn(),
        products: fn(),
        forms: fn(),
    };
});
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
    getPublication: (s: string, id: string) => h.publication(s, id),
    listComments: (s: string, id: string) => h.comments(s, id),
    getReviewState: (s: string, id: string) => h.review(s, id),
    listTemplates: () => h.templates(),
    getNewSiteDefaults: () => h.defaults(),
}));
vi.mock("@/lib/forms/service", () => ({
    getForm: (id: string) => h.form(id),
    listSubmissions: (id: string) => h.submissions(id),
    listForms: () => h.forms(),
}));
vi.mock("@/lib/sites/test-releases-api", () => ({
    readTestRelease: (s: string, id: string) => h.release(s, id),
    readTestReleases: () => Promise.resolve({ state: "off" }),
}));
vi.mock("@/lib/modules/guard", () => ({ modulesOrUnknown: () => h.modules() }));
vi.mock("@/lib/sites/templates-switch", () => ({
    templateChoiceOn: () => true,
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    readOrganizationSettings: () => h.settings(),
    readSiteContact: () => h.contact(),
}));
vi.mock("@/lib/stores/storefronts", () => ({
    listVisitedLocations: () => h.visited(),
    listVisitPlaces: () => h.places(),
}));
vi.mock("@/lib/sites/publish-approval-read", () => ({
    readPublishApproval: () => h.approval(),
}));
vi.mock("@/lib/sites/search-tracking-read", () => ({
    readSearchTracking: () => h.tracking(),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    pausedOrNull: () => Promise.resolve(null),
    billingAccessOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/staff/service", () => ({ listStaff: () => h.staff() }));
vi.mock("@/lib/product-reviews/service", () => ({
    listReviews: () => h.reviews(),
}));
vi.mock("@/lib/discounts/actions", () => ({
    listOffersForPicker: () => h.offers(),
}));
vi.mock("@/lib/products/service", () => ({
    listProducts: () => h.products(),
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
            verificationToken: "secret-token",
        }),
}));
vi.mock("@/lib/sites/website-area-switch", () => ({
    restoresAsDraft: () => Promise.resolve(true),
}));
vi.mock("@/lib/settings/api-area-switch", () => ({ apiAreaOn: () => false }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import {
    allSitesServer,
    formEntriesServer,
    newSiteServer,
    pickerServer,
    siteReleaseServer,
    siteSettingsServer,
    siteTrackingServer,
    siteVersionServer,
} from "@/lib/sites/access";

import * as entriesRoute from "../[siteId]/forms/[formId]/route";
import * as releaseRoute from "../[siteId]/releases/[releaseId]/route";
import * as trackingRoute from "../[siteId]/search-tracking/route";
import * as settingsRoute from "../[siteId]/settings/route";
import * as versionRoute from "../[siteId]/versions/[publicationId]/route";
import * as pickersRoute from "../pickers/route";
import * as allRoute from "../route";
import * as newRoute from "./route";

const READ = ["site:read"];
const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: [...READ, "site:create", "form:read", "service:write"],
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
    pendingSectionChanges: 0,
    pendingSiteChanges: [],
    can: {
        edit: true,
        publish: true,
        comment: true,
        approve: false,
        manageSettings: true,
    },
    pages: [PAGE],
    visitsLast7Days: 52,
    lastActivity: null,
    publishNeedsApproval: false,
    canOverride: true,
};
const FORM = {
    id: "f1",
    name: "Bridal enquiry",
    siteId: "site_1",
    status: "ACTIVE",
    fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "message", label: "Message", type: "textarea" },
    ],
};
// What an API that leaked more might send with an entry.
const ENTRY = {
    id: "e1",
    createdAt: "2026-11-03T10:00:00.000Z",
    data: { name: "Asha", message: "June wedding", budget: "2 lakh" },
    contact: { id: "c1", name: "Asha Rao", email: "asha@example.com" },
    leadId: "l1",
    ip: "203.0.113.9",
    userAgent: "Mozilla/5.0",
};
const SNAPSHOT = {
    site: { styleVariables: { "--site-bg": "0 0% 100%" }, look: "classic" },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                { type: "hero", content: { title: "Hi" } },
                { type: "gone", content: {} },
            ],
        },
    ],
};
const RENDERABILITY = {
    renderable: false,
    unrenderable: [{ path: "/", index: 1, type: "gone" }],
};
const RELEASE = {
    id: "rel_1",
    number: 3,
    name: "June",
    note: null,
    status: "ready",
    links: [],
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    for (const [fn, data] of [
        [h.site, SITE],
        [h.sites, [SITE]],
        [h.form, FORM],
        [h.submissions, { total: 1, items: [ENTRY] }],
        [
            h.publication,
            {
                id: "pub_0",
                publishedAt: "2026-10-01T10:00:00.000Z",
                publishedBy: "Asha",
                snapshot: SNAPSHOT,
                renderability: RENDERABILITY,
                testRelease: null,
            },
        ],
        [
            h.release,
            {
                release: RELEASE,
                zone: "Asia/Kolkata",
                snapshot: SNAPSHOT,
                renderability: RENDERABILITY,
            },
        ],
        [h.comments, []],
        [h.review, { openNotes: 0, latestApproval: null }],
        [h.templates, []],
        [h.defaults, { siteName: "Gulmohar", address: "gulmohar" }],
        [h.modules, []],
        [h.settings, { ok: false, error: "no", forbidden: true }],
        [h.contact, null],
        [h.visited, { state: "ok", locations: [] }],
        [h.approval, null],
        [h.tracking, { ok: true, data: { verifications: {}, trackers: [] } }],
        [
            h.staff,
            {
                staff: [
                    {
                        id: "st_1",
                        name: "Meera",
                        title: "Stylist",
                        status: "ACTIVE",
                        showOnTeamPage: true,
                        photo: null,
                        about: "words",
                        membership: {
                            id: "m1",
                            userId: "u1",
                            name: "Meera",
                            email: "meera@example.com",
                            role: "MEMBER",
                        },
                        serviceIds: ["s1"],
                        hours: [],
                    },
                ],
            },
        ],
        [h.reviews, []],
        [h.offers, []],
        [h.places, { state: "ok", places: [] }],
        [h.products, []],
        [h.forms, [FORM]],
    ] as const) {
        (fn as Fn).mockReset();
        (fn as Fn).mockImplementation(() => Promise.resolve(data));
    }
};

beforeEach(() => as(OWNER)());

const seg = (params: Record<string, string>) => ({
    params: Promise.resolve(params),
});
const S = { siteId: "site_1" };
type GET = (r: Request, s?: ReturnType<typeof seg>) => Promise<Response>;
const ROUTES: [string, GET, Record<string, string>, Record<string, string>?][] =
    [
        ["/api/sites", allRoute.GET, {}],
        ["/api/sites/new", newRoute.GET, {}],
        ["/api/sites/site_1/settings", settingsRoute.GET, S],
        ["/api/sites/site_1/search-tracking", trackingRoute.GET, S],
        [
            "/api/sites/site_1/forms/f1",
            entriesRoute.GET,
            { siteId: "site_1", formId: "f1" },
        ],
        [
            "/api/sites/site_1/versions/pub_0",
            versionRoute.GET,
            { siteId: "site_1", publicationId: "pub_0" },
        ],
        [
            "/api/sites/site_1/releases/rel_1",
            releaseRoute.GET,
            { siteId: "site_1", releaseId: "rel_1" },
        ],
        ["/api/sites/pickers", pickersRoute.GET, {}, { kind: "team" }],
    ];

const call = (
    path: string,
    GET: GET,
    s: Record<string, string>,
    params: Record<string, string> = {},
) => GET(readRequest(path, { orgId: "org_a", params }), seg(s));
const json = async (res: Promise<Response>) =>
    (await (await res).json()) as Record<string, unknown>;

describe("/api/sites close-out routes", () => {
    it("answers what each service gives, on the wire", async () => {
        const pairs = [
            [allSitesServer, allRoute.GET, {}],
            [newSiteServer, newRoute.GET, {}],
            [siteSettingsServer, settingsRoute.GET, S],
            [siteTrackingServer, trackingRoute.GET, S],
            [formEntriesServer, entriesRoute.GET, ROUTES[4][2]],
            [siteVersionServer, versionRoute.GET, ROUTES[5][2]],
            [siteReleaseServer, releaseRoute.GET, ROUTES[6][2]],
        ] as const;
        for (const [server, GET, params] of pairs) {
            await expectReadContract(
                server as never,
                (r) => GET(r, seg(params)),
                "org_a",
                params as never,
            );
        }
        for (const kind of [
            "reviews",
            "add-counts",
            "team",
            "offers",
            "visit-places",
        ]) {
            await expectReadContract(
                pickerServer as never,
                (r) => pickersRoute.GET(r),
                "org_a",
                { kind } as never,
                { kind },
            );
        }
    });

    it("gives each route to whoever its page went to", async () => {
        for (const [path, GET, s, params] of ROUTES) {
            const entries = path.includes("/forms/");
            const create = path.endsWith("/new");
            const reader = entries || create ? 403 : 200;
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: 200 },
                    member: { as: as(MEMBER), status: reader },
                    reviewer: { as: as(REVIEWER), status: reader },
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
                () => call(path, GET, s, params),
            );
        }
    });

    it("another business's site, form, version or release is a 404", async () => {
        h.site.mockImplementation(() => Promise.resolve(null));
        h.tracking.mockImplementation(() => Promise.resolve({ ok: false }));
        for (const [path, GET, s] of ROUTES.slice(2, 7)) {
            if (path.includes("/forms/")) continue;
            expect((await call(path, GET, s)).status, path).toBe(404);
        }
        // A form of another site is a 404, even with the site this business's.
        h.form.mockImplementation(() =>
            Promise.resolve({ ...FORM, siteId: "site_2" }),
        );
        expect(
            (await call(...(ROUTES[4] as [string, GET, never]))).status,
        ).toBe(404);
    });

    it("sends an entry as its drawn rows: no email, no address, no device", async () => {
        const body = (await json(
            call("/api/sites/site_1/forms/f1", entriesRoute.GET, ROUTES[4][2]),
        )) as { entries: Record<string, unknown>[] };
        const wire = JSON.stringify(body);
        for (const leak of ["asha@example.com", "203.0.113.9", "Mozilla"]) {
            expect(wire).not.toContain(leak);
        }
        expect(body.entries[0]).toStrictEqual({
            id: "e1",
            createdAt: "2026-11-03T10:00:00.000Z",
            contact: { id: "c1", name: "Asha Rao" },
            who: "Asha Rao",
            leadId: "l1",
            rows: [
                { label: "Name", value: "Asha", long: false },
                { label: "Message", value: "June wedding", long: true },
                // A field removed since keeps what was typed (#385).
                { label: "budget", value: "2 lakh", long: false },
            ],
        });
    });

    it("sends a team member as the picker draws them: no email, login, hours or services", async () => {
        const body = (await json(
            call("/api/sites/pickers", pickersRoute.GET, {}, { kind: "team" }),
        )) as { team: Record<string, unknown>[]; canChoose: boolean };
        expect(body.canChoose).toBe(true);
        expect(JSON.stringify(body)).not.toMatch(/meera@example|u1|serviceIds/);
        expect(body.team[0].membership).toStrictEqual({ role: "MEMBER" });
    });

    it("leaves out of a past version what this build can't draw, and says how many", async () => {
        const body = (await json(
            call(
                "/api/sites/site_1/versions/pub_0",
                versionRoute.GET,
                ROUTES[5][2],
            ),
        )) as {
            pages: { sections: unknown[] }[];
            unrenderableCount: number;
            isCurrent: boolean;
        };
        expect(body.pages[0].sections).toEqual([
            { type: "hero", content: { title: "Hi" } },
        ]);
        expect(body.unrenderableCount).toBe(1);
        expect(body.isCurrent).toBe(false);
    });

    it("the web address crosses as where the site is, never its token", async () => {
        for (const [path, GET, s] of ROUTES.slice(0, 3)) {
            const wire = JSON.stringify(await json(call(path, GET, s)));
            expect(wire, path).not.toContain("secret-token");
        }
    });
});
