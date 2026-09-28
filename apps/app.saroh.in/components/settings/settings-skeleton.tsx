import { Skeleton } from "@saroh/ui/skeleton";

import { SettingsPanel } from "@/components/settings/settings-panel";

/**
 * A settings tab while it loads, inside the same panel the tab renders into,
 * so nothing jumps when it lands (F12). The tabs beside it are the layout's
 * and stay put.
 *
 * - `team`: the design's loading table — a header strip, then rows of an
 *   avatar, a name over an email, and two short cells.
 * - `profile`: Your profile's two cards — your login, and the alerts grid.
 */
export function SettingsSkeleton({ variant }: { variant: "team" | "profile" }) {
    return (
        <SettingsPanel
            header={
                <div aria-hidden className="space-y-2">
                    <Skeleton className="h-[26px] w-40" />
                    {variant === "team" ? (
                        <div className="flex gap-2 border-b border-border pb-2 pt-2">
                            <Skeleton className="h-5 w-16" />
                            <Skeleton className="h-5 w-16" />
                        </div>
                    ) : null}
                </div>
            }
        >
            <div aria-busy="true" aria-live="polite">
                <span className="sr-only">
                    {variant === "team"
                        ? "Loading the team"
                        : "Loading your profile"}
                </span>
                {variant === "team" ? <TeamRows /> : <ProfileCards />}
            </div>
        </SettingsPanel>
    );
}

function TeamRows() {
    return (
        <div
            aria-hidden
            className="overflow-hidden rounded-xl border border-border"
        >
            <div className="h-[38px] border-b border-border bg-muted/60" />
            {Array.from({ length: 5 }, (_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-b-0"
                >
                    <Skeleton className="size-[30px] shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <Skeleton className="h-2.5 w-[38%] rounded" />
                        <div className="mt-1.5 h-2.5 w-[26%] rounded bg-muted/70" />
                    </div>
                    <div className="hidden h-2.5 w-[84px] rounded bg-muted/70 sm:block" />
                    <div className="h-2.5 w-[60px] rounded bg-muted/70" />
                </div>
            ))}
        </div>
    );
}

function ProfileCards() {
    return (
        <div aria-hidden className="grid max-w-[760px] gap-4">
            <div className="overflow-hidden rounded-xl border border-border">
                {[0, 1].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-4 border-b border-border/70 px-[18px] py-3 last:border-b-0"
                    >
                        <Skeleton className="h-3 w-24 rounded" />
                        <div className="h-3 w-[40%] rounded bg-muted/70" />
                    </div>
                ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
                <div className="border-b border-border/70 px-[18px] py-3">
                    <Skeleton className="h-4 w-20 rounded" />
                </div>
                {Array.from({ length: 4 }, (_, i) => (
                    <div
                        key={i}
                        className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center border-t border-border/70 px-[18px] py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)]"
                    >
                        <Skeleton className="h-3 w-[45%] rounded" />
                        {[0, 1, 2].map((j) => (
                            <div
                                key={j}
                                className="mx-auto size-4 rounded bg-muted/70"
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
