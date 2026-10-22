/**
 * Whether the viewer holds an action, and so may give it to a role.
 *
 * Unknown viewer (an older response without actions): everything, and the
 * API decides — it refuses what is out of reach whatever this says.
 */
export function viewerHolds(
    myActions: readonly string[] | null,
): (action: string) => boolean {
    if (myActions === null) return () => true;
    const mine = new Set(myActions);
    return (action) => mine.has(action);
}

/** Why a permission's switch is locked for this viewer. */
export const NOT_YOURS_TO_GIVE =
    "You don't have this yourself, so you can't give it.";

/** Why a role that can do more than the viewer is read-only for them. */
export function aboveRoleNote(labels: readonly string[]): string {
    const what = labels.length > 0 ? ` (${labels.join(", ")})` : "";
    return `This role can do things you can't${what}, so only someone who can do all of them may change it.`;
}
