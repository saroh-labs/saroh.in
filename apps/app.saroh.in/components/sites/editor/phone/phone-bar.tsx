"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowUpFromLine, Brush, Layers, Plus } from "lucide-react";

import { count } from "@/lib/format/plural";

/** The four cells of the phone editor's bar (`fix/WXNHome`). */
export type PhoneBarKey = "sections" | "add" | "brand" | "publish";

const CELLS: { key: PhoneBarKey; label: string; icon: LucideIcon }[] = [
    { key: "sections", label: "Sections", icon: Layers },
    { key: "add", label: "Add", icon: Plus },
    { key: "brand", label: "Brand", icon: Brush },
    { key: "publish", label: "Publish", icon: ArrowUpFromLine },
];

/**
 * The phone editor's one bar (U49, `fix/WXNHome`): Sections · Add · Brand
 * · Publish, four equal cells of a 64px bar, the changes waiting as a
 * count on Publish (the chip's number, KTD-E3). It stays while a
 * section's sheet is open, as the boards draw it.
 */
export function PhoneBar({
    open,
    waiting,
    needsApproval,
    publishing,
    onSelect,
}: {
    /** The cell whose sheet is open, drawn current. */
    open: PhoneBarKey | null;
    waiting: number;
    /** "Publishing needs approval" is on: Publish's sheet says what next. */
    needsApproval: boolean;
    publishing: boolean;
    onSelect: (key: PhoneBarKey) => void;
}) {
    return (
        <nav
            aria-label="Editor"
            data-phone-bar=""
            className="relative z-10 grid h-16 shrink-0 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)]"
        >
            {CELLS.map(({ key, label, icon: Icon }) => {
                const publish = key === "publish";
                return (
                    <button
                        key={key}
                        type="button"
                        aria-current={open === key ? "true" : undefined}
                        aria-label={
                            publish
                                ? [
                                      waiting > 0
                                          ? `Publish: ${count(waiting, "change")} waiting`
                                          : "Publish",
                                      needsApproval ? "needs approval" : null,
                                  ]
                                      .filter(Boolean)
                                      .join(", ")
                                : undefined
                        }
                        disabled={publish && publishing}
                        onClick={() => onSelect(key)}
                        className={cn(
                            "relative flex min-w-0 flex-col items-center justify-center gap-[3px] text-xs font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:text-disabled-foreground",
                            open === key && "font-semibold text-foreground",
                        )}
                    >
                        <Icon aria-hidden className="size-[22px]" />
                        {publish && waiting > 0 ? (
                            <span
                                aria-hidden
                                data-publish-count=""
                                className="absolute left-[calc(50%+6px)] top-[7px] h-[18px] min-w-[18px] rounded-full bg-info px-[5px] text-center text-xs font-semibold leading-[18px] text-info-foreground"
                            >
                                {waiting}
                            </span>
                        ) : null}
                        {label}
                    </button>
                );
            })}
        </nav>
    );
}

/**
 * A reader's bar on a phone (`fix/WXNStates`): Approve and Ask for changes
 * take the bar's place; each opens the review sheet, where the verdict is
 * recorded (with a reason for Ask for changes).
 */
export function ReaderBar({ onReview }: { onReview: () => void }) {
    return (
        <div
            data-reader-bar=""
            className="flex shrink-0 gap-2 border-t bg-background px-4 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2"
        >
            <Button
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                className="h-12 min-w-0 flex-1"
                onClick={onReview}
            >
                Ask for changes
            </Button>
            <Button
                type="button"
                aria-haspopup="dialog"
                className="h-12 min-w-0 flex-1"
                onClick={onReview}
            >
                Approve
            </Button>
        </div>
    );
}
