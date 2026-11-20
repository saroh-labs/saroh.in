"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useId } from "react";

import { Monogram } from "@/components/providers/connections/provider-row";
import { useConnect } from "@/components/settings/google-calendar/use-connect";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import type { calendarProviderRow } from "@/lib/google-calendar/words";
import { GC_WORDS, GOOGLE_CALENDAR_HREF } from "@/lib/google-calendar/words";

/**
 * Settings › Integrations' "Your calendar" (20 Nov 2026): the person's own
 * Google Calendar as one row in the providers' style. Connect goes
 * straight to Google; Manage opens its page under Providers. It is theirs,
 * not the business's, so it sits in its own group.
 */
export function GoogleCalendarRow({
    row,
}: {
    row: NonNullable<ReturnType<typeof calendarProviderRow>>;
}) {
    const id = useId();
    const { busy, go } = useConnect((error) => showError(error));
    return (
        <section aria-labelledby={id}>
            <h3 data-ph-unmask="" id={id} className="label mb-2">
                Your calendar
            </h3>
            <div
                data-testid="google-calendar-row"
                className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-4 py-[13px] min-[760px]:flex-row min-[760px]:items-center min-[760px]:gap-3 min-[760px]:px-[18px]"
            >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Monogram name={GC_WORDS.title} />
                    <div className="min-w-0 flex-1">
                        <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13.5px] font-semibold">
                                {GC_WORDS.title}
                            </span>
                            {row.pill ? (
                                <StatusBadge tone={row.pill.tone}>
                                    {row.pill.label}
                                </StatusBadge>
                            ) : null}
                        </div>
                        <p className="text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                            {row.note}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-11 min-[760px]:ml-auto min-[760px]:justify-end min-[760px]:pl-0">
                    {row.action === "connect" ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            aria-label={busy ? undefined : GC_WORDS.connect}
                            onClick={() => void go()}
                        >
                            {busy ? GC_WORDS.connecting : "Connect"}
                        </Button>
                    ) : (
                        <Button
                            asChild
                            variant={
                                row.pill?.tone === "warning"
                                    ? "default"
                                    : "outline"
                            }
                            size="sm"
                        >
                            <Link
                                href={GOOGLE_CALENDAR_HREF}
                                aria-label="Manage Google Calendar"
                            >
                                Manage
                            </Link>
                        </Button>
                    )}
                </div>
            </div>
        </section>
    );
}
