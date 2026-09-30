/**
 * The top of a module page (DEC-073 #9): the page's title, and its lead
 * line when it has one, as the Customer Site design draws its Book, Prices,
 * Shop, Journal and Contact pages above their cards.
 *
 * The title is the page's own (which is also its menu name, G14). A page
 * carries no lead of its own yet, so the live site passes none and the top
 * is the title alone; a rich-text intro, when the page starts with one, sits
 * under it on the cards' line (`RichTextSection`'s `align="cards"`).
 *
 * On the cards' width and margins (the Plans, Class packs, Product grid and
 * the services' cards), so the title's left edge is theirs. Drawn from
 * `--site-*` only.
 */

/** What a module page's top says: its title, and a lead when it has one. */
export interface ModulePageTopContent {
    title: string;
    lead?: string | null;
}

/**
 * The top for a published page, or null: only a module page (a kind other
 * than FREE) with a title has one. Free-form pages lay out their own tops.
 */
export function modulePageTopOf(page: {
    kind?: string | null;
    title?: string | null;
    lead?: string | null;
}): ModulePageTopContent | null {
    if (!page.kind || page.kind === "FREE") return null;
    const title = page.title?.trim() ?? "";
    if (title === "") return null;
    const lead = page.lead?.trim() ?? "";
    return { title, lead: lead === "" ? null : lead };
}

export function ModulePageTop({ title, lead }: ModulePageTopContent) {
    return (
        <div className="mx-auto w-full max-w-screen-xl px-5 pt-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            <h1 className="font-site-heading text-site-fg m-0 text-[calc(clamp(2rem,7vw,2.875rem)*var(--site-heading-scale))] font-semibold leading-[1.08] tracking-[-0.02em] [text-wrap:balance]">
                {title}
            </h1>
            {lead ? (
                <p className="text-site-body mt-2 max-w-[60ch] text-[15px] leading-[1.55] [text-wrap:pretty]">
                    {lead}
                </p>
            ) : null}
        </div>
    );
}
