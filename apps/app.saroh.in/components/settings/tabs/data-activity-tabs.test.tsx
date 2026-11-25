// @vitest-environment jsdom
/**
 * Your data and Activity on React Query (DEC-259, U35), in the browser.
 * With nothing held, each draws its real title and the loader's pieces at
 * once, no rows, and reads its route once. Prepare a download goes with
 * the tab's business and reads the downloads once, never a server render;
 * a refusal reads nothing. A download's link comes from Download's own
 * action and is never held in the cache.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    refresh: vi.fn(),
    fetch: vi.fn(),
    start: vi.fn(),
    link: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/data",
}));
vi.mock("@/lib/data-export/actions", () => ({
    startDataExport: (...a: unknown[]) => h.start(...a) as unknown,
    getDataExportLink: (...a: unknown[]) => h.link(...a) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
}));

import { dataExportsRead } from "@/lib/data-export/queries";
import type { DataExportList } from "@/lib/data-export/words";
import { renderWithQuery } from "@/lib/query/test-utils";
import type { ActivityScreen } from "@/lib/settings/queries";

import { ActivityContainer } from "./activity-tab";
import { DataContainer } from "./data-tab";

const ORG = "org_1";
const EXPORTS: DataExportList = {
    exports: [
        {
            id: "e1",
            status: "READY",
            requestedAt: "2031-11-01T00:00:00.000Z",
            readyAt: "2031-11-01T00:00:00.000Z",
            expiresAt: "2099-11-08T00:00:00.000Z",
            sizeBytes: 2048,
            counts: null,
            failure: null,
        },
    ],
    inProgress: false,
};
const ACTIVITY: ActivityScreen = { entries: [] };

let unmount: (() => void) | undefined;
beforeEach(() => {
    for (const f of Object.values(h)) f.mockReset();
    h.fetch.mockImplementation((url: string) =>
        Promise.resolve(
            Response.json(
                String(url).startsWith("/api/settings/data")
                    ? EXPORTS
                    : ACTIVITY,
            ),
        ),
    );
    vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

const settle = async () => {
    for (let i = 0; i < 6; i++) {
        await act(() => new Promise((r) => setTimeout(r, 0)));
    }
};
const reads = (path: string) =>
    h.fetch.mock.calls.filter(([url]) => String(url).startsWith(path)).length;
const press = async (name: string) => {
    const b = Array.from(document.querySelectorAll("button")).find(
        (x) => x.textContent.trim() === name,
    );
    if (!b) throw new Error(`No button "${name}"`);
    await act(async () => {
        b.click();
        await Promise.resolve();
    });
    await settle();
};

describe("Your data", () => {
    it("draws its title and the loader at once, then the downloads from one read", async () => {
        const r = renderWithQuery(<DataContainer />, { orgId: ORG });
        unmount = r.unmount;
        expect(r.host.textContent).toContain("Your data");
        expect(r.host.textContent).not.toContain("Prepare a download");
        await settle();
        expect(reads("/api/settings/data")).toBe(1);
        expect(r.host.textContent).toContain("Prepare a download");
    });

    it("prepares a download with the tab's business and reads once; a refusal reads nothing", async () => {
        const r = renderWithQuery(<DataContainer />, { orgId: ORG });
        unmount = r.unmount;
        await settle();

        h.start.mockResolvedValueOnce({ ok: false, error: "Owner only." });
        await press("Prepare a download");
        expect(h.start).toHaveBeenCalledWith(ORG);
        expect(reads("/api/settings/data")).toBe(1);

        h.start.mockResolvedValueOnce({
            ok: true,
            data: { export: EXPORTS.exports[0], already: false },
        });
        await press("Prepare a download");
        expect(reads("/api/settings/data")).toBe(2);
        expect(h.refresh).not.toHaveBeenCalled();
        // The list holds no link: one is made only when Download is pressed.
        expect(
            JSON.stringify(r.client.getQueryData(dataExportsRead.key(ORG, {}))),
        ).not.toMatch(/https?:/);
    });
});

describe("Activity", () => {
    it("draws its title and the loader at once, then says none yet, from one read", async () => {
        const r = renderWithQuery(<ActivityContainer />, { orgId: ORG });
        unmount = r.unmount;
        expect(r.host.textContent).toContain("Activity");
        expect(r.host.textContent).not.toContain("No changes yet");
        await settle();
        expect(reads("/api/settings/activity")).toBe(1);
        expect(r.host.textContent).toContain("No changes yet");
    });
});
