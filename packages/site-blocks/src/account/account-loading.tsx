import { HeldCard, HeldPage } from "./parts";

/**
 * The account's pages while they load (DEC-142): a held layout that
 * matches the page that is coming, so nothing jumps when the words arrive.
 * The header and the tabs are already there (the layout draws them); this
 * holds the content's place under them.
 *
 * Each says what is loading once, to a screen reader (`aria-busy`); the
 * bars themselves are decoration. A page that then can't be read draws its
 * own "couldn't be loaded" block: a held layout never stands in for that.
 */

export type AccountLoadingShape =
    "home" | "list" | "one" | "details" | "messages";

/** What each page says while it loads. */
export const LOADING_LABEL: Record<AccountLoadingShape, string> = {
    home: "Loading your account",
    list: "Loading",
    one: "Loading",
    details: "Loading your details",
    messages: "Loading your messages",
};

export function AccountLoading({
    shape,
    label,
}: {
    shape: AccountLoadingShape;
    /** "Loading your orders"; the shape's own words when left out. */
    label?: string;
}) {
    const says = label ?? LOADING_LABEL[shape];
    switch (shape) {
        case "home":
            // Home's two columns from tablet width up.
            return (
                <HeldPage
                    label={says}
                    className="md:grid-cols-2 md:items-start"
                >
                    <HeldCard rows={2} />
                    <HeldCard rows={1} />
                    <HeldCard rows={1} />
                    <HeldCard rows={2} />
                </HeldPage>
            );
        case "list":
            return (
                <HeldPage label={says}>
                    <HeldCard rows={3} />
                    <HeldCard rows={2} />
                </HeldPage>
            );
        case "one":
            // A thing's own page: the way back, then its card.
            return (
                <HeldPage label={says}>
                    <span
                        aria-hidden="true"
                        className="block h-3.5 w-20 rounded-full bg-[color-mix(in_srgb,hsl(var(--site-fg))_9%,hsl(var(--site-bg)))]"
                    />
                    <HeldCard rows={4} />
                </HeldPage>
            );
        case "details":
            return (
                <HeldPage label={says}>
                    <HeldCard rows={1} />
                    <HeldCard rows={1} />
                    <HeldCard rows={3} />
                    <HeldCard rows={1} />
                </HeldPage>
            );
        case "messages":
            return (
                <HeldPage label={says}>
                    <div
                        aria-hidden="true"
                        className="bg-site-surface border-site-border grid gap-3 rounded-[calc(var(--site-radius)+12px)] border p-4 md:p-5"
                    >
                        {["w-3/5", "ml-auto w-2/5", "w-1/2"].map((width) => (
                            <span
                                key={width}
                                className={`block h-9 rounded-[calc(var(--site-radius)+10px)] bg-[color-mix(in_srgb,hsl(var(--site-fg))_9%,hsl(var(--site-surface)))] ${width}`}
                            />
                        ))}
                        <span className="border-site-border mt-2 block h-11 rounded-[calc(var(--site-radius)+10px)] border" />
                    </div>
                </HeldPage>
            );
    }
}
