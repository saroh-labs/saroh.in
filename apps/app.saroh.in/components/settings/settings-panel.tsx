import { cn } from "@saroh/ui/lib/utils";

/**
 * One settings tab's page, beside the tabs ("Saroh Settings" design).
 *
 * The screen's title is "Settings", in the band above both columns, so a
 * tab's own name is the panel's heading: an h2 at 22px on the display face,
 * its line of description under it, and its main action on the heading's
 * line.
 */
export function SettingsPanelHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
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
        </div>
    );
}

/**
 * The panel itself: the page's `<main>` (the layout draws the band and the
 * tabs around it), padded 20px 26px as the design's panel is. `width` keeps
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
