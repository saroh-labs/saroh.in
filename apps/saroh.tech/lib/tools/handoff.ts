import { site } from "@/site.config";

/**
 * A draft travels in the address's fragment, which never reaches a server, so
 * nothing is typed twice and nothing is stored unless they sign up.
 */
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

export interface Handoff {
    tool: string;
    kind: string;
    draft: unknown;
    from?: unknown;
}

/** The app takes it from here. A logo is left out: it's too long for an address. */
export function importHref(
    { from, ...rest }: Handoff,
    method?: string,
): string {
    const details =
        from && typeof from === "object"
            ? { ...from, logo: undefined }
            : undefined;
    const query = new URLSearchParams({
        from: "tool",
        tool: rest.tool,
        ...(method && { method }),
    });
    return `${site.appUrl}/import?${query.toString()}#${encodeDraft({ ...rest, from: details })}`;
}

/** Into another tool on this site: the invoice generator adds a line, say. */
export const carryHref = (path: string, carry: unknown) =>
    `${path}#carry=${encodeDraft(carry)}`;
