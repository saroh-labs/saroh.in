/**
 * What else lets go of someone as they leave a business, before their
 * membership goes (GC-09): today their Google Calendar, registered at boot
 * by `CalendarSyncModule` (`CalendarReleaseService.releaseMember`). A hook
 * rather than an import, so the team module doesn't pull Google Calendar's
 * controllers into everything that imports it.
 */
export type MemberLeavingHook = (
    organizationId: string,
    membershipId: string,
) => Promise<void>;

let hook: MemberLeavingHook | null = null;

export function setMemberLeavingHook(next: MemberLeavingHook | null): void {
    hook = next;
}

export async function memberLeaving(
    organizationId: string,
    membershipId: string,
): Promise<void> {
    await hook?.(organizationId, membershipId);
}
