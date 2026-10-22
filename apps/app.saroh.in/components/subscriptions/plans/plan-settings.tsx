"use client";

import { Button } from "@saroh/ui/button";
import { showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Row, Section } from "@/components/shared/page/settings-rows";
import {
    setAutopayChargeTiming,
    setMembersCanPause,
} from "@/lib/subscriptions/actions";
import type { AutopayChargeTiming } from "@/lib/subscriptions/autopay-timing";
import {
    PAUSE_LABEL,
    pauseSaved,
    pauseSentence,
    PLAN_SETTINGS_TITLE,
    SETTINGS_READ_ONLY,
    TIMING_LABEL,
    TIMING_SAVED,
    timingSentence,
} from "@/lib/subscriptions/plan-settings";
import type { SubscriptionSettings } from "@/lib/subscriptions/service";

import { AutopayTimingSheet } from "./autopay-timing-sheet";
import { MembersPauseSheet } from "./members-pause-sheet";

type Key = "pause" | "timing";

const editId = (key: Key) => `plan-setting-${key}`;

/**
 * "Settings for every plan", under the Plans list (Subscriptions audit, 12
 * Oct 2026; two cards above the list before): what is set once for the
 * whole business, read first. Each is a row with its label, what is saved
 * in a sentence, and Edit, which opens that setting's sheet. A save says
 * so in a toast with Undo, and the row reads it at once.
 *
 * - "Members can pause from their account" (A8) shows once customers have
 *   an account on the site (`accountArea`).
 * - "When autopay charges" (D13B) shows only when autopay can charge for
 *   this business (`available`), and needs the server's `now` for its
 *   worked examples.
 *
 * Unread settings draw nothing, as before. Someone who can't change
 * subscriptions reads the rows, with no Edit and a line saying who can.
 */
export function PlanSettings({
    settings,
    canWrite,
    nowIso,
}: {
    settings: SubscriptionSettings | null;
    canWrite: boolean;
    nowIso?: string;
}) {
    const router = useRouter();
    // What was last saved here, so a row reads a save at once; the page's
    // own read takes over when it arrives.
    const [shown, setShown] = useState(settings);
    const [seen, setSeen] = useState(settings);
    if (settings !== seen) {
        setSeen(settings);
        setShown(settings);
    }
    // One sheet at a time; `opened` makes each opening a fresh draft, and
    // the sheet is kept while it slides shut.
    const [editing, setEditing] = useState<{
        key: Key;
        open: boolean;
        opened: number;
    } | null>(null);

    const pause = shown?.accountArea ? shown.membersCanPause : null;
    const autopay = shown?.autopay?.available && nowIso ? shown.autopay : null;
    if (!shown || (pause === null && !autopay)) return null;

    const edit = (key: Key, title: string) =>
        canWrite ? (
            <Button
                id={editId(key)}
                type="button"
                size="sm"
                variant="outline"
                aria-haspopup="dialog"
                aria-label={`Edit: ${title}`}
                onClick={() =>
                    setEditing((e) => ({
                        key,
                        open: true,
                        opened: (e?.opened ?? 0) + 1,
                    }))
                }
            >
                Edit
            </Button>
        ) : null;
    const close = () => setEditing((e) => (e ? { ...e, open: false } : e));

    function pauseChanged(on: boolean) {
        setShown((s) => (s ? { ...s, membersCanPause: on } : s));
        router.refresh();
        showUndo(pauseSaved(on), async () => {
            const res = await setMembersCanPause(!on);
            if (!res.ok) return res;
            setShown((s) => (s ? { ...s, membersCanPause: !on } : s));
            router.refresh();
            return { ok: true };
        });
    }

    function timingSaved(
        before: AutopayChargeTiming,
        next: AutopayChargeTiming,
    ) {
        const put = (chargeTiming: AutopayChargeTiming) =>
            setShown((s) =>
                s?.autopay
                    ? { ...s, autopay: { ...s.autopay, chargeTiming } }
                    : s,
            );
        put(next);
        router.refresh();
        showUndo(TIMING_SAVED, async () => {
            const res = await setAutopayChargeTiming(before);
            if (!res.ok) return res;
            put(before);
            router.refresh();
            return { ok: true };
        });
    }

    return (
        <section
            aria-labelledby="plan-settings"
            className="mt-8 grid min-w-0 gap-2"
        >
            <div className="grid gap-0.5">
                <h2
                    id="plan-settings"
                    className="font-display text-[15px] font-semibold tracking-[-0.02em]"
                >
                    {PLAN_SETTINGS_TITLE}
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                    {canWrite
                        ? "Set once for the whole business. Each one saves on its own."
                        : SETTINGS_READ_ONLY}
                </p>
            </div>
            <Section>
                {pause !== null ? (
                    <Row
                        label={PAUSE_LABEL}
                        action={edit("pause", PAUSE_LABEL)}
                    >
                        <span
                            data-setting="pause"
                            className="block text-pretty"
                        >
                            {pauseSentence(pause)}
                        </span>
                    </Row>
                ) : null}
                {autopay ? (
                    <Row
                        label={TIMING_LABEL}
                        action={edit("timing", TIMING_LABEL)}
                    >
                        <span
                            data-setting="timing"
                            className="block text-pretty"
                        >
                            {timingSentence(autopay.chargeTiming)}
                        </span>
                    </Row>
                ) : null}
            </Section>
            {canWrite && editing?.key === "pause" && pause !== null ? (
                <MembersPauseSheet
                    key={editing.opened}
                    on={pause}
                    open={editing.open}
                    returnTo={editId("pause")}
                    onClose={close}
                    onChanged={pauseChanged}
                />
            ) : null}
            {canWrite && editing?.key === "timing" && autopay && nowIso ? (
                <AutopayTimingSheet
                    key={editing.opened}
                    settings={autopay}
                    saved={autopay.chargeTiming}
                    nowIso={nowIso}
                    open={editing.open}
                    returnTo={editId("timing")}
                    onClose={close}
                    onSaved={(next) => timingSaved(autopay.chargeTiming, next)}
                />
            ) : null}
        </section>
    );
}
