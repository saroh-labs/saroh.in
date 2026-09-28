"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { reportError } from "@saroh/ui/lib/report-error";
import Link from "next/link";
import { useEffect } from "react";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { SectionError } from "@/components/shared/section-error";
import { isDenial } from "@/lib/api/errors";
import type { SettingsSection } from "@/lib/settings/section-failure";
import { SECTION_FAILURE } from "@/lib/settings/section-failure";

/**
 * One settings tab that couldn't be read ("Saroh Settings" design, F12): its
 * own heading, what couldn't be read and that nothing changed, Try again and
 * Back to Home — on that tab only. The tabs beside it stay, so the rest of
 * Settings is a click away (each tab has its own `error.tsx`).
 *
 * Try again is `retry`, which reads the tab from the server again; `reset`
 * alone would redraw the same failed read. A denial whose status survived
 * the throw is a denial, not a failure (`SectionError`).
 */
export function SettingsSectionError({
    section,
    error,
    reset,
    retry,
}: {
    section: SettingsSection;
    error: Error & { digest?: string };
    reset: () => void;
    retry: () => void;
}) {
    const denied = isDenial(error);
    const copy = SECTION_FAILURE[section];

    useEffect(() => {
        if (!denied) {
            reportError(error, {
                boundary: `app/settings/${section}`,
                digest: error.digest,
            });
        }
    }, [denied, error, section]);

    if (denied) return <SectionError error={error} reset={reset} />;

    return (
        <SettingsPanel header={<SettingsPanelHeader title={copy.heading} />}>
            <FailedState
                className="max-w-[760px]"
                title={copy.title}
                description={copy.body}
                action={
                    <div className="mt-1 flex flex-col items-center gap-3">
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button onClick={retry} className="wk-press">
                                Try again
                            </Button>
                            <Button
                                asChild
                                variant="outline"
                                className="wk-press"
                            >
                                <Link href="/">Back to Home</Link>
                            </Button>
                        </div>
                        {error.digest ? (
                            <p className="font-mono text-xs text-muted-foreground">
                                Reference: {error.digest}
                            </p>
                        ) : null}
                    </div>
                }
            />
        </SettingsPanel>
    );
}
