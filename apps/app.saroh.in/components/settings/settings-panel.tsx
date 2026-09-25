import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";

/**
 * One settings tab's page, beside the tabs ("Saroh Settings" design).
 *
 * "Settings" heads the tab column, so a tab's own name is the panel's
 * heading: an h2 at 22px on the display face, its line of description under
 * it, its main action on the heading's line, and — for someone who may only
 * look — a note saying who can change it.
 */
export function SettingsPanelHeader({
    title,
    description,
    actions,
    readOnlyNote,
}: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    /** For someone who may look but not change: who can. */
    readOnlyNote?: string;
}) {
    return (
        <div>
            <div className="mb-1 flex flex-wrap items-center gap-3.5">
                <h2 className="font-display text-[22px] font-semibold leading-[1.1] tracking-[-0.025em]">
                    {title}
                </h2>
                {actions ? (
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {actions}
                    </div>
                ) : null}
            </div>
            {description ? (
                <p className="max-w-[64ch] text-pretty text-[13px] leading-normal text-muted-foreground">
                    {description}
                </p>
            ) : null}
            {readOnlyNote ? (
                <p
                    role="note"
                    className="mt-2 flex items-center gap-2 text-[12.5px] text-foreground/80"
                >
                    <Lock aria-hidden className="size-3.5 shrink-0" />
                    {readOnlyNote}
                </p>
            ) : null}
        </div>
    );
}

/**
 * The panel itself: the page's `<main>` (the layout draws the tabs beside
 * it), padded 20px 26px as the design's panel is. `width` keeps
 * each page at the measure it had on its own — a form stays form-wide.
 */
export function SettingsPanel({
    width = "full",
    header,
    children,
}: {
    width?: "form" | "default" | "full";
    header?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <main className="w-full space-y-4 px-4 pb-[26px] pt-5 sm:px-[26px]">
            {header}
            <div
                className={cn(
                    "space-y-6",
                    width === "form" && "max-w-2xl",
                    width === "default" && "max-w-5xl",
                )}
            >
                {children}
            </div>
        </main>
    );
}
