// @vitest-environment jsdom
/**
 * The editor started afresh after a write that changed its draft on the
 * server (DEC-182): `reloadDraft` reads the page again, and the editor is
 * remounted only once the server's new props arrive, never on its own
 * re-renders and never before.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteEditorProps } from "@/components/sites/editor/site-editor-props";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The editor itself, as a probe: how many times it was started, and its
// `reloadDraft`.
const editor = vi.hoisted(() => ({
    mounts: 0,
    reload: null as null | ((pageId?: string) => void),
    sections: [] as unknown[],
}));
vi.mock("./site-editor", async () => {
    const { useState } = await import("react");
    return {
        SiteEditor: (props: SiteEditorProps) => {
            // Seeded once, as the real editor's state is.
            const [sections] = useState(() => {
                editor.mounts += 1;
                return props.initialSections;
            });
            editor.reload = props.reloadDraft ?? null;
            editor.sections = sections;
            return null;
        },
    };
});

import { SiteEditorHost } from "./site-editor-host";

const props = (heading: string): SiteEditorProps =>
    ({
        siteId: "site-1",
        pageId: "p-home",
        initialSections: [{ type: "hero", content: { heading } }],
    }) as unknown as SiteEditorProps;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
    editor.mounts = 0;
    editor.reload = null;
});
afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
});

describe("SiteEditorHost", () => {
    it("remounts the editor on the server's new draft once it arrives", () => {
        act(() => root.render(<SiteEditorHost {...props("Ours")} />));
        expect(editor.mounts).toBe(1);

        act(() => editor.reload?.());
        expect(router.refresh).toHaveBeenCalled();
        // Nothing new from the server yet: the editor stays as it was.
        expect(editor.mounts).toBe(1);

        act(() => root.render(<SiteEditorHost {...props("Sample")} />));
        expect(editor.mounts).toBe(2);
        expect(editor.sections).toEqual([
            { type: "hero", content: { heading: "Sample" } },
        ]);
    });

    it("leaves the editor alone when new props arrive unasked", () => {
        act(() => root.render(<SiteEditorHost {...props("Ours")} />));
        act(() => root.render(<SiteEditorHost {...props("Later")} />));
        expect(editor.mounts).toBe(1);
    });

    it("opens another page by its address", () => {
        act(() => root.render(<SiteEditorHost {...props("Ours")} />));
        act(() => editor.reload?.("p-about"));
        expect(router.push).toHaveBeenCalledWith("/sites/site-1?page=p-about");
        expect(router.refresh).not.toHaveBeenCalled();
    });

    it("reads this page again when it is the one asked for", () => {
        act(() => root.render(<SiteEditorHost {...props("Ours")} />));
        act(() => editor.reload?.("p-home"));
        expect(router.refresh).toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
    });
});
