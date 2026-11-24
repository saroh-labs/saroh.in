// @vitest-environment jsdom
/**
 * Turn on Track stock (#515) on a React Query route (DEC-259): once it
 * landed, Stock and Products are marked stale without a read, and the
 * page (its tracking gate and the rail are the server's) is drawn once.
 * Refused, nothing is marked or drawn.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    refresh: vi.fn(),
    turnOn: vi.fn<(on: boolean, orgId?: string) => Promise<unknown>>(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh }),
}));
vi.mock("@/lib/stock/screen-actions", () => ({
    setBusinessStockTracking: (on: boolean, orgId?: string) =>
        h.turnOn(on, orgId),
}));
vi.mock("@saroh/ui/toast", () => ({ showSuccess: vi.fn() }));

import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

import { TurnOnTracking } from "./turn-on-tracking";

const ORG = "org_1";
const KEYS = [
    domainKey("stock", ORG, "levels", {}),
    domainKey("products", ORG, "list", {}),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
    h.refresh.mockReset();
    h.turnOn.mockReset();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function turnOn() {
    const client = makeTestClient();
    for (const key of KEYS) client.setQueryData(key, {});
    const { unmount } = renderWithQuery(<TurnOnTracking />, {
        client,
        orgId: ORG,
    });
    // The page's button, then the dialog's own (the last of that name).
    for (const at of [0, -1]) {
        await act(async () => {
            Array.from(document.querySelectorAll("button"))
                .filter((b) => b.textContent.trim() === "Turn on Track stock")
                .at(at)
                ?.click();
            await new Promise((r) => setTimeout(r, 20));
        });
    }
    return { client, unmount };
}

describe("Turn on Track stock", () => {
    it("marks Stock and Products stale and draws the page once, for the tab's business", async () => {
        h.turnOn.mockResolvedValue({
            ok: true,
            data: { tracked: true, counted: 0 },
        });
        const { client, unmount } = await turnOn();
        expect(h.turnOn).toHaveBeenCalledWith(true, ORG);
        expect(h.refresh).toHaveBeenCalledTimes(1);
        for (const key of KEYS) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("refused, marks nothing and draws nothing", async () => {
        h.turnOn.mockResolvedValue({ ok: false, error: "No." });
        const { client, unmount } = await turnOn();
        expect(h.refresh).not.toHaveBeenCalled();
        for (const key of KEYS) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(false);
        }
        unmount();
    });
});
