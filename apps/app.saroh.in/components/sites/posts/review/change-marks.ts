import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";

/**
 * The reviewer's change marks inside the styled post (R3, `WXWReview`):
 * each top-level block of the draft that the live copy doesn't have is
 * ringed and numbered "Change n of m", the same numbering Next change
 * walks. Blocks are matched by their words (spaces ignored), a card by
 * its kind and id, a photo by its address. What was taken out is counted,
 * not drawn: it is no longer in the draft.
 */

const squash = (text: string) => text.replace(/\s+/g, "");

/** One draft block's fingerprint, or null for one with nothing to compare. */
export function blockKey(node: PmNode): string | null {
    const text = squash(node.textContent);
    if (text) return `t:${text}`;
    if (node.type.name === "businessEmbed")
        return `e:${String(node.attrs.kind)}:${String(node.attrs.id)}`;
    if (node.type.name === "image") return `i:${String(node.attrs.src)}`;
    if (node.type.name === "gallery") {
        const srcs: string[] = [];
        node.descendants((n) => {
            if (n.type.name === "image") srcs.push(String(n.attrs.src));
        });
        return `g:${srcs.join(",")}`;
    }
    return null;
}

/** The live copy's blocks, fingerprinted the same way from its HTML. */
export function liveKeys(html: string): string[] {
    return liveBlocks(html).map((b) => b.key);
}

/** Each top-level block of some HTML: its fingerprint and its words. */
export function liveBlocks(html: string): { key: string; text: string }[] {
    // An inert document: nothing in it loads or runs.
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.body.children).flatMap((el) => {
        const words = el.textContent.trim();
        const text = squash(words);
        if (text) return [{ key: `t:${text}`, text: words }];
        const embed = el.getAttribute("data-embed");
        if (embed)
            return [
                {
                    key: `e:${embed}:${el.getAttribute("data-id") ?? ""}`,
                    text: "",
                },
            ];
        if (el.hasAttribute("data-gallery")) {
            const srcs = Array.from(el.querySelectorAll("img")).map(
                (i) => i.getAttribute("src") ?? "",
            );
            return [{ key: `g:${srcs.join(",")}`, text: "" }];
        }
        const img = el.tagName === "IMG" ? el : el.querySelector("img");
        return img
            ? [{ key: `i:${img.getAttribute("src") ?? ""}`, text: "" }]
            : [];
    });
}

/** Which of the draft's top-level blocks are new or changed, by position. */
export function changedBlocks(
    doc: PmNode,
    live: readonly string[],
): { from: number; to: number }[] {
    const known = new Set(live);
    const out: { from: number; to: number }[] = [];
    doc.forEach((node, offset) => {
        const key = blockKey(node);
        if (key !== null && !known.has(key)) {
            out.push({ from: offset, to: offset + node.nodeSize });
        }
    });
    return out;
}

function label(n: number, of: number): HTMLElement {
    const el = document.createElement("span");
    // An ink tag on the box's top edge (`WXWReview`, R3.2), in the
    // page's own ink: it sits on the merchant's page in either theme.
    el.className =
        "-mb-1 ml-[-4px] inline-block rounded-t-md bg-site-fg px-2 py-0.5 font-sans text-xs font-semibold text-site-bg";
    el.setAttribute("contenteditable", "false");
    el.textContent = `Change ${n} of ${of}`;
    return el;
}

export const ChangeMarks = Extension.create<{ live: string[] }>({
    name: "changeMarks",
    addOptions() {
        return { live: [] };
    },
    addProseMirrorPlugins() {
        const live = this.options.live;
        return [
            new Plugin({
                key: new PluginKey("changeMarks"),
                props: {
                    decorations: (state) => {
                        const blocks = changedBlocks(state.doc, live);
                        return DecorationSet.create(
                            state.doc,
                            blocks.flatMap((b, i) => [
                                Decoration.widget(
                                    b.from,
                                    () => label(i + 1, blocks.length),
                                    { side: -1, key: `change-${i + 1}` },
                                ),
                                Decoration.node(b.from, b.to, {
                                    "data-change": String(i + 1),
                                    tabindex: "-1",
                                    // An ink 1.5px box, ink words (R3.1).
                                    class: "scroll-mt-16 rounded-sm text-site-fg outline-none ring-[1.5px] ring-site-fg ring-offset-4 ring-offset-site-bg",
                                }),
                            ]),
                        );
                    },
                },
            }),
        ];
    },
});

/**
 * A reader's paragraphs as feedback targets on a phone (R2): each top-level
 * block with words takes focus, so Enter on it works as a tap does.
 */
export const FeedbackBlocks = Extension.create({
    name: "feedbackBlocks",
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey("feedbackBlocks"),
                props: {
                    decorations: (state) => {
                        const out: Decoration[] = [];
                        state.doc.forEach((node, offset) => {
                            if (!node.textContent.trim()) return;
                            out.push(
                                Decoration.node(
                                    offset,
                                    offset + node.nodeSize,
                                    {
                                        tabindex: "0",
                                        "aria-description":
                                            "Enter for feedback on this paragraph",
                                    },
                                ),
                            );
                        });
                        return DecorationSet.create(state.doc, out);
                    },
                },
            }),
        ];
    },
});
