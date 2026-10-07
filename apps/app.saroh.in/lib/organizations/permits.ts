/**
 * Whether this person may do `action` here, from the permissions the API
 * resolved for their role (ADR-008) — and only from those.
 *
 * Money follows permissions, never role names (DEC-098): seeing amounts,
 * taking payment at the desk, marking an invoice paid and refunding are
 * each asked of the role's permissions, which the owner or an admin sets.
 * The built-in roles carry their default permissions in that list, so an
 * Owner is asked the same way as a role the business made. A response with
 * no permissions (a cached or older one) permits nothing here; the API
 * stays the authority and refuses anything this lets through.
 */
export function permits(
    organization: { actions?: readonly string[] } | null | undefined,
    action: string,
): boolean {
    return organization?.actions?.includes(action) ?? false;
}

/** `permits` bound to one person, for a page that asks several. */
export function permitsFor(
    organization: { actions?: readonly string[] } | null | undefined,
): (action: string) => boolean {
    return (action) => permits(organization, action);
}

/**
 * What a screen says beside a desk payment it can't offer (FB-1): shown,
 * disabled, with why — never a missing button.
 */
export const CANT_TAKE_PAYMENTS =
    "Your role can't take payments — ask an owner or admin.";

/**
 * The same, for an invoice's Mark paid. Said in the invoice's read-only
 * note, which adds who can change what a role reaches.
 */
export const CANT_MARK_PAID =
    "Your role can read this invoice but can't mark it paid.";
