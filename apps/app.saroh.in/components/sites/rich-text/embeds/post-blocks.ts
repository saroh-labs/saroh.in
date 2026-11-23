import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";

import { ContentsView, GalleryView, PostButtonView } from "./post-block-views";

/**
 * A post's own blocks (W2, `blogdesk/WXWInsert`): a highlight box, a
 * gallery, a button and the contents list. Each writes the one shape
 * `api.saroh.in` `sites/sanitize.ts` keeps, value and all, so a post
 * survives save and publish unchanged; the live page styles them by those
 * attributes (`POST_BODY_BLOCKS`) and fills the contents from the post's
 * headings (`saroh.app` `post-embeds.ts`). Nothing here runs script or
 * loads from another host, so the site's nonce CSP (DEC-244) is untouched.
 *
 * Loaded by the `document` editor only, as the business cards are.
 */

/** `<div data-box="note">…</div>`: words set apart in the site's accent. */
export const HighlightBox = Node.create({
    name: "highlightBox",
    group: "block",
    content: "block+",
    defining: true,
    parseHTML() {
        return [{ tag: 'div[data-box="note"]' }];
    },
    renderHTML() {
        return ["div", { "data-box": "note" }, 0];
    },
});

/** `<div data-gallery="photos"><img>…</div>`: photos in a grid. */
export const Gallery = Node.create({
    name: "gallery",
    group: "block",
    content: "image+",
    parseHTML() {
        return [{ tag: "div[data-gallery]" }];
    },
    renderHTML() {
        return ["div", { "data-gallery": "photos" }, 0];
    },
    addNodeView() {
        return ReactNodeViewRenderer(GalleryView);
    },
});

/** `<div data-contents="headings"></div>`: the page lists the headings. */
export const Contents = Node.create({
    name: "contents",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    parseHTML() {
        return [{ tag: 'div[data-contents="headings"]' }];
    },
    renderHTML() {
        return ["div", { "data-contents": "headings" }];
    },
    addNodeView() {
        return ReactNodeViewRenderer(ContentsView);
    },
});

/** `<p data-button="link"><a href="…">Words</a></p>`: a link as a button. */
export const PostButton = Node.create({
    name: "postButton",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
        return {
            href: { default: "" },
            label: { default: "" },
        };
    },
    parseHTML() {
        return [
            {
                tag: "p[data-button]",
                // Before the paragraph rule, which would read it as words.
                priority: 60,
                getAttrs: (el) => {
                    const a = el.querySelector("a");
                    const href = a?.getAttribute("href") ?? "";
                    return href
                        ? { href, label: a?.textContent.trim() ?? "" }
                        : false;
                },
            },
        ];
    },
    renderHTML({ node }) {
        return [
            "p",
            { "data-button": "link" },
            [
                "a",
                mergeAttributes({ href: node.attrs.href as string }),
                (node.attrs.label as string) || "Find out more",
            ],
        ];
    },
    addNodeView() {
        return ReactNodeViewRenderer(PostButtonView);
    },
});

export const POST_BLOCKS = [HighlightBox, Gallery, Contents, PostButton];
