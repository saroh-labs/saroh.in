// @vitest-environment jsdom
/**
 * The Website area on React Query (DEC-259, U32), read in the browser: the
 * frame (section list, heading) is drawn at once from the layout's gates
 * and the header a bar of its height until its one read lands; each
 * screen's data region is the loader's rows until its read lands; a write
 * that landed reads the site's reads again, once, and Home is only marked
 * stale; a refused write reads nothing; a failure stays in its region.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(window.location.search),
    usePathname: () => window.location.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
    notFound: () => {
        throw new Error("NOT_FOUND");
    },
    forbidden: () => {
        throw new Error("FORBIDDEN");
    },
}));
const refresh = vi.hoisted(() => vi.fn());
const shown = vi.hoisted(() => ({
    pages: null as null | Record<string, unknown>,
    header: null as null | Record<string, unknown>,
}));
vi.mock("@/components/sites/pages-area/pages-area", () => ({
    PagesArea: (props: Record<string, unknown>) => {
        shown.pages = props;
        return <p>pages-area</p>;
    },
}));
vi.mock("@/components/sites/shell/site-header", () => ({
    SiteHeader: (props: Record<string, unknown>) => {
        shown.header = props;
        return <p>site-header</p>;
    },
}));
const restore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sites/version-restore-actions", () => ({
    restoreVersionAsDraft: (...a: unknown[]) => restore(...a) as unknown,
}));

// Server Actions and server reads the screens' parts import: never called here.
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/sites/actions", () => ({}));

import { homeKeys } from "@/lib/home/queries";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import { siteKeys } from "@/lib/sites/queries";

import { SiteFrame } from "../shell/site-frame";
import { SitePagesContainer, SiteVersionsContainer } from "./site-screens";

const ORG = "org_1";
const ACCESS = {
    canEdit: true,
    mayReadForms: true,
    mayBusiness: true,
    mayTeam: true,
};
const FRAME = {
    id: "site_1",
    name: "Gulmohar",
    host: "gulmohar.saroh.app",
    address: "gulmohar.saroh.app",
    liveUrl: null,
    qrUrl: null,
    status: { label: "Live", tone: "live", waiting: 0 },
    paused: false,
    canEdit: true,
    publish: null,
};
const PAGES = {
    siteName: "Gulmohar",
    pages: [
        { id: "p1", path: "/", title: "Home", isHome: true, hidden: false },
    ],
    host: "gulmohar.saroh.app",
    live: true,
    siteImageUrl: null,
    canUpdate: true,
    health: [],
    edits: [],
    lastPublishedAt: null,
    redirects: [],
    changes: [],
    aiApps: null,
};
const VERSIONS = {
    name: "Gulmohar",
    publications: [
        {
            id: "pub_1",
            number: 1,
            publishedAt: "2026-11-01T10:00:00.000Z",
            isCurrent: true,
            publishedBy: null,
            pageCount: 1,
        },
        {
            id: "pub_0",
            number: 0,
            publishedAt: "2026-10-01T10:00:00.000Z",
            isCurrent: false,
            publishedBy: null,
            pageCount: 1,
        },
    ],
    scheduled: null,
    canEdit: true,
    canPublish: true,
    needsApproval: false,
    canOverride: false,
    changesRequested: false,
};

const fetches: string[] = [];
const answer = (body: unknown, status = 200) =>
    Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
let routes: Record<string, () => Promise<Response>> = {};

beforeEach(() => {
    fetches.length = 0;
    shown.pages = null;
    shown.header = null;
    refresh.mockReset();
    restore.mockReset();
    window.history.replaceState(null, "", "/sites/site_1/pages");
    routes = {
        "/api/sites/site_1": () => answer(FRAME),
        "/api/sites/site_1/pages": () => answer(PAGES),
        "/api/sites/site_1/versions": () => answer(VERSIONS),
    };
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetches.push(url);
            return (routes[url] ?? (() => answer({ code: "x" }, 503)))();
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });

describe("SiteFrame", () => {
    it("draws the section list at once and the header from one read", async () => {
        const view = renderWithQuery(
            <SiteFrame
                siteId="site_1"
                access={ACCESS}
                mayCreate
                askAi={false}
                rendered="1"
            >
                <p>the tab</p>
            </SiteFrame>,
            { orgId: ORG },
        );
        // First paint: the groups and the tab, the header's bar, no header.
        expect(view.host.textContent).toContain("Pages and posts");
        expect(view.host.textContent).toContain("the tab");
        expect(view.host.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(shown.header).toBeNull();
        await vi.waitFor(() => expect(shown.header).not.toBeNull());
        expect(shown.header?.address).toBe("gulmohar.saroh.app");
        expect(fetches).toEqual(["/api/sites/site_1"]);
        view.unmount();
    });

    it("a header that can't be read says so in its place; the tab stays", async () => {
        routes["/api/sites/site_1"] = () =>
            answer({ code: "unavailable" }, 503);
        const view = renderWithQuery(
            <SiteFrame
                siteId="site_1"
                access={ACCESS}
                mayCreate
                askAi={false}
                rendered="1"
            >
                <p>the tab</p>
            </SiteFrame>,
            { orgId: ORG },
        );
        await vi.waitFor(() =>
            expect(view.host.textContent).toContain("Couldn"),
        );
        expect(view.host.textContent).toContain("the tab");
        view.unmount();
    });
});

describe("SitePagesContainer", () => {
    it("draws the rows' loader first, then Pages from one read", async () => {
        const view = renderWithQuery(<SitePagesContainer siteId="site_1" />, {
            orgId: ORG,
        });
        expect(view.host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(shown.pages).toBeNull();
        await vi.waitFor(() => expect(shown.pages).not.toBeNull());
        expect(shown.pages?.pages).toEqual(PAGES.pages);
        expect(fetches).toEqual(["/api/sites/site_1/pages"]);
        view.unmount();
    });

    it("a landed write reads Pages once and marks Home stale; never a refresh", async () => {
        const client = makeTestClient();
        client.setQueryData(homeKeys(ORG), { ok: true });
        const view = renderWithQuery(<SitePagesContainer siteId="site_1" />, {
            client,
            orgId: ORG,
        });
        await vi.waitFor(() => expect(shown.pages).not.toBeNull());
        fetches.length = 0;
        const save = shown.pages?.save as {
            orgId: string;
            saved: () => Promise<void>;
        };
        expect(save.orgId).toBe(ORG);
        await act(() => save.saved());
        expect(fetches).toEqual(["/api/sites/site_1/pages"]);
        expect(client.getQueryState(homeKeys(ORG))?.isInvalidated).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
        view.unmount();
    });
});

describe("SiteVersionsContainer", () => {
    it("draws its heading at once, the versions when they land; a refused restore reads nothing", async () => {
        const client = makeTestClient();
        const view = renderWithQuery(
            <SiteVersionsContainer siteId="site_1" asDraft />,
            { client, orgId: ORG },
        );
        expect(view.host.textContent).toContain("Version history");
        expect(view.host.querySelector('[data-shape="rows"]')).not.toBeNull();
        await vi.waitFor(() =>
            expect(view.host.textContent).toContain("Restore"),
        );
        fetches.length = 0;
        restore.mockResolvedValue({ ok: false, error: "Not yours." });
        const button = Array.from(view.host.querySelectorAll("button")).find(
            (b) => b.textContent.includes("Restore"),
        );
        act(() => button?.click());
        const confirm = Array.from(document.querySelectorAll("button")).filter(
            (b) => b.textContent.includes("Restore"),
        );
        act(() => confirm.at(-1)?.click());
        await settle();
        // The tab's business goes last; a refusal reads nothing again.
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore.mock.calls[0].at(-1)).toBe(ORG);
        expect(fetches).toEqual([]);
        expect(
            client.getQueryState(siteKeys(ORG, "site_1"))?.isInvalidated ??
                false,
        ).toBe(false);
        view.unmount();
    });
});
