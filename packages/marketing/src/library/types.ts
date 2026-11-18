/**
 * The website library's data (DEC-228, plan 2026-11-18-001 U11), as an
 * edition passes it: the blocks from the registry with its own words, and
 * the toolbar's choices. Nothing here reads the registry, so the page draws
 * whatever the edition gives it.
 */

/** One choice in a toolbar group. */
export interface LibraryOption {
    value: string;
    label: string;
}

/** A toolbar group: one address key, its options, the first the default. */
export interface LibraryControl {
    key: string;
    label: string;
    options: readonly [LibraryOption, ...LibraryOption[]];
}

/** One layout a block card offers: the section type and variant it previews. */
export interface LibraryLayout {
    type: string;
    variant: string;
    label: string;
}

export interface LibraryBlock {
    id: string;
    name: string;
    /** What it does for a visitor. */
    what: string;
    /** What it reads from the business, or the edition's "typed on the block". */
    linked: string;
    /** Empty for a block that is not built yet. */
    layouts: readonly LibraryLayout[];
    /** Not built yet (DEC-222): tagged, never previewed, never with a form. */
    coming?: boolean;
}

export interface LibraryGroup {
    name: string;
    blocks: readonly LibraryBlock[];
}

/** The words the blocks area draws around the data. */
export interface LibraryWords {
    toolbar: {
        label: string;
        components: string;
    };
    card: {
        layouts: string;
        coming: string;
        loading: string;
        failed: string;
    };
}
