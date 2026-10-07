/**
 * A domain as typed or pasted, reduced to the bare hostname the API claims
 * (UX-066): `https://www.yourshop.in/` → `www.yourshop.in`. A merchant copies
 * their address from the browser bar, scheme, path and all; refusing that
 * with "must be a valid domain" made them guess what we wanted.
 *
 * The API strips the same way (`normalizeHostname` in `domains/dto.ts`), so
 * this is a courtesy for the field, not the rule.
 */
export function bareHostname(input: string): string {
    let value = input.trim().toLowerCase();
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    value = value.replace(/^\/\//, "");
    // Anything after the host: a path, a query, a fragment.
    value = value.split(/[/?#]/)[0] ?? "";
    // A port, and the root's trailing dot.
    value = value.replace(/:\d+$/, "").replace(/\.$/, "");
    return value;
}
