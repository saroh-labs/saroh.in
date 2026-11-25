/**
 * Home's read routes (DEC-259): the page's prefetch and the route answer
 * the same JSON, Home goes to anyone in the business (the API shapes it by
 * role) and "Finish setup" only to someone who may change the business, as
 * the page's own gate (`lib/home/access.ts`) decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(
    (): {
        active: string | null;
        business: { id: string; actions?: string[] } | null;
        home: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        moment: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        news: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        invoiced: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
        settings: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        modules: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        home: vi.fn(),
        moment: vi.fn(),
        news: vi.fn(),
        invoiced: vi.fn(),
        settings: vi.fn(() => Promise.resolve({ id: "org_a" })),
        modules: vi.fn(() => Promise.resolve([])),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/home/service", () => ({ getHome: () => h.home() }));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    getOrganizationSettings: () => h.settings(),
}));
vi.mock("@/lib/settings/ready-service", () => ({
    loadReadyChecklist: () => Promise.resolve({ steps: [] }),
}));
vi.mock("@/lib/settings/ready", () => ({
    mayFinishSetup: (b: { actions?: string[] } | null) =>
        !!b?.actions?.includes("org:update"),
    firstSteps: () => ({ steps: [], shares: null }),
}));
vi.mock("@/lib/moments/service", () => ({
    getSeenMoments: () => Promise.resolve(null),
}));
vi.mock("@/lib/moments/read", () => ({
    homeMoment: () => h.moment(),
    homeNewFeature: () => h.news(),
}));
vi.mock("@/lib/invoices/service", () => ({
    hasAnyInvoice: () => h.invoiced(),
}));
vi.mock("@/lib/modules/service", () => ({
    listModules: () => h.modules(),
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: () => Promise.resolve(null),
}));

import { ApiError } from "@/lib/api/errors";
import { homeServer, homeSetupServer } from "@/lib/home/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as homeGET, POST } from "./route";
import { GET as setupGET } from "./setup/route";

const OWNER = { id: "org_a", actions: ["org:update", "order:read"] };
const MEMBER = { id: "org_a", actions: ["order:read"] };
const REVIEWER = { id: "org_a", actions: ["site:review"] };

const HOME = {
    view: "business",
    staff: null,
    actions: [{ code: "X", title: "Old", href: "/", severity: "LOW" }],
    hasAnyModule: true,
    upcoming: [],
    unavailable: [],
    needs: [],
    needsTotal: 0,
    ordersInProgress: 0,
    today: null,
    lastDay: null,
    week: {
        zone: "Asia/Kolkata",
        startDate: "2026-11-23",
        takings: [{ currency: "INR", amountMinor: 1 }],
        chequesWaiting: null,
    },
    tiles: null,
    needGroups: null,
    needGroupsTotal: 0,
    going: undefined,
};

const as =
    (who: typeof OWNER | null, home: () => unknown = () => HOME) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.home.mockReset();
        h.home.mockImplementation(() => Promise.resolve(home()));
        for (const fn of [h.moment, h.news]) {
            fn.mockReset();
            fn.mockResolvedValue(null);
        }
        h.invoiced.mockReset();
        h.invoiced.mockResolvedValue(false);
    };

beforeEach(as(OWNER));

describe("/api/home", () => {
    it("answers what the page's prefetch holds, without what Home doesn't show", async () => {
        await expectReadContract(homeServer, homeGET, "org_a", {});
        const body = (await (
            await homeGET(readRequest("/api/home", { orgId: "org_a" }))
        ).json()) as { actions: unknown[]; week: Record<string, unknown> };
        expect(body.actions).toEqual([]);
        expect(Object.keys(body.week).sort()).toEqual([
            "chequesWaiting",
            "startDate",
            "zone",
        ]);
    });

    it("says what Home says from it, each read only when it can be said", async () => {
        const read = async () =>
            (await (
                await homeGET(readRequest("/api/home", { orgId: "org_a" }))
            ).json()) as Record<string, unknown>;
        const first = { key: "first-order", title: "Your first order" };
        const news = { key: "new-ai-apps", title: "AI apps" };

        // The business's Home: the moment holds the slot, so no news.
        h.moment.mockResolvedValue(first);
        h.news.mockResolvedValue(news);
        expect(await read()).toMatchObject({ moment: first, news: null });
        expect(h.news).not.toHaveBeenCalled();

        // No moment: the news.
        h.moment.mockResolvedValue(null);
        expect(await read()).toMatchObject({ moment: null, news });

        // A staff member's Home: no moment is asked, the news is.
        as(OWNER, () => ({ ...HOME, view: "staff" }))();
        h.news.mockResolvedValue(news);
        expect(await read()).toMatchObject({ moment: null, news });
        expect(h.moment).not.toHaveBeenCalled();

        // A Reviewer's Home reads nothing more.
        as(REVIEWER, () => ({ ...HOME, view: "reviewer" }))();
        expect(await read()).toMatchObject({ moment: null, news: null });
        expect(h.moment).not.toHaveBeenCalled();
        expect(h.news).not.toHaveBeenCalled();

        // Nothing on yet, for a kind that invoices: "Invoice a client".
        as(
            { ...OWNER, kind: "SOLO", actions: ["invoice:write"] } as never,
            () => ({ ...HOME, hasAnyModule: false }),
        )();
        expect(await read()).toMatchObject({
            invoicing: { mayWrite: true, hasInvoice: false },
            news: null,
        });
    });

    it("is the page's gate: anyone in the business, the API shaping it", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                // The API sends a Reviewer only their review sites (F9).
                reviewer: {
                    as: as(REVIEWER, () => ({ ...HOME, view: "reviewer" })),
                    status: 200,
                },
                "signed out": {
                    as: as(null, () => {
                        throw new ApiError(401, "GET home");
                    }),
                    status: 401,
                },
                "no business": {
                    as: () => {
                        as(OWNER)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => homeGET(readRequest("/api/home", { orgId: "org_a" })),
        );
    });

    it("an API refusal is the route's, generic; only GET answers", async () => {
        as(OWNER, () => {
            throw new ApiError(403, "GET home", "no");
        })();
        const res = await homeGET(readRequest("/api/home", { orgId: "org_a" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "forbidden" });
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/home/setup", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(homeSetupServer, setupGET, "org_a", {});
    });

    it("only for someone who may change the business, as the page", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => setupGET(readRequest("/api/home/setup", { orgId: "org_a" })),
        );
    });

    it("reads the modules beside the settings, not after; unread settings leave setup off", async () => {
        as(OWNER)();
        let settle!: (v: unknown) => void;
        h.settings.mockReturnValueOnce(new Promise((r) => (settle = r)));
        h.modules.mockClear();
        const pending = setupGET(
            readRequest("/api/home/setup", { orgId: "org_a" }),
        );
        await vi.waitFor(() => expect(h.modules).toHaveBeenCalled());
        settle(null);
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        expect((await pending).status).toBe(503);
        log.mockRestore();
    });
});
