"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useId, useRef, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { SettingsSheet } from "@/lib/sites/settings-edit";
import {
    groupOfSheet,
    SETTINGS_ROW_ID,
    settingsSheetFromHash,
} from "@/lib/sites/settings-edit";
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
 * them. Every group stays mounted and only the open one shows. A checklist
 * step opens its group and, where the reader may edit, its row's sheet in
 * place (`onJump`); for a reader who can't, it shows the row and puts
 * focus on it.
 *
 * A link that opens a row's sheet lands on that row's group too: `?edit=`
 * names it before the first paint (`startOn`), and the readiness step's
 * `#sells-from` once the browser has the address (`onArrive`).
 */
export function SettingsSections({
    groups,
    panels,
    steps,
    live,
    canEdit,
    onJump,
    startOn = null,
    onArrive,
    footer,
}: {
    groups: readonly { id: SettingsGroupId; label: string }[];
    panels: Partial<Record<SettingsGroupId, React.ReactNode>>;
    steps: readonly ShareStep[];
    live: boolean;
    canEdit: boolean;
    /** Opens the step's row for editing, in its sheet. */
    onJump?: (key: ShareStepKey) => void;
    /** The group a link's sheet is in (`?edit=`), shown on arrival. */
    startOn?: SettingsGroupId | null;
    /** A link to a row's id asks for its sheet (`#sells-from`). */
    onArrive?: (sheet: SettingsSheet) => void;
    /** The publish bar. */
    footer?: React.ReactNode;
}) {
    const ids = groups.map((g) => g.id);
    const [inAddress, setInAddress] = useTabParam(
        SETTINGS_TAB_PARAM,
        ids,
        ids[0],
        { history: "push" },
    );
    // Where a link landed, until a group is chosen: its sheet's group,
    // whatever `?section=` the link did or didn't carry.
    const [landed, setLanded] = useState<SettingsGroupId | null>(
        startOn && ids.includes(startOn) ? startOn : null,
    );
    const open = landed ?? inAddress;
    const setOpen = (id: SettingsGroupId) => {
        setLanded(null);
        setInAddress(id);
    };
    const [focusOn, setFocusOn] = useState<string | null>(null);
    const selectId = useId();

    // On arrival, once: a link to a row by its id (the readiness step's
    // `#sells-from`) shows the row's group and asks for its sheet, and the
    // address names the group the link landed on, so a reload stays there.
    const arrived = useRef({ ids, landed, onArrive });
    useEffect(() => {
        const { ids, landed, onArrive } = arrived.current;
        const sheet = settingsSheetFromHash(window.location.hash);
        const group = sheet ? groupOfSheet(sheet) : landed;
        if (!group || !ids.includes(group)) return;
        const url = new URL(window.location.href);
        if (group === ids[0]) url.searchParams.delete(SETTINGS_TAB_PARAM);
        else url.searchParams.set(SETTINGS_TAB_PARAM, group);
        if (url.href !== window.location.href) {
            window.history.replaceState(null, "", url);
        }
        if (!sheet) return;
        const frame = requestAnimationFrame(() => {
            setLanded(group);
            if (onArrive) onArrive(sheet);
            else setFocusOn(SETTINGS_ROW_ID[sheet]);
        });
        return () => cancelAnimationFrame(frame);
    }, []);

    // After the group has switched: the row into view, and focus on it.
    useEffect(() => {
        if (!focusOn) return;
        const frame = requestAnimationFrame(() => {
            const row = document.getElementById(focusOn);
            setFocusOn(null);
            if (!row) return;
            row.scrollIntoView({ block: "center" });
            row.tabIndex = -1;
            row.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [focusOn]);

    function jump(step: ShareStep) {
        setOpen(groupOfStep(step.key));
        // The row's sheet opens in place and takes the keyboard; closed,
        // it hands it to the row's Edit. A reader is shown the row.
        if (onJump) onJump(step.key);
        else setFocusOn(step.anchor);
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
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:items-start lg:gap-10 min-[1440px]:grid-cols-[220px_minmax(0,1040px)]">
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
