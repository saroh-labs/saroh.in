// @vitest-environment jsdom
/**
 * Under the looks (DEC-182, amended 22 Oct 2026): "Bring in my details",
 * and Previous versions with Roll back (behind its own confirm) and Bring
 * in a section. Both wait while the editor has unsaved changes.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DraftTools } from "@/components/sites/draft-tools";
import type { StarterContentActions } from "@/components/sites/editor/starter-content-actions";
import type { DraftVersion } from "@/lib/sites/service";

const VERSION: DraftVersion = {
    id: "v-1",
    reason: "starter-content",
    createdAt: "2026-10-22T09:00:00.000Z",
    look: null,
    pages: [
        {
            pageId: "p-home",
            title: "Home",
            sections: [
                { key: "k-1", type: "richText", heading: "Our story" },
                { key: "k-2", type: "servicesList", heading: null },
            ],
        },
    ],
};

function starter(over: Partial<StarterContentActions> = {}) {
    return {
        blocked: null,
        copy: vi.fn().mockResolvedValue({ ok: true }),
        fillDetails: vi.fn().mockResolvedValue(undefined),
        listVersions: vi
            .fn()
            .mockResolvedValue({ ok: true, versions: [VERSION] }),
        rollback: vi.fn().mockResolvedValue({ ok: true }),
        bringIn: vi.fn().mockResolvedValue({ ok: true }),
        ...over,
    } satisfies StarterContentActions;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(s: StarterContentActions) {
    act(() => {
        root.render(
            <DraftTools starter={s} lookName={(look) => look ?? "Classic"} />,
        );
    });
}

const press = async (el: Element | null | undefined) => {
    await act(async () => {
        (el as HTMLElement).click();
        await Promise.resolve();
    });
};

function button(name: string): HTMLButtonElement {
    const found = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!found) throw new Error(`No button "${name}"`);
    return found;
}

const sheet = () => document.querySelector("[data-draft-versions]");

describe("DraftTools", () => {
    it("brings the details in", async () => {
        const s = starter();
        render(s);
        await press(button("Bring in my details"));
        expect(s.fillDetails).toHaveBeenCalledTimes(1);
    });

    it("waits while the editor has changes not saved yet", () => {
        render(starter({ blocked: "Your last changes aren't saved yet." }));
        expect(button("Bring in my details").disabled).toBe(true);
        expect(host.textContent).toContain(
            "Your last changes aren't saved yet.",
        );
    });

    it("lists the previous versions and rolls back only after its confirm", async () => {
        const s = starter();
        render(s);
        await press(button("Previous versions"));
        expect(s.listVersions).toHaveBeenCalled();
        expect(sheet()?.textContent).toContain(
            "Before the starter content · Classic",
        );

        await press(button("Roll back"));
        expect(s.rollback).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain("is kept here");
        await press(button("Roll back to this version"));
        expect(s.rollback).toHaveBeenCalledWith("v-1");
        // Done: the editor starts afresh, and the sheet closes.
        expect(sheet()).toBeNull();
    });

    it("brings one section of a version in, named by its heading or its kind", async () => {
        const s = starter();
        render(s);
        await press(button("Previous versions"));
        await press(button("Bring in a section"));
        expect(sheet()?.textContent).toContain("Our story");
        expect(sheet()?.textContent).toContain("Services list");
        await press(button("Bring in Our story"));
        expect(s.bringIn).toHaveBeenCalledWith("v-1", "p-home", "k-1");
    });

    it("says a refused roll back in the sheet and stays open", async () => {
        const s = starter({
            rollback: vi.fn().mockResolvedValue({
                ok: false,
                error: "That version isn't here",
            }),
        });
        render(s);
        await press(button("Previous versions"));
        await press(button("Roll back"));
        await press(button("Roll back to this version"));
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "That version isn't here",
        );
    });

    it("says when there are none yet", async () => {
        render(
            starter({
                listVersions: vi
                    .fn()
                    .mockResolvedValue({ ok: true, versions: [] }),
            }),
        );
        await press(button("Previous versions"));
        expect(sheet()?.textContent).toContain("No previous versions yet.");
    });
});
