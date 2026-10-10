// @vitest-environment jsdom
/**
 * `useArrivals`: a row that wasn't there before the list read itself again
 * enters with an edge, until it is touched. What the list first drew, and
 * anything a change of tab or filter brought, is never new.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { arrivalProps, useArrivals } from "./use-arrivals";

function List({ ids, scope }: { ids: string[]; scope?: string }) {
    const arrivals = useArrivals(ids, scope);
    return (
        <ul>
            {ids.map((id) => (
                <li
                    key={id}
                    data-id={id}
                    {...arrivalProps(arrivals.isNew(id), () =>
                        arrivals.touch(id),
                    )}
                >
                    <a href={`/orders/${id}`}>{id}</a>
                </li>
            ))}
        </ul>
    );
}

let root: Root;
let host: HTMLDivElement;

const draw = (ids: string[], scope?: string) =>
    act(() => root.render(<List ids={ids} scope={scope} />));
const row = (id: string) =>
    host.querySelector<HTMLLIElement>(`[data-id="${id}"]`);
const arrived = () =>
    Array.from(host.querySelectorAll("[data-arrived]")).map((el) =>
        el.getAttribute("data-id"),
    );

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("useArrivals", () => {
    it("nothing on screen when the list first draws is new", () => {
        draw(["a", "b"]);
        expect(arrived()).toEqual([]);
    });

    it("a row that came in on a refresh enters, with the edge", () => {
        draw(["a", "b"]);
        draw(["c", "a", "b"]);
        expect(arrived()).toEqual(["c"]);
        // The list's own entrance motion, and the edge beside it.
        expect(row("c")?.className).toBe("wk-item wk-arrived");
        expect(row("a")?.className).toBe("");
    });

    it("it keeps the edge through later refreshes, until touched", () => {
        draw(["a"]);
        draw(["b", "a"]);
        draw(["c", "b", "a"]);
        expect(arrived()).toEqual(["c", "b"]);

        act(() => {
            row("b")?.dispatchEvent(
                new Event("pointerdown", { bubbles: true }),
            );
        });
        expect(arrived()).toEqual(["c"]);
        // Touched stays touched.
        draw(["c", "b", "a"]);
        expect(arrived()).toEqual(["c"]);
    });

    it("reaching it by keyboard is touching it", () => {
        draw(["a"]);
        draw(["b", "a"]);
        act(() => row("b")?.querySelector("a")?.focus());
        expect(arrived()).toEqual([]);
    });

    it("a change of tab, filter or page marks nothing: the person asked for it", () => {
        draw(["a", "b"], "/commerce/orders?tab=open");
        draw(["x", "y"], "/commerce/orders?tab=done");
        expect(arrived()).toEqual([]);
        // And a refresh in the new scope marks only what comes in there.
        draw(["z", "x", "y"], "/commerce/orders?tab=done");
        expect(arrived()).toEqual(["z"]);
    });

    it("a row that left and came back is not new again", () => {
        draw(["a", "b"]);
        draw(["a"]);
        draw(["a", "b"]);
        expect(arrived()).toEqual([]);
    });

    it("an empty list filling up marks what arrives", () => {
        draw([]);
        draw(["a"]);
        expect(arrived()).toEqual(["a"]);
    });
});

describe("arrivalProps", () => {
    it("is nothing at all for a row that was already there", () => {
        expect(arrivalProps(false, () => undefined)).toEqual({});
    });
});
