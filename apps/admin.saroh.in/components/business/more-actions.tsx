"use client";

import { copyText } from "@saroh/ui/copy-button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { LifecycleStatus } from "@/lib/businesses";

import type { LifecycleChoice } from "./lifecycle-actions";
import {
    LIFECYCLE_LABEL,
    LifecycleDialog,
    lifecycleChoices,
    lifecycleNote,
} from "./lifecycle-actions";

/** The rows whose dialog is destructive, drawn as such in the menu. */
const TAKES_DOWN = new Set<LifecycleChoice>([
    "suspend",
    "place-hold",
    "lift-hold",
    "schedule-deletion",
]);

/**
 * ⋯ More actions in a business's header (admin plan U2, R1): Copy id for
 * everyone, then what this operator may do to the business's state —
 * Suspend…, Schedule deletion… and the rest of the lifecycle — each a row
 * that opens its `OperatorDialog`. A row shows only to an operator who
 * holds its permission (`canLifecycle`, `canLiftHold`); the API refuses
 * regardless. When a legal hold or a deletion leaves less to offer, one
 * line in the menu says why.
 */
export function MoreActions({
    organizationId,
    name,
    status,
    held = false,
    canLifecycle = false,
    canLiftHold = false,
}: {
    organizationId: string;
    name: string;
    status: LifecycleStatus;
    /** On legal hold (DEC-122). */
    held?: boolean;
    /** Holds `organization:lifecycle:write`. */
    canLifecycle?: boolean;
    /** Holds `organization:legal-hold:lift` (a Platform Owner). */
    canLiftHold?: boolean;
}) {
    const [chosen, setChosen] = useState<LifecycleChoice | null>(null);
    const choices = canLifecycle
        ? lifecycleChoices({ status, held, canLiftHold })
        : [];
    const note = canLifecycle ? lifecycleNote({ status, held }) : null;

    async function copyId() {
        if (await copyText(organizationId)) showSuccess("Copied the id");
        else showError("Couldn't copy the id", organizationId);
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label="More actions"
                        icon={<MoreHorizontal className="size-4" />}
                        variant="outline"
                        size="md"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onSelect={() => void copyId()}>
                        Copy id
                    </DropdownMenuItem>
                    {(choices.length > 0 || note) && <DropdownMenuSeparator />}
                    {choices.map((choice) => (
                        <DropdownMenuItem
                            key={choice}
                            onSelect={() => setChosen(choice)}
                            variant={
                                TAKES_DOWN.has(choice)
                                    ? "destructive"
                                    : "default"
                            }
                        >
                            {LIFECYCLE_LABEL[choice]}
                        </DropdownMenuItem>
                    ))}
                    {note && (
                        <DropdownMenuLabel className="text-[12.5px] font-normal leading-snug text-muted-foreground">
                            {note}
                        </DropdownMenuLabel>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {chosen && (
                <LifecycleDialog
                    key={chosen}
                    choice={chosen}
                    organizationId={organizationId}
                    name={name}
                    onOpenChange={(open) => {
                        if (!open) setChosen(null);
                    }}
                />
            )}
        </>
    );
}
