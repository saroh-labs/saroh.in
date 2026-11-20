"use client";

import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { showSuccess } from "@saroh/ui/toast";
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { disconnectMember } from "@/lib/google-calendar/actions";
import type { CalendarMember } from "@/lib/google-calendar/types";
import { teamCalendarWords } from "@/lib/google-calendar/words";

/**
 * Team's Google Calendar column (DEC-233): whether this person's bookings
 * reach their Google Calendar, and, for whoever may change their role,
 * Disconnect (audited by the API). Their events stay in Google.
 */
export function GoogleCalendarCell({
    member,
    canDisconnect,
}: {
    member: CalendarMember | null;
    canDisconnect: boolean;
}) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const words = teamCalendarWords(member);
    return (
        <div className="min-w-0 text-[12.5px]">
            <p className="m-0 truncate">{words.state}</p>
            {words.email ? (
                <p className="m-0 truncate text-[11.5px] text-muted-foreground">
                    {words.email}
                </p>
            ) : null}
            {member && member.accounts.length > 0 && canDisconnect ? (
                <>
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-[12px] underline underline-offset-2"
                        onClick={() => setConfirming(true)}
                    >
                        Disconnect
                    </Button>
                    <ConfirmDialog
                        open={confirming}
                        onOpenChange={setConfirming}
                        title={`Disconnect ${member.name}'s Google Calendar?`}
                        icon={Unplug}
                        confirmLabel="Disconnect"
                        keepLabel="Keep it connected"
                        description="Saroh stops reaching their Google accounts here. Their upcoming bookings stay on their Google Calendar as they are, and nobody is emailed. They can connect again from their own settings."
                        onConfirm={async () => {
                            const res = await disconnectMember(
                                member.membershipId,
                            );
                            if (!res.ok) return { ok: false, error: res.error };
                            showSuccess(res.data.kept.message);
                            router.refresh();
                            return { ok: true };
                        }}
                    />
                </>
            ) : null}
        </div>
    );
}
