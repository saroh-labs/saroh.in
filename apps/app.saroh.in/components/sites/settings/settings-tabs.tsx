"use client";

import { useEffect, useState } from "react";

import { SettingsTabStrip } from "@/components/shared/settings-tab-strip";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type {
    SettingsGroupId,
    ShareStep,
    ShareStepKey,
} from "@/lib/sites/settings-page";
import { groupOfStep, SETTINGS_TAB_PARAM } from "@/lib/sites/settings-page";

import { ShareChecklist } from "./share-checklist";

/**
 * The site's Settings tab, in tabs as Settings › Business is (owner,
 * 9 Oct): "Before you share your site" above them on every tab, the
 * groups as tabs (Shop and Advanced only when they hold something), one
 * open at a time, and the publish bar at the foot.
 *
 * The open tab is in the address (`?section=…`, as Business), pushed per
 * tab so a link opens it and Back and Forward step between them. Every
 * panel stays mounted and only the open one shows, so a row half-edited
 * on one tab is still there on coming back.
 *
 * A checklist step switches to its tab, opens its row where the reader
 * may change it (`onJump`), and brings the row into view with focus on
 * its field, or on the row itself.
 */
export function SettingsTabs({
    groups,
    panels,
    steps,
    live,
    canEdit,
    onJump,
    footer,
}: {
    groups: readonly { id: SettingsGroupId; label: string }[];
    panels: Partial<Record<SettingsGroupId, React.ReactNode>>;
    steps: readonly ShareStep[];
    live: boolean;
    canEdit: boolean;
    /** Opens the step's row for editing. */
    onJump?: (key: ShareStepKey) => void;
    /** The publish bar. */
    footer?: React.ReactNode;
}) {
    const ids = groups.map((g) => g.id);
    const [tab, setTab] = useTabParam(SETTINGS_TAB_PARAM, ids, ids[0], {
        history: "push",
    });
    const [focusOn, setFocusOn] = useState<string | null>(null);

    // After the tab has switched and the row opened: into view, and focus.
    useEffect(() => {
        if (!focusOn) return;
        const frame = requestAnimationFrame(() => {
            const row = document.getElementById(focusOn);
            setFocusOn(null);
            if (!row) return;
            row.scrollIntoView({ block: "center" });
            const field = row.querySelector<HTMLElement>(
                "input, textarea, [contenteditable='true']",
            );
            if (field) field.focus();
            else {
                row.tabIndex = -1;
                row.focus();
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [focusOn]);

    function jump(step: ShareStep) {
        setTab(groupOfStep(step.key));
        onJump?.(step.key);
        setFocusOn(step.anchor);
    }

    return (
        <div className="max-w-2xl space-y-6">
            <ShareChecklist
                steps={steps}
                live={live}
                canEdit={canEdit}
                onJump={jump}
            />
            <div>
                <SettingsTabStrip
                    label="Website settings"
                    idPrefix="settings-tab"
                    current={tab}
                    onChange={setTab}
                    className="mb-5"
                    tabs={groups.map((g) => ({
                        key: g.id,
                        label: g.label,
                        controls: `settings-panel-${g.id}`,
                    }))}
                />
                {groups.map((g) => (
                    <div
                        key={g.id}
                        id={`settings-panel-${g.id}`}
                        role="tabpanel"
                        aria-labelledby={`settings-tab-${g.id}`}
                        hidden={g.id !== tab}
                        // The tabpanel is focusable, as the ARIA pattern
                        // asks, so a keyboard reaches a panel with no field.
                        tabIndex={0}
                        className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
                    >
                        {panels[g.id]}
                    </div>
                ))}
            </div>
            {footer}
        </div>
    );
}
