/**
 * Where a phone's pipeline board opens (UX-077): the first stage that holds
 * a lead. The board scrolls sideways one column at a time, so opening on an
 * empty "New" hid the only lead off-screen. Null when every stage is empty:
 * the board then opens at its start.
 */
export function firstStageWithLeads(
    stages: readonly { id: string }[],
    counts: ReadonlyMap<string, number>,
): string | null {
    return stages.find((s) => (counts.get(s.id) ?? 0) > 0)?.id ?? null;
}

/** The element id of a stage's column, for the stage list's links. */
export function stageAnchor(stageId: string): string {
    return `stage-${stageId}`;
}
