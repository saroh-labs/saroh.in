/** A run of words inside a paragraph, list item, table cell or callout. */
export type Inline =
    | { t: "text"; text: string }
    | { t: "bold"; text: string }
    | { t: "link"; text: string; href: string };

/** One block of a page's body, in the order written (`parseBlocks`). */
export type Block =
    | { type: "h2"; id: string; text: string }
    | { type: "p"; inline: Inline[] }
    | { type: "ul" | "ol"; items: Inline[][] }
    | { type: "table"; head: Inline[][]; rows: Inline[][][] }
    | { type: "callout"; inline: Inline[] }
    | { type: "image"; src: string; alt: string };

/** An H2 as OnThisPage lists it. */
export interface OutlineItem {
    id: string;
    text: string;
}
