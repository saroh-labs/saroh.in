"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Segmented } from "@saroh/ui/segmented";
import { useEffect, useId, useState, useTransition } from "react";

import {
    moveLeadStageAction,
    wonCandidatesAction,
} from "@/lib/saroh-lead-actions";
import type { LeadCard, LeadStage } from "@/lib/saroh-lead-words";
import {
    LEAD_STAGES,
    STAGE_LABEL,
    stageMoveProblem,
} from "@/lib/saroh-lead-words";

const SELECT =
    "h-9 w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The lead sheet's Stage control (DEC-169, R33): the stages as one radio
 * group (one tab stop; arrows, Home and End pick), then the one button that
 * moves it. Won asks which business the lead became, from those signed up
 * with its email (anyone else's isn't offered to an Account manager); Lost
 * asks why. Picking a stage writes nothing until the button is pressed.
 */
export function LeadStageControl({
    leadId,
    stage,
    allScope,
    onMoved,
}: {
    leadId: string;
    stage: LeadStage;
    /** Staff with every lead in scope may name any business by its id. */
    allScope: boolean;
    onMoved: (card: LeadCard) => void;
}) {
    const id = useId();
    const [target, setTarget] = useState<LeadStage>(stage);
    const [organizationId, setOrganizationId] = useState("");
    const [lostReason, setLostReason] = useState("");
    const [candidates, setCandidates] = useState<
        { id: string; name: string }[] | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const [key, setKey] = useState(() => crypto.randomUUID());
    const [pending, startTransition] = useTransition();

    // A new current stage (after a move) is where the control starts again.
    const [seen, setSeen] = useState(stage);
    if (seen !== stage) {
        setSeen(stage);
        setTarget(stage);
    }

    const wantsWon = target === "WON" && stage !== "WON";
    const noCandidates = candidates?.length === 0;
    useEffect(() => {
        if (!wantsWon || candidates !== null) return;
        let live = true;
        void wonCandidatesAction(leadId).then((result) => {
            if (!live) return;
            setCandidates(result.ok ? result.data : []);
            if (result.ok && result.data.length === 1 && result.data[0]) {
                setOrganizationId(result.data[0].id);
            }
        });
        return () => {
            live = false;
        };
    }, [wantsWon, candidates, leadId]);

    function move() {
        const problem = stageMoveProblem({
            from: stage,
            to: target,
            organizationId,
            lostReason,
        });
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        startTransition(async () => {
            const result = await moveLeadStageAction({
                id: leadId,
                stage: target,
                ...(target === "WON" ? { organizationId } : {}),
                ...(target === "LOST" ? { lostReason: lostReason.trim() } : {}),
                idempotencyKey: key,
            });
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setKey(crypto.randomUUID());
            setLostReason("");
            onMoved(result.data);
        });
    }

    return (
        <section aria-labelledby={`${id}-stage`} className="grid gap-2">
            <Label id={`${id}-stage`}>Stage</Label>
            <Segmented
                label="Stage"
                aria-labelledby={`${id}-stage`}
                options={LEAD_STAGES.map((value) => ({
                    value,
                    label: STAGE_LABEL[value],
                }))}
                value={target}
                onValueChange={(next) => {
                    setTarget(next);
                    setError(null);
                }}
            />
            {wantsWon ? (
                <Field
                    label="The business it became"
                    hint={
                        noCandidates
                            ? allScope
                                ? "No business is signed up with this lead's emails. Paste the business's id."
                                : "No business is signed up with this lead's email or sign-up email yet."
                            : "Businesses signed up with this lead's email or sign-up email."
                    }
                >
                    {noCandidates && allScope ? (
                        <Input
                            name="organizationId"
                            value={organizationId}
                            onChange={(e) => setOrganizationId(e.target.value)}
                        />
                    ) : (
                        <select
                            name="organizationId"
                            className={SELECT}
                            value={organizationId}
                            disabled={candidates === null || noCandidates}
                            onChange={(e) => setOrganizationId(e.target.value)}
                        >
                            <option value="">
                                {candidates === null
                                    ? "Finding them…"
                                    : "Pick the business…"}
                            </option>
                            {(candidates ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    )}
                </Field>
            ) : null}
            {target === "LOST" && stage !== "LOST" ? (
                <Field label="Why it was lost">
                    <Input
                        name="lostReason"
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                    />
                </Field>
            ) : null}
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            <div>
                {/* Only once another stage is picked: a greyed "In New"
                    said nothing the picker didn't. */}
                {target !== stage || pending ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        busy={pending}
                        busyLabel="Moving…"
                        onClick={move}
                    >
                        {`Move to ${STAGE_LABEL[target]}`}
                    </Button>
                ) : null}
            </div>
        </section>
    );
}
