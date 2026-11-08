// @vitest-environment jsdom
/**
 * A Global delivery past the city: the country, then its region and postcode
 * in that country's words (owner, 8 Nov). Never "PIN".
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeliveryPlaceFields } from "./delivery-place-fields";

let root: Root;
let host: HTMLDivElement;

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

const draw = (country: string) =>
    act(() =>
        root.render(
            <DeliveryPlaceFields
                place={{ country, state: "", postalCode: "" }}
                onChange={() => undefined}
            />,
        ),
    );

const labels = () =>
    Array.from(host.querySelectorAll("[aria-label]")).map((e) =>
        e.getAttribute("aria-label"),
    );

describe("a Global delivery's place fields", () => {
    it("asks a US address for its state from the list and its ZIP code", () => {
        draw("US");
        expect(labels()).toEqual(["Country", "State", "ZIP code"]);
        expect(
            host.querySelector<HTMLInputElement>('input[aria-label="ZIP code"]')
                ?.placeholder,
        ).toBe("94105");
        expect(host.textContent).not.toMatch(/PIN/);
    });

    it("types a UK region, and asks the UAE for no postcode", () => {
        draw("GB");
        expect(labels()).toEqual(["Country", "Region", "Postcode"]);
        draw("AE");
        expect(labels()).toEqual(["Country", "Region"]);
    });
});
