/**
 * Who may set the business's invoice look (DEC-173, U6 #1118, U15 #1127):
 * `org:update`, Owner and Admin, as the settings PATCH asks. Read from what
 * the API resolved this person may do, never the role's name (DEC-098); an
 * answer without permissions offers nothing, and the API decides either
 * way. Pure.
 */
export function mayUpdateBusiness(
    actor: { actions?: string[] } | null | undefined,
): boolean {
    return actor?.actions?.includes("org:update") ?? false;
}
