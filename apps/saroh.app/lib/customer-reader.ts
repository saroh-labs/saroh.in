import type { SignedInCustomer } from "@saroh/site-blocks";

/**
 * Who is signed in, read at most once for a page render (G13, A5): the
 * header's bag and its account entry both need it, and each read is a call
 * to the API. A read that fails is a visitor signed out, never the page
 * down.
 */
export function customerReader(
    read: () => Promise<SignedInCustomer | null>,
): () => Promise<SignedInCustomer | null> {
    let once: Promise<SignedInCustomer | null> | null = null;
    return () => (once ??= read().catch((): SignedInCustomer | null => null));
}
