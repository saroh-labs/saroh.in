// @vitest-environment jsdom
/**
 * Sell › Locations on React Query (DEC-259). First paint is the route's own
 * loader until the list lands, never a made-up location; the location in
 * the address is read beside the list. A save the list shows (a pause)
 * reads the list once, writes the API's answer into the location's read
 * (no second read of it) and marks Orders and Products stale unread; a
 * refused save reads and marks nothing. Made-up names only.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(window.location.search),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/commerce/locations",
}));
vi.mock("@/lib/api/http", () => ({}));
const h = vi.hoisted(() => ({
    update: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    close: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    afterSettings: vi.fn<() => void>(),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: (...args: unknown[]) => h.update(...args),
    closeStorefront: (...args: unknown[]) => h.close(...args),
}));
vi.mock("@/lib/query/invalidate", () => ({
    afterSettingsSave: () => h.afterSettings(),
}));
vi.mock("@/lib/stores/actions", () => ({ updateStore: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
}));

import { isSettingsQuery } from "@/lib/query/freshness";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

import { LocationsContainer } from "./locations-container";

const ORG = "org_1";
const HILL = {
    id: "st_hill",
    name: "Hill Road",
    orderCount: 0,
    kind: "ONLINE",
    paused: false,
};
const SETTINGS = {
    ...HILL,
    currency: "INR",
    currencyLocked: false,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: null,
    openingHours: null,
    collectionEnabled: false,
    fulfilmentTypes: [],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};
const LIST = { storefronts: [HILL], limit: 3, site: null, notTakingOrders: [] };
const ONE = { settings: SETTINGS, roster: null };

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(
        null,
        "",
        "/commerce/locations?section=pause-or-close",
    );
    reads.length = 0;
    h.update.mockReset();
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url.split("?")[0] ?? url);
            await held;
            const body = url.startsWith("/api/locations/") ? ONE : LIST;
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 30) => act(() => new Promise((r) => setTimeout(r, ms)));

const OTHERS = [
    domainKey("orders", ORG, "list", {}),
    domainKey("products", ORG, "list", {}),
];

function open(chosen?: string) {
    const client = makeTestClient();
    for (const key of OTHERS) client.setQueryData(key, {});
    return renderWithQuery(
        <LocationsContainer
            businessName="Rye & Co."
            chosen={chosen}
            userId="u_1"
            organization={{ role: "OWNER", actions: undefined }}
            mayCreate
            canEdit
            canUploadLogo
            canClose
            canLinkCustomers
        />,
        { client, orgId: ORG },
    );
}

const pressPause = () =>
    act(async () => {
        Array.from(document.querySelectorAll("button"))
            .find((b) => b.textContent.trim() === "Pause location")
            ?.click();
        await new Promise((r) => setTimeout(r, 30));
    });

describe("Locations before its reads land", () => {
    it("draws the route's loader, then the location; the address's one is read beside the list", async () => {
        const { host, unmount } = open("st_hill");
        await tick();
        expect(host.querySelector('[data-shape="settings"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Hill Road");
        // Both reads are on their way at once, not one after the other.
        expect(reads.sort()).toEqual([
            "/api/locations",
            "/api/locations/st_hill",
        ]);
        release();
        await tick(60);
        expect(host.querySelector("h1")?.textContent).toBe("Hill Road");
        expect(host.querySelector('[data-slot="page-loading"]')).toBeNull();
        unmount();
    });

    it("with no location in the address, the first is read once the list lands", async () => {
        const { host, unmount } = open();
        await tick();
        expect(reads).toEqual(["/api/locations"]);
        release();
        await tick(60);
        expect(reads).toEqual(["/api/locations", "/api/locations/st_hill"]);
        expect(host.querySelector("h1")?.textContent).toBe("Hill Road");
        unmount();
    });
});

describe("a save on a location", () => {
    it("reads the list once, keeps the location's read, marks Orders and Products stale", async () => {
        h.update.mockResolvedValue({
            ok: true,
            data: { ...SETTINGS, paused: true, pausedAt: "2026-11-25" },
        });
        const { client, unmount } = open("st_hill");
        release();
        await tick(60);
        reads.length = 0;
        await pressPause();
        expect(h.update).toHaveBeenCalledWith("st_hill", { paused: true }, ORG);
        expect(reads).toEqual(["/api/locations"]);
        expect(
            client.getQueryData<{ settings: { pausedAt: string } }>(
                domainKey("stores", ORG, "location", "st_hill"),
            )?.settings.pausedAt,
        ).toBe("2026-11-25");
        for (const key of OTHERS) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        unmount();
    });

    it("refused, reads and marks nothing", async () => {
        h.update.mockResolvedValue({ ok: false, error: "No." });
        const { client, unmount } = open("st_hill");
        release();
        await tick(60);
        reads.length = 0;
        await pressPause();
        expect(reads).toEqual([]);
        for (const key of OTHERS) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(false);
        }
        unmount();
    });
});

describe("closing a location", () => {
    it("drops its read: the settings read-again after it asks for the list, never the closed one", async () => {
        h.close.mockResolvedValue({ ok: true, data: undefined });
        const { client, unmount } = open("st_hill");
        h.afterSettings.mockImplementation(
            () => void client.invalidateQueries({ predicate: isSettingsQuery }),
        );
        release();
        await tick(60);
        reads.length = 0;
        await act(async () => {
            Array.from(document.querySelectorAll("button"))
                .find((b) => b.textContent.trim() === "Close permanently")
                ?.click();
            await new Promise((r) => setTimeout(r, 30));
        });
        await act(async () => {
            Array.from(document.querySelectorAll("button"))
                .find((b) => b.textContent.trim() === "Close location")
                ?.click();
            await new Promise((r) => setTimeout(r, 60));
        });
        expect(h.close).toHaveBeenCalledWith("st_hill", ORG);
        expect(h.afterSettings).toHaveBeenCalledTimes(1);
        expect(reads).toEqual(["/api/locations"]);
        unmount();
    });
});
