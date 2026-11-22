// @vitest-environment jsdom
/**
 * The reviewer's styled post (R3) rings each new or changed block against
 * the live copy, numbered for Next change, on a real editor.
 */
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, it } from "vitest";

import { ChangeMarks, liveKeys } from "./change-marks";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

it("rings the changed and new paragraphs, and tells what the live copy had that is gone", () => {
    const live = liveKeys(
        "<p>A trial is a rehearsal.</p><p>It takes  ninety minutes.</p><p>Bring photos.</p>",
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    editor = new Editor({
        element: host,
        editable: false,
        extensions: [StarterKit, ChangeMarks.configure({ live })],
        content:
            "<p>A trial is a rehearsal.</p><p>It takes ninety minutes.</p><p>It takes two hours with hair.</p>",
    });
    const marked = host.querySelectorAll("[data-change]");
    expect(marked).toHaveLength(1);
    expect(marked.item(0).textContent).toBe("It takes two hours with hair.");
    expect(host.textContent).toContain("Change 1 of 1");
    const now = new Set(liveKeys(editor.getHTML()));
    expect(live.filter((k) => !now.has(k))).toHaveLength(1);
});
