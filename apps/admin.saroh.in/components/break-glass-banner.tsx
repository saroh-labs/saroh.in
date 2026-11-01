"use client";

import { ClaimPlatformOwnerDialog } from "@/components/claim-platform-owner-dialog";

/**
 * One line at the top of the work area while someone is in through the
 * break-glass `ADMIN_ALLOWLIST` with no recorded grant (admin console
 * redesign U10, R16), and its one action: Make me Platform owner, which
 * records the grant (with a reason, on the audit trail), after which the
 * line is gone. The API refuses it to anyone who already has a grant.
 * On every page, as decided; on a phone, one line.
 */
export function BreakGlassBanner() {
    return (
        <div className="border-b border-warning/30 bg-warning-subtle px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-warning-subtle-foreground">
                <strong className="font-semibold">Temporary access</strong>
                {/* On a phone the line is the title and the button; the
                    dialog says why (money audit M7). */}
                <span className="hidden min-w-0 flex-[1_1_22rem] sm:inline">
                    You&rsquo;re in through the emergency staff list, so this
                    access can&rsquo;t be taken back or traced to a role.
                </span>
                <ClaimPlatformOwnerDialog triggerClassName="h-8" />
            </div>
        </div>
    );
}
