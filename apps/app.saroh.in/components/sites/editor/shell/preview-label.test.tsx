// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { CanvasBar } from "./canvas-bar";
import { PreviewLabel } from "./preview-label";

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

it("says it once, as a status", () => {
    act(() => root.render(<PreviewLabel />));
    const label = host.querySelector('[role="status"]');
    expect(label?.textContent).toBe("Preview only · not saved");
});

const bar = (previewing: boolean) =>
    act(() =>
        root.render(
            <CanvasBar
                address="https://x.saroh.app"
                path="/"
                device="desktop"
                zoom={100}
                onDevice={() => undefined}
                onZoom={() => undefined}
                previewing={previewing}
            />,
        ),
    );

it("sits in the canvas bar only while a colour previews", () => {
    bar(true);
    expect(host.querySelector("[data-preview-label]")).not.toBeNull();
    bar(false);
    expect(host.querySelector("[data-preview-label]")).toBeNull();
});
