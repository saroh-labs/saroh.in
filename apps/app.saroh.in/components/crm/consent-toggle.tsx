"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { setConsent } from "@/lib/messages/actions";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import { CHANNEL_LABEL, MESSAGE_CHANNELS } from "@/lib/messages/constants";

/**
 * Consent / unsubscribe control for a lead's contact (S6-002). One row per
 * channel showing the contact's current opt state (GRANTED / REVOKED / no record
 * = allowed), with a button to flip it via the `setConsent` server action
 * (`consent:write`). Revoking a channel makes the composer warn and the send
 * gate SUPPRESS — this is the honoured unsubscribe. Refreshes on success so the
 * composer + this control stay in sync.
 */
export function ConsentToggle({
    contactId,
    consent,
    canWrite = true,
}: {
    /** `consent:write`: may grant or revoke. Without it each row only reads. */
    canWrite?: boolean;
    contactId: string;
    /** Current consent status per channel; absent = no record (allowed). */
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<MessageChannel | null>(null);

    async function toggle(channel: MessageChannel, next: ConsentStatus) {
        const res = await runAction(
            () => setConsent({ contactId, channel, status: next }),
            { setBusy: (on) => setBusy(on ? channel : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            next === "GRANTED"
                ? `${CHANNEL_LABEL[channel]} consent granted`
                : `${CHANNEL_LABEL[channel]} consent revoked`,
        );
        router.refresh();
    }

    return (
        <ul className="grid gap-2">
            {MESSAGE_CHANNELS.map((channel, index) => {
                const status = consent[channel];
                const revoked = status === "REVOKED";
                const next: ConsentStatus = revoked ? "GRANTED" : "REVOKED";
                return (
                    <li
                        key={channel}
                        style={{ "--wk-i": index } as React.CSSProperties}
                        className="wk-item flex items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                                {CHANNEL_LABEL[channel]}
                            </span>
                            <Badge
                                variant={revoked ? "destructive" : "secondary"}
                            >
                                {status ?? "No record"}
                            </Badge>
                        </div>
                        {canWrite ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="wk-press"
                                disabled={busy === channel}
                                onClick={() => toggle(channel, next)}
                            >
                                {busy === channel
                                    ? "Saving…"
                                    : revoked
                                      ? "Grant"
                                      : "Revoke"}
                            </Button>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}
