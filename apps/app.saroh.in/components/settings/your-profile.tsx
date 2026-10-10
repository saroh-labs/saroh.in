import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";

import type { AlertPreferencesRead } from "@/lib/notifications/preferences";

import { AlertsGrid } from "./alerts-grid";
import { UsageSharingCard } from "./usage-sharing-card";

/**
 * Settings → Your profile ("Saroh Settings" design): you, and what you hear
 * about. Two cards, 760px at most.
 *
 * "You" reads your Saroh account. Your name, email and password belong to
 * accounts.saroh.in — the same in every business you are in — so each
 * "Change" goes there rather than editing here. The design's "Two-step
 * sign-in" row is left out: Saroh has no two-step sign-in to turn on.
 *
 * "What you hear about" is the design's grid of alerts by channel: your own
 * choices in this business (F14, `alerts-grid.tsx`).
 *
 * "Help improve Saroh" is a third card, not in the design, shown only where
 * session recording is switched on (DEC-125, `usage-sharing-card.tsx`).
 */
export function YourProfile({
    name,
    email,
    accountUrl,
    alerts,
    sharesUsage,
}: {
    name: string;
    email: string;
    /** Your account on accounts.saroh.in. */
    accountUrl: string;
    alerts: AlertPreferencesRead;
    /**
     * "Help improve Saroh" (DEC-125): whether you share how you use the
     * workspace. Undefined where session recording is not switched on (or
     * the choice couldn't be read), and the card is then left out.
     */
    sharesUsage?: boolean;
}) {
    const rows: {
        label: string;
        value: string;
        empty?: string;
        change?: string;
    }[] = [
        { label: "Name", value: name, empty: "Not set", change: "Change" },
        { label: "Email", value: email },
        {
            label: "Password",
            value: "Kept with your Saroh account",
            change: "Change",
        },
    ];

    return (
        <div className="grid max-w-[760px] gap-4">
            <section
                aria-label="You"
                className="overflow-hidden rounded-xl border border-border bg-card"
            >
                <dl>
                    {rows.map((row, i) => (
                        <div
                            key={row.label}
                            className={cn(
                                "grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-[18px] py-[11px]",
                                i > 0 && "border-t border-border/70",
                            )}
                        >
                            <dt className="text-[13px] text-muted-foreground">
                                {row.label}
                            </dt>
                            <dd
                                className={cn(
                                    "text-[13.5px] [overflow-wrap:anywhere]",
                                    !row.value && "text-muted-foreground",
                                )}
                            >
                                {row.value || row.empty}
                            </dd>
                            {/* A `dd` of its own: a `dl` group holds only
                                `dt` and `dd` (axe's definition-list). */}
                            <dd>
                                {row.change ? (
                                    <Button asChild variant="outline" size="sm">
                                        {/* Cross-origin: accounts.saroh.in owns identity. */}
                                        <a
                                            href={accountUrl}
                                            aria-label={`${row.change} your ${row.label.toLowerCase()} on your Saroh account`}
                                        >
                                            {row.change}
                                        </a>
                                    </Button>
                                ) : null}
                            </dd>
                        </div>
                    ))}
                </dl>
                <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[12.5px] text-foreground/80">
                    These are your Saroh account&apos;s, the same in every
                    business you belong to. They&apos;re changed on
                    accounts.saroh.in.
                </p>
            </section>

            <AlertsGrid read={alerts} />

            {sharesUsage === undefined ? null : (
                <UsageSharingCard on={sharesUsage} />
            )}
        </div>
    );
}
