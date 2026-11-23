// @vitest-environment jsdom
import { customColourWords } from "@saroh/block-contract";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ShadeStrip, shadesOf } from "./shade-strip";

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

const press = (el: Element | null | undefined) =>
    act(() => (el as HTMLElement).click());

function draw() {
    const onRole = vi.fn();
    const onShade = vi.fn<(hex: string) => void>();
    act(() =>
        root.render(
            <ShadeStrip
                label="Brand"
                base="#A5A5A5"
                current={null}
                onRole={onRole}
                onShade={onShade}
            />,
        ),
    );
    return { onRole, onShade };
}

it("is five steps, lighter to darker, the role itself in the middle", () => {
    const shades = shadesOf("#A5A5A5");
    expect(shades).toHaveLength(5);
    expect(shades[2]).toBe("#A5A5A5");
    expect(shades[0] > shades[4]).toBe(true);
});

it("goes back to the role on the middle step, and applies a readable shade at once", () => {
    const { onRole, onShade } = draw();
    const steps = host.querySelectorAll("[data-shade]");
    press(steps[2]);
    expect(onRole).toHaveBeenCalled();
    press(steps[4]);
    expect(onShade).toHaveBeenCalledWith(shadesOf("#A5A5A5")[4]);
});

it("warns before a shade no words read on, and waits for Use it anyway", () => {
    const { onShade } = draw();
    const failing = shadesOf("#A5A5A5")[3];
    expect(customColourWords(failing).readable).toBe(false);
    press(host.querySelectorAll("[data-shade]")[3]);
    expect(onShade).not.toHaveBeenCalled();
    expect(host.querySelector("[data-shade-warning]")?.textContent).toContain(
        "hard to read",
    );
    press(
        Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Use it anyway",
        ),
    );
    expect(onShade).toHaveBeenCalledWith(failing);
    expect(host.querySelector("[data-shade-warning]")).toBeNull();
});
