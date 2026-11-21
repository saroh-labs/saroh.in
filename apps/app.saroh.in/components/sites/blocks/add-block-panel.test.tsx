// @vitest-environment jsdom
/**
 * The Add block tab's families (U3, KD5): Visit us and Plans are one card
 * each, a layout inserts its own section type as before, and a search by an
 * old name finds the layout. `react-dom/client` + `act`, as `frame.test.tsx`.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addableFamilies } from "@/components/sites/editor/editor-constants";
import type { SectionType } from "@/lib/sites/service";
import { AddBlockPanel } from "./add-block-panel";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function render() {
    const onPick = vi.fn<(type: SectionType, looks: number) => void>();
    act(() => {
        root.render(
            <AddBlockPanel
                onPick={onPick}
                onBrowse={vi.fn()}
                shopOpen
                packsOpen
            />,
        );
    });
    return onPick;
}

const named = (name: string) =>
    host.querySelector<HTMLElement>(`[aria-label="${name}"]`);

describe("the Add block tab's families", () => {
    it("lists Visit us once, with its three layouts", () => {
        render();
        const visit = host.querySelectorAll('section[aria-label="Visit us"]');
        expect(visit).toHaveLength(1);
        const layouts = Array.from(visit[0].querySelectorAll("button")).map(
            (b) => b.textContent,
        );
        expect(layouts).toEqual(["Address and hours", "Hours", "Talk to us"]);
        // Contact and Hours are no longer blocks of their own.
        expect(named("Add Contact")).toBeNull();
        expect(named("Add Opening hours")).toBeNull();
    });

    it("inserts an hours section exactly as the Hours block did", () => {
        const onPick = render();
        act(() => named("Add Visit us · Hours")?.click());
        expect(onPick).toHaveBeenCalledWith("hours", 1);
    });

    it("keeps Class packs under Plans", () => {
        const onPick = render();
        const plans = host.querySelector('section[aria-label="Plans"]');
        expect(plans?.textContent).toContain("Class packs");
        act(() => named("Add Plans · Class packs")?.click());
        expect(onPick).toHaveBeenCalledWith("packs", 1);
    });

    it("reads Highlights, People and Text", () => {
        render();
        for (const name of ["Highlights", "People", "Text"]) {
            expect(named(`Add ${name}`)).not.toBeNull();
        }
    });
});

describe("searching Add block", () => {
    const layouts = (q: string) =>
        addableFamilies(true, true, q).flatMap((f) =>
            f.layouts.map((l) => `${f.name} · ${l.label}`),
        );

    it("finds Visit us · Talk to us by contact", () => {
        expect(layouts("contact")).toContain("Visit us · Talk to us");
    });

    it("finds Hours and Class packs by their old names", () => {
        expect(layouts("opening hours")).toContain("Visit us · Hours");
        expect(layouts("class packs")).toContain("Plans · Class packs");
        expect(layouts("features")).toContain("Highlights · Highlights");
    });

    it("never offers Subscribe", () => {
        expect(layouts("subscribe")).toEqual([]);
        expect(
            addableFamilies(true, true).some((f) => f.name === "Subscribe"),
        ).toBe(false);
    });
});
