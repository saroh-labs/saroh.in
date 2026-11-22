import type { Editor } from "@tiptap/react";

/**
 * What the menus need of a card (U15b), apart from the node itself, so
 * opening a menu never loads the card or its reads.
 */
export type EmbedKind = "service" | "product";

/** The node's name in the schema (`business-embed.ts`). */
export const EMBED_NODE = "businessEmbed";

/** Put a card at the cursor. */
export function insertEmbed(editor: Editor, kind: EmbedKind, id: string) {
    editor
        .chain()
        .focus()
        .insertContent({ type: EMBED_NODE, attrs: { kind, id } })
        .run();
}
