"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { CrmResult } from "@/lib/api/http";

/**
 * A record's "…" menu with one thing in it: delete, for good.
 *
 * Tucked behind the menu rather than on a button of its own, as the order
 * page does with Cancel: it is the rarest thing anyone does on the page and
 * the only one that cannot be taken back. Because it cannot, it asks first
 * (CRUD Flows: confirm only when undo is impossible), and the question names
 * what goes with it and what stays.
 *
 * On success it says what happened and leaves for the list, since the page it
 * was on no longer has anything to show.
 */
export function DeleteMenu<T>({
    name,
    verb,
    title,
    description,
    onDelete,
    done,
    then,
    unavailable,
}: {
    /** The record, for the menu's label: "More actions for Priya Raman". */
    name: string;
    /** Verb plus noun, on the menu item and the button: "Delete lead". */
    verb: string;
    title: string;
    /** What goes, what stays, and "This cannot be undone." */
    description: string;
    onDelete: () => Promise<CrmResult<T>>;
    /** The toast, given what the API returned. */
    done: (data: T) => string;
    /** Where to go afterwards. */
    then: string;
    /**
     * Why it cannot be deleted, when it cannot. The item stays in the menu,
     * disabled, with the reason under it — a missing option explains nothing.
     */
    unavailable?: string;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    async function commit() {
        setBusy(true);
        const res = await onDelete();
        if (!res.ok) {
            setBusy(false);
            showError(res.error);
            return;
        }
        showSuccess(done(res.data));
        router.push(then);
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        disabled={busy}
                        aria-label={`More actions for ${name}`}
                    >
                        <MoreHorizontal className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    {unavailable ? (
                        <DropdownMenuItem
                            disabled
                            className="flex-col items-start gap-0.5"
                        >
                            <span>{verb}</span>
                            <span className="text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                                {unavailable}
                            </span>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setAsking(true)}
                        >
                            {verb}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                title={title}
                description={description}
                confirmLabel={verb}
                cancelLabel="Keep it"
                onConfirm={() => {
                    setAsking(false);
                    void commit();
                }}
            />
        </>
    );
}
