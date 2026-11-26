// @vitest-environment jsdom
/**
 * Who (invoices, subscribe, bookings): the suggestions are a listbox of
 * options a screen reader can hear, each named by the person (UX-080).
 * The list is the recent few; typing asks the API's search, and a person
 * the form already holds is read by id when they aren't among them.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PICKER_RECENT } from "@/lib/contacts/queries";
import { renderWithQuery } from "@/lib/query/test-utils";

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

    /** Waits, a little at a time, until `seen` holds; fails after 2 s. */
    const until = async (seen: () => unknown) => {
        for (let t = 0; t < 40 && !seen(); t++) {
            await act(() => new Promise((r) => setTimeout(r, 50)));
        }
        expect(seen()).toBeTruthy();
    };
    const asha = { id: "c1", name: "Asha Rao", email: "asha@example.com" };
    const meera = {
        id: "c_old",
        name: "Meera Iyer",
        email: "meera@example.com",
    };

    it("asks the API's search for what is typed, and lists who it finds", async () => {
        const reads: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                reads.push(url);
                return Promise.resolve(
                    new Response(JSON.stringify([meera]), { status: 200 }),
                );
            }),
        );
        const picked = vi.fn();
        const { unmount } = renderWithQuery(
            <ContactPicker
                aria-label="Who it's for"
                contacts={Array.from({ length: PICKER_RECENT }, (_, i) => ({
                    ...asha,
                    id: `c${i}`,
                }))}
                value=""
                onValueChange={picked}
            />,
        );
        act(() =>
            document
                .querySelector<HTMLButtonElement>('[role="combobox"]')
                ?.click(),
        );
        expect(document.body.textContent).toContain(
            "Type to find anyone else.",
        );
        const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
        act(() => {
            if (!input) throw new Error("no search field");
            Reflect.set(HTMLInputElement.prototype, "value", "meera", input);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await until(() => document.querySelector('[role="option"]'));
        expect(reads).toEqual(["/api/contacts/search?q=meera"]);
        const options = Array.from(
            document.querySelectorAll('[role="option"]'),
        );
        expect(options.map((o) => o.textContent)).toEqual([
            "Meera Iyermeera@example.com",
        ]);
        act(() => (options[0] as HTMLElement).click());
        expect(picked).toHaveBeenCalledWith("c_old");
        unmount();
    });

    it("names someone the form holds who isn't among the recent few", async () => {
        const reads: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => {
                reads.push(url);
                return Promise.resolve(
                    new Response(JSON.stringify([meera]), { status: 200 }),
                );
            }),
        );
        const heard = vi.fn();
        const { host, unmount } = renderWithQuery(
            <ContactPicker
                contacts={[asha]}
                value="c_old"
                onValueChange={() => undefined}
                onContact={heard}
            />,
        );
        await until(() =>
            host
                .querySelector('[role="combobox"]')
                ?.textContent.includes("Meera"),
        );
        expect(reads).toEqual(["/api/contacts/search?id=c_old"]);
        expect(host.querySelector('[role="combobox"]')?.textContent).toContain(
            "Meera Iyer",
        );
        expect(heard).toHaveBeenCalledWith(meera);
        unmount();
    });
});
