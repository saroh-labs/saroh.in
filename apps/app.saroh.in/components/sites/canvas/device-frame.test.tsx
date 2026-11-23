// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceFrame } from "./device-frame";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const added: Element[] = [];

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            disconnect = vi.fn();
        },
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    added.splice(0).forEach((n) => n.remove());
    vi.unstubAllGlobals();
});

function addStyle(css: string) {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
    added.push(s);
    return s;
}

const flush = () => act(() => Promise.resolve());

describe("DeviceFrame style sync", () => {
    it("adds only what is new and removes only what is gone", async () => {
        const first = addStyle("a{}");
        await act(() => {
            root.render(<DeviceFrame title="t">x</DeviceFrame>);
            return Promise.resolve();
        });
        await flush();
        const head =
            host.querySelector("iframe")?.contentDocument?.head ??
            document.createElement("head");
        const copies = (): Element[] =>
            Array.from(head.querySelectorAll("[data-editor-mirrored]"));
        const before = copies();
        expect(before.some((n) => n.textContent === "a{}")).toBe(true);

        const second = addStyle("b{}");
        await flush();
        const after = copies();
        // the first copy is the very same node: it was not re-added
        expect(after).toContain(before.find((n) => n.textContent === "a{}"));
        expect(after.some((n) => n.textContent === "b{}")).toBe(true);

        second.remove();
        await flush();
        expect(copies().some((n) => n.textContent === "b{}")).toBe(false);
        expect(copies().some((n) => n.textContent === "a{}")).toBe(true);
        first.remove();
    });
});
