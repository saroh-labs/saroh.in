"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { reportError } from "@saroh/ui/lib/report-error";
import { backTo, couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
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
 * Back to Home, on that tab only. The tabs beside it stay, so the rest of
 * Settings is a click away (each tab has its own `error.tsx`).
 *
 * Try again is `retry`, which reads the tab from the server again; `reset`
 * alone would redraw the same failed read. A denial whose status survived
 * the throw is a denial, not a failure (`SectionError`).
 */
export function SettingsSectionError({
    section,
    error,
    retry,
}: {
    section: SettingsSection;
    error: Error & { digest?: string };
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

    if (denied) return <SectionError error={error} retry={retry} />;

    return (
        <SettingsPanel header={<SettingsPanelHeader title={copy.heading} />}>
            <FailedState
                className="max-w-[760px]"
                title={couldntLoad(copy.things)}
                description={nothingChanged(copy.reassurance)}
                onRetry={retry}
                reference={error.digest}
                action={
                    <Button asChild variant="ghost" className="wk-press">
                        <Link href="/">{backTo("Home")}</Link>
                    </Button>
                }
            />
        </SettingsPanel>
    );
}
