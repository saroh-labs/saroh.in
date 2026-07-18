/**
 * Pure, deterministic object-key derivation. The client never supplies the raw
 * key — the server builds a tenant-scoped key from validated inputs so one
 * organization can never address another organization's objects, and no upload
 * can escape its prefix via path traversal.
 */

/**
 * Sanitize a free-form path segment (organizationId / purpose) down to
 * `[a-z0-9-]`. Any other run of characters collapses to a single dash.
 */
export function sanitizeSegment(value: string): string {
    return value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Sanitize a caller-supplied filename for safe use inside a key.
 *
 * Guarantees on the result: no path separators (so `../` can never traverse),
 * no leading dots (no `..`, no hidden files), collapsed dot runs, only
 * `[a-z0-9._-]`, and never empty (falls back to `file`).
 */
export function sanitizeFilename(filename: string): string {
    // Keep only the basename — strips any directory / traversal prefix.
    const parts = filename.split(/[/\\]/);
    const base = parts[parts.length - 1] ?? "";

    const cleaned = base
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-") // unsafe chars -> dash
        .replace(/\.{2,}/g, ".") // collapse `..` (and longer) to a single dot
        .replace(/-+/g, "-")
        .replace(/^[.-]+/, "") // no leading dot/dash (no hidden/traversal)
        .replace(/-+$/, ""); // no trailing dash

    return cleaned.length > 0 ? cleaned : "file";
}

/** Inputs for {@link buildObjectKey}. */
export interface BuildObjectKeyInput {
    organizationId: string;
    filename: string;
    purpose?: string;
    /**
     * Unique component of the key. Injectable for deterministic tests; callers
     * normally omit it and let the adapter supply a UUID.
     */
    uuid: string;
}

/**
 * Build the tenant-scoped storage key:
 *
 *   `org/<organizationId>/[<purpose>/]<uuid>-<sanitized-filename>`
 *
 * The key always starts with `org/<organizationId>/` (never a leading slash),
 * so tenant isolation is structural. Throws if the organizationId sanitizes to
 * empty (a namespace-less key would break isolation).
 */
export function buildObjectKey(input: BuildObjectKeyInput): string {
    const org = sanitizeSegment(input.organizationId);
    if (org.length === 0) {
        throw new Error(
            "organizationId is required to build a tenant-scoped key",
        );
    }

    const segments = ["org", org];

    if (input.purpose !== undefined) {
        const purpose = sanitizeSegment(input.purpose);
        if (purpose.length > 0) segments.push(purpose);
    }

    const safeFilename = sanitizeFilename(input.filename);
    segments.push(`${input.uuid}-${safeFilename}`);

    return segments.join("/");
}
