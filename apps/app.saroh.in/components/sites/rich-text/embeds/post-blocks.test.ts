// @vitest-environment jsdom
/**
 * A post's own blocks (W2) are written in exactly the shape the API's
 * sanitizer keeps (`sanitize.spec.ts` holds the same strings), so a post
 * survives save and publish unchanged and the editor never loops on its
 * own output. Node views are left out: this is the HTML.
 */
import Image from "@tiptap/extension-image";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./post-block-views", () => ({
    ContentsView: () => null,
    GalleryView: () => null,
    PostButtonView: () => null,
}));
vi.mock("./embed-card", () => ({ EmbedCard: () => null }));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));
vi.mock("./embed-picker", () => ({ EmbedPicker: () => null }));

import { filterAddItems, insertGallery } from "../writing-menus";
import { BusinessEmbed } from "./business-embed";
import { Contents, Gallery, HighlightBox, PostButton } from "./post-blocks";

const plain = [HighlightBox, Gallery, Contents, PostButton, BusinessEmbed].map(
    (n) => n.extend({ addNodeView: undefined }),
);
let editor: Editor | null = null;
const make = (content: string) => {
    editor = new Editor({
        extensions: [StarterKit, Image, ...plain],
        content,
    });
    return editor;
};
afterEach(() => editor?.destroy());

describe("a post's own blocks", () => {
    it.each([
        '<div data-box="note"><p>Bring photos.</p></div>',
        '<div data-gallery="photos"><img src="https://cdn.test/a.jpg" alt="A"><img src="https://cdn.test/b.jpg" alt="B"></div>',
        '<div data-contents="headings"></div>',
        '<p data-button="link"><a href="/book">Book a trial</a></p>',
        '<div data-embed="book" data-id="svc1"></div>',
        '<div data-embed="offer" data-id="disc_1"></div>',
    ])("writes back %s unchanged", (html) => {
        expect(make(html).getHTML()).toBe(html);
    });

    it("adds each from the add menu", () => {
        const e = make("<p>Hi</p>");
        filterAddItems("highlight")[0]?.run?.(e);
        expect(e.getHTML()).toContain('<div data-box="note"><p>Hi</p></div>');
        filterAddItems("contents")[0]?.run?.(e);
        expect(e.getHTML()).toContain('<div data-contents="headings"></div>');
        insertGallery(e, { src: "https://cdn.test/a.jpg" });
        expect(e.getHTML()).toContain(
            '<div data-gallery="photos"><img src="https://cdn.test/a.jpg" alt="">',
        );
    });

    it("puts a name that starts with what was typed first", () => {
        expect(filterAddItems("button").map((i) => i.label)).toEqual([
            "Button",
            "Book now button",
        ]);
    });

    it("offers everything the board does but Video and Instagram", () => {
        expect(filterAddItems("").map((i) => i.label)).toEqual([
            "Service card",
            "Product",
            "Offer",
            "Book now button",
            "Heading",
            "List",
            "Numbered list",
            "Quote",
            "Highlight box",
            "Contents",
            "Divider",
            "Image",
            "Gallery",
            "Button",
        ]);
    });
});
