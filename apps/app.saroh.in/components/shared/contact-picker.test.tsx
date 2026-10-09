// @vitest-environment jsdom
/**
 * Who (invoices, subscribe, bookings): the suggestions are a listbox of
 * options a screen reader can hear, each named by the person (UX-080).
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactPicker } from "./contact-picker";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

describe("ContactPicker", () => {
    it("lists the people as options in a listbox", () => {
        act(() =>
            root.render(
                <ContactPicker
                    aria-label="Who it's for"
                    contacts={[
                        {
                            id: "c1",
                            name: "Asha Rao",
                            email: "asha@example.com",
                        },
                        { id: "c2", name: "Ravi K", email: "ravi@example.com" },
                    ]}
                    value=""
                    onValueChange={() => undefined}
                />,
            ),
        );
        const trigger =
            host.querySelector<HTMLButtonElement>('[role="combobox"]');
        expect(trigger?.getAttribute("aria-label")).toBe("Who it's for");
        act(() => trigger?.click());
        expect(document.querySelector('[role="listbox"]')).not.toBeNull();
        const options = Array.from(
            document.querySelectorAll('[role="option"]'),
        );
        expect(options.map((o) => o.textContent)).toEqual([
            "Asha Raoasha@example.com",
            "Ravi Kravi@example.com",
        ]);
    });
});
