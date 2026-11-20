"use client";

import type { ConfirmResult } from "@saroh/ui/confirm-dialog";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { CircleCheck, Unplug } from "lucide-react";

/**
 * Disconnect one Google account (board GC2Disconnect, DEC-233): what stops
 * and what stays, then the way back. Its events stay in Google as they
 * are, so nobody is emailed; connecting the same account again picks them
 * back up with the same Meet links.
 */
export function DisconnectDialog({
    email,
    open,
    onOpenChange,
    onConfirm,
}: {
    email: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<ConfirmResult>;
}) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Disconnect ${email}?`}
            icon={Unplug}
            confirmLabel="Disconnect"
            busyLabel="Disconnecting…"
            keepLabel="Cancel"
            onConfirm={onConfirm}
            description={
                <span className="grid gap-4">
                    <span className="grid gap-4 sm:grid-cols-2">
                        <Column
                            title="Stops"
                            icon={
                                <Unplug className="size-3.5 text-destructive" />
                            }
                            items={[
                                `Saroh’s access to ${email}`,
                                "Its events blocking your times",
                                "Updates to your bookings’ events there",
                            ]}
                        />
                        <Column
                            title="Stays"
                            icon={
                                <CircleCheck className="size-3.5 text-success" />
                            }
                            items={[
                                "Every booking in Saroh, with its customer and Meet link",
                                "Your upcoming bookings on Google Calendar, as they are now: nobody is emailed",
                                "Where bookings go, ready if you connect again",
                            ]}
                        />
                    </span>
                    <span className="block border-t border-border pt-3">
                        <strong data-ph-unmask="" className="font-semibold">
                            Connect it again later
                        </strong>{" "}
                        and Saroh picks those bookings back up, with the same
                        Meet links and no new emails.
                    </span>
                </span>
            }
        />
    );
}

function Column({
    title,
    icon,
    items,
}: {
    title: string;
    icon: React.ReactNode;
    items: string[];
}) {
    return (
        <span className="grid min-w-0 content-start gap-1.5">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <span aria-hidden>{icon}</span>
                {title}
            </span>
            <span role="list" className="grid gap-1 pl-4">
                {items.map((item) => (
                    <span
                        key={item}
                        role="listitem"
                        className="list-item list-disc"
                    >
                        {item}
                    </span>
                ))}
            </span>
        </span>
    );
}
