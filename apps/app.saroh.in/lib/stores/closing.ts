/**
 * Why a storefront that still holds stock can't close (#512), in the words
 * Sell → Storefronts puts beside "Close permanently" — or `null` when it
 * holds none. The API refuses the close the same way ("Move or count out its
 * stock first"); this only says so before the press.
 */
export function heldStock(store: {
    stock?: { onHand: number; promised: number };
}): string | null {
    const onHand = store.stock?.onHand ?? 0;
    const promised = store.stock?.promised ?? 0;
    const parts = [
        onHand > 0 ? `${onHand} on the shelf` : null,
        promised > 0 ? `${promised} promised to orders` : null,
    ].filter((p): p is string => p !== null);
    return parts.length === 0 ? null : `It still has ${parts.join(" and ")}.`;
}
