import { cn } from "@saroh/ui/lib/utils";
import { PageContainer } from "@saroh/ui/page-container";
import type { PageHeaderProps } from "@saroh/ui/page-header";
import { PageHeader } from "@saroh/ui/page-header";
import { Lock } from "lucide-react";
import Link from "next/link";

/**
 * One Settings section's title, beside the side list: the page header every
 * other screen draws ("Settings › Team", the name at 30px, its line, its
 * actions), and, for someone who may only look, a note saying who can change
 * it. A section is a page, so its name is the page's one heading.
 */
export function SettingsPanelHeader({
    title,
    parent,
    description,
    count,
    actions,
    readOnlyNote,
    className,
    holdsData = false,
}: {
    title: string;
    /**
     * The section this page is the next screen of ("Settings › Plan and
     * billing › Change plan"): its name, and the way back to it.
     */
    parent?: { label: string; href: string };
    description?: React.ReactNode;
    /**
     * `PageHeader`'s own: say so when the description shows a record's data,
     * and a session recording masks it. A section's name is a menu word.
     */
    holdsData?: PageHeaderProps["holdsData"];
    /** How many the section lists ("4 people"); nothing at zero. */
    count?: React.ReactNode;
    actions?: React.ReactNode;
    /** For someone who may look but not change: who can. */
    readOnlyNote?: string;
    /** The gap under it, where a section puts its tabs straight after. */
    className?: string;
}) {
    return (
        <div className={cn("mb-8", className)}>
            <PageHeader
                className="mb-0"
                breadcrumb={
                    parent
                        ? [
                              "Settings",
                              <Link key="parent" href={parent.href}>
                                  {parent.label}
                              </Link>,
                              title,
                          ]
                        : ["Settings", title]
                }
                holdsData={holdsData}
                title={title}
                count={count}
                description={description}
                actions={actions}
            />
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
 * How wide a Settings section's body runs. One rule for the sections made of
 * rows and cards (`rows`): 760px, growing to 1040px from a 1440px window, as
 * Sell › Location does. A table (Team) or a grid of cards (Share) takes the
 * panel (`full`).
 */
export type SettingsWidth = "rows" | "full";

/** The `rows` measure, for a section that lays its body out itself. */
export const SETTINGS_ROWS = "max-w-[760px] min-[1440px]:max-w-[1040px]";

/**
 * The panel itself: the page's `<main>` (the layout draws the side list
 * beside it), in the page container every screen sits in.
 */
export function SettingsPanel({
    width = "rows",
    header,
    children,
}: {
    width?: SettingsWidth;
    header?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <PageContainer width="full">
            {header}
            <div className={cn("space-y-6", width === "rows" && SETTINGS_ROWS)}>
                {children}
            </div>
        </PageContainer>
    );
}
