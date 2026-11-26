// @vitest-environment jsdom
/**
 * The Website area's last screens on React Query (U18 close-out): each
 * draws its frame at once and only its data region waits; a save that
 * landed reads the site's reads again, once; a refused one reads nothing.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(window.location.search),
    usePathname: () => window.location.pathname,
    useRouter: () => ({ push, replace: vi.fn(), refresh }),
    notFound: () => {
        throw new Error("NOT_FOUND");
    },
    forbidden: () => {
        throw new Error("FORBIDDEN");
    },
}));
const refresh = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const restore = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sites/version-restore-actions", () => ({
    restoreVersionAsDraft: (...a: unknown[]) => restore(...a) as unknown,
}));
vi.mock("@/components/sites/versions/past-version-preview", () => ({
    PastVersionPreview: () => <p>preview</p>,
}));
// The Settings rows: one that saves through the tab's context.
vi.mock("@/components/sites/settings/site-settings", async () => {
    const { useSettingsSaved } =
        await import("@/components/sites/settings/settings-saved");
    return {
        SiteSettings: () => {
            const { saved, orgId } = useSettingsSaved();
            return (
                <button
                    type="button"
                    data-org={orgId}
                    onClick={() => void saved()}
                >
                    Save a row
                </button>
            );
        },
    };
});
vi.mock("@/components/sites/settings/site-settings-read", () => ({
    SiteSettingsRead: () => <p>read only</p>,
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/sites/actions", () => ({}));

import { homeKeys } from "@/lib/home/queries";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import { settingsKeys } from "@/lib/settings/queries";
import { siteKeys } from "@/lib/sites/queries";

import { AllSitesScreen } from "../all-sites/all-sites-screen";
import { SiteSettingsScreen } from "../settings/site-settings-screen";
import { SiteVersionScreen } from "../versions/site-version-screen";
import { FormEntriesContainer } from "./site-screens";

const ORG = "org_1";
const fetches: string[] = [];
const answer = (body: unknown, status = 200) =>
    Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
let routes: Record<string, () => Promise<Response>> = {};

const ENTRIES = {
    name: "Bridal enquiry",
    active: true,
    total: 1,
    entries: [
        {
            id: "e1",
            createdAt: "2026-11-03T10:00:00.000Z",
            contact: { id: "c1", name: "Asha Rao" },
            who: "Asha Rao",
            leadId: "l1",
            rows: [{ label: "Message", value: "June wedding", long: true }],
        },
    ],
};
const VERSION = {
    siteName: "Gulmohar",
    publishedAt: "2026-10-01T10:00:00.000Z",
    publishedBy: "Asha",
    isCurrent: false,
    release: null,
    renderable: true,
    unrenderableCount: 0,
    pages: [{ path: "/", title: "Home", isHome: true, sections: [] }],
    styleVariables: null,
    look: null,
    canEdit: true,
    canPublish: true,
    needsApproval: false,
    canOverride: false,
};
const SETTINGS = {
    site: { id: "site_1", can: { manageSettings: true } },
    address: null,
    approval: null,
    canChangeAddress: false,
    contact: null,
    business: null,
    locations: null,
    canEditLocations: false,
};

beforeEach(() => {
    fetches.length = 0;
    refresh.mockReset();
    push.mockReset();
    restore.mockReset();
    window.history.replaceState(null, "", "/sites/site_1");
    routes = {
        "/api/sites/site_1/forms/f1": () => answer(ENTRIES),
        "/api/sites/site_1/versions/pub_0": () => answer(VERSION),
        "/api/sites/site_1/settings": () => answer(SETTINGS),
        "/api/sites/site_1/search-tracking": () =>
            answer({ read: { ok: false }, lock: null }),
        "/api/sites": () => answer({ sites: [], canAddMore: true }),
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
/** Settles until `seen` holds (a read lands over a few ticks). */
async function until(seen: () => boolean) {
    for (let i = 0; i < 20 && !seen(); i++) await settle();
}
const button = (host: ParentNode, name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

describe("a form's entries", () => {
    it("draws All forms at once, the entries' region a loader, then the entries", async () => {
        const view = renderWithQuery(
            <FormEntriesContainer siteId="site_1" formId="f1" />,
            { orgId: ORG },
        );
        expect(
            view.host.querySelector('a[href="/sites/site_1/forms"]'),
        ).not.toBeNull();
        expect(
            view.host.querySelector('[data-slot="page-loading"]'),
        ).not.toBeNull();
        expect(view.host.querySelector("li")).toBeNull();
        await until(() => view.host.textContent.includes("Bridal enquiry"));
        expect(view.host.textContent).toContain("Bridal enquiry");
        expect(view.host.textContent).toContain("June wedding");
        expect(view.host.querySelector('a[href="/leads/l1"]')).not.toBeNull();
        expect(fetches).toEqual(["/api/sites/site_1/forms/f1"]);
        view.unmount();
    });
});

describe("a past version", () => {
    it("restored: the site's reads again, once, Home only marked stale", async () => {
        const client = makeTestClient();
        const view = renderWithQuery(
            <SiteVersionScreen siteId="site_1" publicationId="pub_0" asDraft />,
            { client, orgId: ORG },
        );
        await until(() => view.host.textContent.includes("Version from"));
        expect(view.host.textContent).toContain("Version from");
        client.setQueryData(homeKeys(ORG), { fresh: true });
        restore.mockResolvedValue({ ok: true });
        act(() => {
            button(view.host, "Restore 1 Oct as the draft")?.click();
        });
        await settle();
        act(() => {
            button(view.host, "Restore as the draft")?.click();
        });
        await settle();
        await until(
            () =>
                fetches.filter((u) => u.endsWith("/versions/pub_0")).length > 1,
        );
        await settle();
        expect(restore).toHaveBeenCalledTimes(1);
        // The tab's business goes last (DEC-259).
        expect(restore.mock.calls[0]?.[3]).toBe(ORG);
        expect(
            fetches.filter((u) => u.endsWith("/versions/pub_0")),
        ).toHaveLength(2);
        expect(client.getQueryState(homeKeys(ORG))?.isInvalidated).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
        view.unmount();
    });

    it("a refused restore reads nothing", async () => {
        const view = renderWithQuery(
            <SiteVersionScreen siteId="site_1" publicationId="pub_0" asDraft />,
            { orgId: ORG },
        );
        await until(() => view.host.textContent.includes("Version from"));
        restore.mockResolvedValue({ ok: false, error: "No." });
        act(() => {
            button(view.host, "Restore 1 Oct as the draft")?.click();
        });
        await settle();
        act(() => {
            button(view.host, "Restore as the draft")?.click();
        });
        await settle();
        await settle();
        expect(fetches).toEqual(["/api/sites/site_1/versions/pub_0"]);
        view.unmount();
    });
});

describe("a site's Settings tab", () => {
    it("a landed row reads the site's settings again, once, sends the tab's business, and marks the business's settings stale", async () => {
        const client = makeTestClient();
        const view = renderWithQuery(<SiteSettingsScreen siteId="site_1" />, {
            client,
            orgId: ORG,
        });
        expect(
            view.host.querySelector('[data-slot="page-loading"]'),
        ).not.toBeNull();
        await until(() => Boolean(button(view.host, "Save a row")));
        const row = button(view.host, "Save a row");
        expect(row?.dataset.org).toBe(ORG);
        client.setQueryData(settingsKeys(ORG), { fresh: true });
        act(() => {
            row?.click();
        });
        await until(
            () => fetches.filter((u) => u.endsWith("/settings")).length > 1,
        );
        await settle();
        expect(
            fetches.filter((u) => u === "/api/sites/site_1/settings"),
        ).toHaveLength(2);
        expect(client.getQueryState(settingsKeys(ORG))?.isInvalidated).toBe(
            true,
        );
        expect(client.getQueryState(siteKeys(ORG, "site_1"))).toBeUndefined();
        expect(refresh).not.toHaveBeenCalled();
        view.unmount();
    });
});

describe("All sites", () => {
    it("draws its heading at once; New site only once the list says another may be made", async () => {
        routes["/api/sites"] = () =>
            answer({
                sites: [
                    {
                        id: "site_1",
                        name: "Gulmohar",
                        host: null,
                        url: null,
                        status: { label: "Live", tone: "live" },
                        paused: false,
                        visits: null,
                        last: null,
                    },
                ],
                canAddMore: false,
            });
        const view = renderWithQuery(
            <AllSitesScreen mayCreate reviewer={false} />,
            {
                orgId: ORG,
            },
        );
        expect(view.host.querySelector("h1")?.textContent).toBe("Sites");
        expect(view.host.textContent).not.toContain("New site");
        await until(() => view.host.textContent.includes("Gulmohar"));
        expect(view.host.textContent).toContain("Gulmohar");
        expect(view.host.textContent).not.toContain("New site");
        view.unmount();
    });
});
