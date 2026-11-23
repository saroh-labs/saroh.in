// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { FirstPhoto } from "@saroh/block-contract";

import { PageThumb } from "./page-thumb";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});
const draw = (photo: FirstPhoto | null) =>
    act(() => root.render(<PageThumb photo={photo} />));

it("is a plain page icon when the page has no photo", () => {
    draw(null);
    expect(host.querySelector('[data-page-thumb="icon"]')).not.toBeNull();
    expect(host.querySelector("img")).toBeNull();
});

it("shows the stored smaller copy of the first photo", () => {
    draw({ src: "https://cdn.x/p/a.jpg", widths: [480, 1200] });
    const src = host.querySelector("img")?.getAttribute("src");
    expect(src).not.toBe("https://cdn.x/p/a.jpg");
    expect(src).toContain("480");
});

it("falls back to the photo itself without stored copies", () => {
    draw({ src: "https://cdn.x/p/a.jpg" });
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
        "https://cdn.x/p/a.jpg",
    );
});
