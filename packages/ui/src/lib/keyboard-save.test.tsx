// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    isModEnter,
    isModS,
    submitOnModEnter,
    useSaveShortcut,
} from "./keyboard-save";

(
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const key = (init: KeyboardEventInit) =>
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

describe("which keys save", () => {
    it("Cmd+Enter and Ctrl+Enter, not Enter alone", () => {
        expect(isModEnter(key({ key: "Enter", metaKey: true }))).toBe(true);
        expect(isModEnter(key({ key: "Enter", ctrlKey: true }))).toBe(true);
        expect(isModEnter(key({ key: "Enter" }))).toBe(false);
        expect(
            isModEnter(key({ key: "Enter", metaKey: true, shiftKey: true })),
        ).toBe(false);
    });

    it("Cmd+S and Ctrl+S, not the browser's Save as", () => {
        expect(isModS(key({ key: "s", metaKey: true }))).toBe(true);
        expect(isModS(key({ key: "S", ctrlKey: true }))).toBe(true);
        expect(isModS(key({ key: "s" }))).toBe(false);
        expect(isModS(key({ key: "s", metaKey: true, shiftKey: true }))).toBe(
            false,
        );
    });
});

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

describe("a form", () => {
    function Page({
        onSubmit,
        onIssue,
    }: {
        onSubmit: () => void;
        onIssue: () => void;
    }) {
        return (
            <form
                onKeyDown={submitOnModEnter}
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                }}
            >
                <input aria-label="Name" />
                <button type="submit">Save as draft</button>
                <button type="button" onClick={onIssue}>
                    Issue it
                </button>
            </form>
        );
    }

    it("Cmd+Enter sends it through its submit button, never the step that can't be undone", () => {
        const onSubmit = vi.fn();
        const onIssue = vi.fn();
        // jsdom has no requestSubmit that runs React's handler by default.
        act(() => root.render(<Page onSubmit={onSubmit} onIssue={onIssue} />));
        const input = host.querySelector("input");
        act(() => {
            input?.dispatchEvent(key({ key: "Enter", metaKey: true }));
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onIssue).not.toHaveBeenCalled();
    });

    it("plain Enter and other keys are left alone", () => {
        const onSubmit = vi.fn();
        act(() => root.render(<Page onSubmit={onSubmit} onIssue={vi.fn()} />));
        const input = host.querySelector("input");
        const plain = key({ key: "Enter" });
        act(() => {
            input?.dispatchEvent(plain);
            input?.dispatchEvent(key({ key: "a", metaKey: true }));
        });
        expect(plain.defaultPrevented).toBe(false);
        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe("an editor", () => {
    function Editor({ save, on = true }: { save: () => void; on?: boolean }) {
        useSaveShortcut(save, on);
        return (
            <div>
                <input aria-label="Title" />
                <div role="dialog">
                    <input aria-label="In a sheet" />
                </div>
            </div>
        );
    }

    it("Cmd+S saves, and the browser's own save does not open", () => {
        const save = vi.fn();
        act(() => root.render(<Editor save={save} />));
        const event = key({ key: "s", metaKey: true });
        act(() => {
            host.querySelector('[aria-label="Title"]')?.dispatchEvent(event);
        });
        expect(save).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it("Cmd+Enter saves too", () => {
        const save = vi.fn();
        act(() => root.render(<Editor save={save} />));
        act(() => {
            host.querySelector('[aria-label="Title"]')?.dispatchEvent(
                key({ key: "Enter", ctrlKey: true }),
            );
        });
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("a sheet over the editor answers for itself", () => {
        const save = vi.fn();
        act(() => root.render(<Editor save={save} />));
        act(() => {
            host.querySelector('[aria-label="In a sheet"]')?.dispatchEvent(
                key({ key: "s", metaKey: true }),
            );
        });
        expect(save).not.toHaveBeenCalled();
    });

    it("does nothing while it is off", () => {
        const save = vi.fn();
        act(() => root.render(<Editor save={save} on={false} />));
        act(() => {
            host.querySelector('[aria-label="Title"]')?.dispatchEvent(
                key({ key: "s", metaKey: true }),
            );
        });
        expect(save).not.toHaveBeenCalled();
    });
});
