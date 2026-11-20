import { mergeAttributes, Node, ReactNodeViewRenderer } from "@tiptap/react";

import { EmbedCard } from "./embed-card";
import { EMBED_NODE } from "./insert-embed";

/**
 * A card from the business inside a post (U15b, `blogdesk/WXWInsert`):
 * a service with its price and Book now, or a product.
 *
 * It stores which one and nothing else, `<div data-embed="service"
 * data-id="…"></div>`, the one shape `api.saroh.in` `sites/sanitize.ts`
 * keeps (any other attribute is stripped, an unknown kind or a bad id loses
 * both). The editor draws it from Services and Products, and the live page
 * reads them when it is viewed (`saroh.app/lib/post-embeds.ts`), so the
 * post follows a price change with no republish.
 *
 * Loaded by the `document` editor only: a section's rich text has no card,
 * so pasting one there drops it on the way in.
 */

const KINDS: readonly string[] = ["service", "product"];
/** The sanitizer's id rule: what it would strip is never parsed in. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const BusinessEmbed = Node.create({
    name: EMBED_NODE,
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        // In the sanitizer's order, so the HTML it keeps is the HTML written.
        return {
            kind: {
                default: null,
                parseHTML: (el) => el.getAttribute("data-embed"),
                renderHTML: (a) => ({ "data-embed": a.kind as string }),
            },
            id: {
                default: null,
                parseHTML: (el) => el.getAttribute("data-id"),
                renderHTML: (a) => ({ "data-id": a.id as string }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "div[data-embed][data-id]",
                getAttrs: (el) =>
                    KINDS.includes(el.getAttribute("data-embed") ?? "") &&
                    ID.test(el.getAttribute("data-id") ?? "")
                        ? null
                        : false,
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(EmbedCard);
    },
});
