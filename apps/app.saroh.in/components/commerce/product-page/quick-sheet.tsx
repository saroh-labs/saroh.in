"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * A quick edit over the product page: one section's fields, saved on their
 * own. Cancel discards at once; closing any other way — the X, the backdrop,
 * Escape — asks first when something changed, because those are the easy
 * ones to do by accident. "More in the full editor" opens the same section
 * with everything else around it.
 */
export function QuickSheet({
    open,
    onOpenChange,
    productName,
    title,
    fullEditorHref,
    dirty,
    saving,
    note,
    onSave,
    saveDisabled,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productName: string;
    title: string;
    fullEditorHref: string;
    dirty: boolean;
    saving: boolean;
    /** Why Save is off, or what saving will do — written, never a tooltip. */
    note?: ReactNode;
    onSave: () => void;
    saveDisabled?: boolean;
    children: ReactNode;
}) {
    const [confirming, setConfirming] = useState(false);

    function requestClose(next: boolean) {
        if (next) return onOpenChange(true);
        if (saving) return;
        if (dirty) {
            setConfirming(true);
            return;
        }
        onOpenChange(false);
    }

    return (
        <Sheet open={open} onOpenChange={requestClose}>
            <SheetContent
                className="flex w-full flex-col gap-0 p-0 focus:outline-none sm:max-w-[460px]"
                // Focus lands on the sheet, not its first control, so
                // nothing opens already ringed; Tab moves in from there.
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                <SheetHeader className="space-y-0 border-b border-border py-3.5 pl-[18px] pr-14 text-left">
                    <p className="text-[11.5px] text-muted-foreground">
                        {productName}
                    </p>
                    <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                        {title}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                        Changes here save on their own when you press Save.
                    </SheetDescription>
                </SheetHeader>
                <form
                    className="flex min-h-0 flex-1 flex-col"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSave();
                    }}
                >
                    <div
                        className={cn(
                            "min-h-0 flex-1 overflow-y-auto px-[18px] pb-5 pt-4",
                            // The sheet's own scale, a step under a page form:
                            // 12.5px labels, 11.5px help, 36px fields.
                            "[&_label]:text-[12.5px] [&_label]:font-medium [&_legend]:text-[12.5px] [&_legend]:font-medium",
                            "[&_[id$=-form-item-description]]:text-[11.5px] [&_[id$=-form-item-description]]:leading-[1.5]",
                            "[&_button[role=combobox]]:h-9 [&_button[role=combobox]]:rounded-[8px] [&_button[role=combobox]]:text-[13px] [&_input:not([type=checkbox]):not([type=radio])]:h-9 [&_input]:rounded-[8px] [&_input]:text-[13px] [&_textarea]:rounded-[8px] [&_textarea]:text-[13px] [&_textarea]:leading-[1.55]",
                        )}
                    >
                        {children}
                    </div>
                    {confirming ? (
                        <div
                            role="alert"
                            className="flex flex-wrap items-center gap-2 border-t border-border bg-brand-subtle px-[18px] py-2.5 text-[12.5px] text-brand-subtle-foreground"
                        >
                            <span className="flex-[1_1_180px]">
                                You have changes that are not saved.
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold text-destructive hover:text-destructive"
                                onClick={() => {
                                    setConfirming(false);
                                    onOpenChange(false);
                                }}
                            >
                                Discard
                            </Button>
                            <Button
                                type="button"
                                className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold"
                                onClick={() => setConfirming(false)}
                            >
                                Keep editing
                            </Button>
                        </div>
                    ) : null}
                    <SheetFooter className="flex flex-row flex-wrap items-center gap-2 border-t border-border px-[18px] py-3 sm:justify-start sm:space-x-0">
                        <Link
                            href={fullEditorHref}
                            className="flex-[1_1_150px] text-[12.5px] text-brand hover:text-foreground"
                        >
                            More in the full editor
                        </Link>
                        {note ? (
                            <span
                                role="status"
                                className="text-[12px] text-muted-foreground"
                            >
                                {note}
                            </span>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            className="h-[34px] rounded-[9px] px-3 text-[12.5px] font-semibold"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="h-[34px] rounded-[9px] px-3.5 text-[12.5px] font-semibold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                            disabled={
                                saving || (saveDisabled ?? false) || !dirty
                            }
                        >
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
