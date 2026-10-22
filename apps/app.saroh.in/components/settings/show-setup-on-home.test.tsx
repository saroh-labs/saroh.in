// @vitest-environment jsdom
/**
 * "Show setup on Home" (Home plan A4, U6): Home's Hide for now is kept per
 * person, in this browser; Settings › Business offers the way back only
 * while it is hidden, and pressing it shows the checklist on Home again.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    setSetupHidden,
    useSetupHidden,
} from "@/components/home/setup/use-setup-hidden";
import { readSetupHidden } from "@/lib/settings/ready";

import { ShowSetupOnHome } from "./show-setup-on-home";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

/** What Home's checklist reads, beside the link. */
function HomeSays({ id }: { id: string }) {
    return <span data-home-hidden={String(useSetupHidden(id))} />;
}

const link = () =>
    Array.from(host.querySelectorAll("a")).find(
        (a) => a.textContent === "Show setup on Home",
    );

describe("ShowSetupOnHome", () => {
    it("is not drawn while setup shows on Home", () => {
        act(() => root.render(<ShowSetupOnHome businessId="org_1" />));
        expect(link()).toBeUndefined();
    });

    it("is offered once setup is hidden, and brings it back", () => {
        act(() =>
            root.render(
                <>
                    <ShowSetupOnHome businessId="org_1" />
                    <HomeSays id="org_1" />
                </>,
            ),
        );
        act(() => setSetupHidden("org_1", true));
        expect(link()?.getAttribute("href")).toBe("/");
        expect(host.textContent).toContain(
            "Finish setup is hidden on Home in this browser.",
        );
        act(() => {
            // The press shows it again; the link then opens Home.
            link()?.dispatchEvent(
                new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
        });
        expect(readSetupHidden(() => window.localStorage, "org_1")).toBe(false);
        expect(
            host
                .querySelector("[data-home-hidden]")
                ?.getAttribute("data-home-hidden"),
        ).toBe("false");
        expect(link()).toBeUndefined();
    });

    it("is per business", () => {
        act(() => root.render(<ShowSetupOnHome businessId="org_2" />));
        act(() => setSetupHidden("org_1", true));
        expect(link()).toBeUndefined();
    });
});
