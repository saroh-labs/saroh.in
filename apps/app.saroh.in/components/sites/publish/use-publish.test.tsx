// @vitest-environment jsdom
// The Publish count follows the server after a refresh: a page added and
// deleted elsewhere left "3 changes waiting" (ER3, 22 Nov 2026).
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sites/actions", () => ({
    getSiteFlags: vi.fn(),
    publishSite: vi.fn(),
}));
vi.mock("@/lib/sites/changes-read", () => ({ readSiteChanges: vi.fn() }));

import type { SiteFlags } from "@/lib/sites/service";
import { usePublish } from "./use-publish";

let root: Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
});

describe("usePublish counts", () => {
    it("takes the server's new counts when a refresh brings them", () => {
        const seen: (number | null)[] = [];
        function Probe(p: { units: number; sections: number }) {
            const publish = usePublish({
                siteId: "s1",
                initialFlags: {} as SiteFlags,
                initialNeverPublished: false,
                initialPendingChanges: p.sections,
                initialPendingSiteChanges: p.units ? ["pages"] : [],
                initialPendingUnits: p.units,
                refreshReview: () => Promise.resolve(),
            });
            seen.push(publish.pendingUnits);
            return <i data-sections={publish.pendingChanges ?? ""} />;
        }
        const el = document.createElement("div");
        root = createRoot(el);
        act(() => root?.render(<Probe units={3} sections={2} />));
        expect(seen.at(-1)).toBe(3);
        // The page is deleted; router.refresh() hands down the server's 0.
        act(() => root?.render(<Probe units={0} sections={0} />));
        expect(seen.at(-1)).toBe(0);
        expect(el.querySelector("i")?.getAttribute("data-sections")).toBe("0");
    });
});
