"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type {
    SettingsGroupId,
    ShareStep,
    ShareStepKey,
} from "@/lib/sites/settings-page";
import { groupOfStep, SETTINGS_TAB_PARAM } from "@/lib/sites/settings-page";

import { ShareChecklist } from "./share-checklist";

/**
 * The site's Settings tab, its groups chosen from a side list (owner,
 * 9 Oct). Under the Website screen's own underline tabs (Pages · Posts ·
 * Settings), a second underline strip read as a second equal level; a
 * list at the side is plainly one level down.
 *
 * - From 1024px: the list on the left (about 200px) and the content on
 *   the right (up to 720px): the checklist at its top, the open group,
 *   the publish bar at its foot. The list is the ARIA tabs pattern,
 *   vertical: Up, Down, Home and End move between groups.
 * - Narrower: the same choice as a "Section" select above the group, so
 *   no second strip of tabs appears anywhere.
 *
 * The open group is in the address (`?section=…`, as Settings › Business),
 * pushed per choice so a link opens it and Back and Forward step between
 * them. Every group stays mounted and only the open one shows, so a row
 * half-edited in one is still there on coming back. A checklist step
 * opens its group, its row (`onJump`, where the reader may edit) and puts
 * focus on its field, or on the row.
 */
export function SettingsSections({
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
    const [open, setOpen] = useTabParam(SETTINGS_TAB_PARAM, ids, ids[0], {
        history: "push",
    });
    const [focusOn, setFocusOn] = useState<string | null>(null);
    const selectId = useId();

    // After the group has switched and the row opened: into view, and focus.
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
        setOpen(groupOfStep(step.key));
        onJump?.(step.key);
        setFocusOn(step.anchor);
    }

    const index = ids.indexOf(open);
    const onKeyDown = (e: React.KeyboardEvent) => {
        const n = ids.length;
        const next =
            e.key === "ArrowDown"
                ? (index + 1) % n
                : e.key === "ArrowUp"
                  ? (index - 1 + n) % n
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? n - 1
                      : null;
        if (next === null) return;
        e.preventDefault();
        setOpen(ids[next]);
        document.getElementById(`settings-tab-${ids[next]}`)?.focus();
    };

    return (
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:items-start lg:gap-10">
            <div
                role="tablist"
                aria-label="Settings sections"
                aria-orientation="vertical"
                onKeyDown={onKeyDown}
                className="sticky top-20 hidden flex-col gap-0.5 lg:flex"
            >
                {groups.map((g) => {
                    const on = g.id === open;
                    return (
                        <button
                            key={g.id}
                            id={`settings-tab-${g.id}`}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            aria-controls={`settings-panel-${g.id}`}
                            tabIndex={on ? 0 : -1}
                            onClick={() => setOpen(g.id)}
                            className={cn(
                                "rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on
                                    ? "bg-muted font-semibold text-foreground"
                                    : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent-active",
                            )}
                        >
                            {g.label}
                        </button>
                    );
                })}
            </div>

            <div className="min-w-0 space-y-6">
                <ShareChecklist
                    steps={steps}
                    live={live}
                    canEdit={canEdit}
                    onJump={jump}
                />

                {/* Below 1024px: the same choice, as a select. */}
                <div className="flex items-center gap-3 lg:hidden">
                    <label
                        htmlFor={selectId}
                        className="shrink-0 text-sm font-medium text-muted-foreground"
                    >
                        Section
                    </label>
                    <OptionSelect
                        id={selectId}
                        value={open}
                        onValueChange={setOpen}
                        options={groups.map((g) => ({
                            value: g.id,
                            label: g.label,
                        }))}
                        className="w-full max-w-xs"
                    />
                </div>

                <div>
                    {groups.map((g) => (
                        <div
                            key={g.id}
                            id={`settings-panel-${g.id}`}
                            role="tabpanel"
                            aria-labelledby={`settings-tab-${g.id}`}
                            hidden={g.id !== open}
                            tabIndex={0}
                            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
                        >
                            {panels[g.id]}
                        </div>
                    ))}
                </div>

                {footer}
            </div>
        </div>
    );
}
