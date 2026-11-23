// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const readVersions = vi.fn();
const readVersion = vi.fn();
vi.mock("@/lib/sites/history-read", () => ({
    readVersions: (...a: unknown[]) => readVersions(...a) as unknown,
    readVersion: (...a: unknown[]) => readVersion(...a) as unknown,
}));
vi.mock("../panels/history-compare", () => ({
    COMPARE_WIDTH: 1024,
    VersionPage: ({ path }: { path: string }) => (
        <p data-version-page={path}>The live page</p>
    ),
}));
vi.mock("@/components/shared/dates/business-zone", () => ({
    useBusinessZone: () => "Asia/Kolkata",
}));

import type { EditorModel } from "./editor-model";
import { LiveVersionPage, liveScale } from "./live-version";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
    document.body.innerHTML = "";
});

const model = {
    siteId: "s1",
    page: { path: "/services" },
} as unknown as EditorModel;

/**
 * Live version (R1): the reviewer sees this page as visitors do now, from
 * the current publication, over the canvas.
 */
it("draws this page from the live publication", async () => {
    readVersions.mockResolvedValue([
        { id: "v1", isCurrent: false, publishedAt: "2026-11-01T00:00:00Z" },
        { id: "v2", isCurrent: true, publishedAt: "2026-11-09T04:30:00Z" },
    ]);
    readVersion.mockResolvedValue({ snapshot: {}, renderability: {} });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(<LiveVersionPage model={model} />);
        await Promise.resolve();
    });
    await act(async () => {
        await Promise.resolve();
    });
    expect(readVersion).toHaveBeenCalledWith("s1", "v2");
    const region = document.querySelector("[data-live-version]");
    expect(region?.textContent).toContain("what visitors see now");
    expect(
        region
            ?.querySelector("[data-version-page]")
            ?.getAttribute("data-version-page"),
    ).toBe("/services");
    act(() => root.unmount());
});

it("says so when the site was never published", async () => {
    readVersions.mockResolvedValue([]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(<LiveVersionPage model={model} />);
        await Promise.resolve();
    });
    expect(document.body.textContent).toContain("hasn't been published yet");
    act(() => root.unmount());
});

it("fills the canvas's width and covers the whole canvas (R1)", () => {
    // A 600px canvas less its 48px padding, over History's 1024px page.
    expect(liveScale(600)).toBeCloseTo(552 / 1024);
    expect(liveScale(2000)).toBe(1);
});
