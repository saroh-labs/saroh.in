/**
 * Whose Google busy times may block slots in a business now (#1047, GC-02,
 * GC-03, P4): the connections still allowed to sync, or null when none
 * are (the flag or the plan off). Google Calendar registers it at boot
 * (`CalendarSyncModule`, from `calendar-sync/calendar-allowed.ts`): the
 * answer reads the plan and the team, whose modules import the slot
 * engine, so the slot engine can't import them back.
 *
 * Unregistered, no Google busy time blocks: an API without Google Calendar
 * has none to count.
 */
export type GoogleBusyGate = (
    organizationId: string,
) => Promise<ReadonlySet<string> | null>;

let gate: GoogleBusyGate | null = null;

export function setGoogleBusyGate(next: GoogleBusyGate | null): void {
    gate = next;
}

export async function googleBusyCounted(
    organizationId: string,
): Promise<ReadonlySet<string> | null> {
    return gate ? gate(organizationId) : null;
}
