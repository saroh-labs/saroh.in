// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSwipe } from "./use-swipe";

/** Swipe left for the next day, right for the one before; touch only. */
let host: HTMLDivElement;
let root: Root;
const onPrevious = vi.fn();
const onNext = vi.fn();

function Body() {
    return <div data-body="" {...useSwipe({ onPrevious, onNext })} />;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Body />));
    onPrevious.mockClear();
    onNext.mockClear();
});
afterEach(() => act(() => root.unmount()));

function swipe(dx: number, dy: number, pointerType = "touch") {
    const el = host.querySelector("[data-body]");
    const fire = (type: string, x: number, y: number) => {
        const e = new MouseEvent(type, {
            bubbles: true,
            clientX: x,
            clientY: y,
        });
        Object.defineProperty(e, "pointerType", { value: pointerType });
        act(() => {
            el?.dispatchEvent(e);
        });
    };
    fire("pointerdown", 200, 300);
    fire("pointerup", 200 + dx, 300 + dy);
}

describe("swiping the calendar", () => {
    it("left goes on, right goes back", () => {
        swipe(-120, 10);
        expect(onNext).toHaveBeenCalledTimes(1);
        swipe(120, -10);
        expect(onPrevious).toHaveBeenCalledTimes(1);
    });

    it("a short or mostly up-and-down move is a scroll, not a swipe", () => {
        swipe(-40, 0);
        swipe(-80, 120);
        expect(onNext).not.toHaveBeenCalled();
    });

    it("a mouse drag is not a swipe", () => {
        swipe(-200, 0, "mouse");
        expect(onNext).not.toHaveBeenCalled();
    });
});
