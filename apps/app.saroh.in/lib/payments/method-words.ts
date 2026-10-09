/**
 * The one word for each way a person pays by hand (UX-078, owner 9 Oct):
 * Cash, UPI, Card, Bank transfer, Other — in every picker and every label.
 * Where it is taken ("at the counter", "the card machine") is a hint under
 * the choice, never the label. New order, the desk's Take payment, a pack
 * sold at the desk and Record as paid all read it.
 *
 * The stored values differ by where they were recorded — a pack's is `BANK`,
 * an invoice's `BANK_TRANSFER` — and both stay; both read "Bank transfer".
 */
export const METHOD_WORD = {
    CASH: "Cash",
    UPI: "UPI",
    CARD: "Card",
    BANK_TRANSFER: "Bank transfer",
    BANK: "Bank transfer",
    OTHER: "Other",
} as const;

export type WordedMethod = keyof typeof METHOD_WORD;

/** "Cash", "UPI", "Card"…; null for a value that isn't a way paid by hand. */
export function methodLabel(method: string | null | undefined): string | null {
    return method && Object.hasOwn(METHOD_WORD, method)
        ? METHOD_WORD[method as WordedMethod]
        : null;
}
