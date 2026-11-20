// @vitest-environment jsdom
/**
 * A post's card from the business (U15b) is written in exactly the shape
 * the API's sanitizer keeps, so a card survives save and publish unchanged
 * and the editor never loops on its own output. What the sanitizer would
 * strip is never parsed in. The node view is left out: this is the HTML.
 */
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./embed-card", () => ({ EmbedCard: () => null }));

import { BusinessEmbed } from "./business-embed";
import { insertEmbed } from "./insert-embed";

const Plain = BusinessEmbed.extend({ addNodeView: undefined });
let editor: Editor | null = null;
const make = (content: string) => {
    editor = new Editor({ extensions: [StarterKit, Plain], content });
    return editor;
};
afterEach(() => editor?.destroy());

const card = '<div data-embed="service" data-id="svc_1-a"></div>';

describe("BusinessEmbed", () => {
    it("writes back the card it read, unchanged", () => {
        const html = `<p>Before</p>${card}<p>After</p>`;
        expect(make(html).getHTML()).toBe(html);
    });

    it("adds a product card at the cursor", () => {
        const e = make("<p>Hi</p>");
        insertEmbed(e, "product", "prod1");
        expect(e.getHTML()).toContain(
            '<div data-embed="product" data-id="prod1"></div>',
        );
    });

    it("drops a card of an unknown kind or a bad id on the way in", () => {
        for (const bad of [
            '<div data-embed="iframe" data-id="x"></div>',
            '<div data-embed="service" data-id="a b"></div>',
        ]) {
            expect(make(`<p>Hi</p>${bad}`).getHTML()).not.toContain(
                "data-embed",
            );
        }
    });
});
