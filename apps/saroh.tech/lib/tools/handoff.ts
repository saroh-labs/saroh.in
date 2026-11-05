/** A draft goes from one tool to another in the address's fragment, which never reaches a server. */
export function encodeDraft(draft: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(draft));
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** Null for anything that isn't a draft: the fragment is whatever was linked. */
export function decodeDraft(encoded: string): unknown {
    try {
        const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

/** Into another tool on this site: the invoice generator adds a line, say. */
export const carryHref = (path: string, carry: unknown) =>
    `${path}#carry=${encodeDraft(carry)}`;
