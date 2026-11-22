/**
 * Blocks in the catalogue that are not built yet (KD6, DEC-222). Not a
 * `SectionType`: nothing here can be added in the editor or by MCP, which
 * read `BLOCK_META` only. The website library lists them as "Coming".
 */
export interface ComingBlock {
    id: string;
    name: string;
    description: string;
    /** The catalogue group it sits in (BLOCK-MAP §3 headings). */
    family: string;
}

export const COMING_BLOCKS: readonly ComingBlock[] = [
    {
        id: "subscribe",
        name: "Subscribe",
        description:
            "A heading, an email field and a button, so visitors can hear about new posts. Fine print: unsubscribe from any email in one click.",
        family: "Words",
    },
];
