// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddSectionDialog } from "./add-section-dialog";

// The pictures are iframes of the blocks, drawn by the catalog's tests.
vi.mock("./block-thumbnail", () => ({
    BlockThumbnail: () => <span data-thumbnail="" />,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

/** The library (A2, `WXKLibrary`). */
describe("Browse all sections", () => {
    it("a rail of the groups with counts, each card's source, and Describe a section", () => {
        const onDescribe = vi.fn();
        act(() =>
            root.render(
                <AddSectionDialog
                    open
                    onOpenChange={() => undefined}
                    onAdd={() => undefined}
                    shopOpen
                    onDescribe={onDescribe}
                />,
            ),
        );
        const rail = document.querySelector(
            'nav[aria-label="Kinds of section"]',
        );
        expect(rail?.textContent).toMatch(/Top and about\d+/);
        expect(document.body.textContent).toContain("From Services");
        const describe = document.querySelector<HTMLButtonElement>(
            "[data-describe-section]",
        );
        act(() => describe?.click());
        expect(onDescribe).toHaveBeenCalled();
    });

    it("no Ask AI, no Describe a section", () => {
        act(() =>
            root.render(
                <AddSectionDialog
                    open
                    onOpenChange={() => undefined}
                    onAdd={() => undefined}
                />,
            ),
        );
        expect(document.querySelector("[data-describe-section]")).toBeNull();
    });
});
