"use client";

import { RadioCards } from "@saroh/ui/choice-group";
import { useId } from "react";

import type { MeetAccess } from "@/lib/google-calendar/types";
import { MEET_ACCESS } from "@/lib/google-calendar/types";
import { MEET_ACCESS_WORDS } from "@/lib/google-calendar/words";

/**
 * "Who can join" a Google Meet (DEC-233): the business's default in
 * Settings, a service's in its Where sheet, one booking's on its page. The
 * same three rows and words everywhere; `notes` off for a short sheet.
 */
export function MeetAccessChoice({
    value,
    onChange,
    notes = true,
    heading = "Who can join",
    hint = "Recording, chat and the rest follow your own Google Meet settings.",
}: {
    value: MeetAccess;
    onChange: (value: MeetAccess) => void;
    notes?: boolean;
    heading?: string;
    hint?: string | null;
}) {
    const id = useId();
    return (
        <div className="grid gap-2">
            <p
                id={id}
                data-ph-unmask=""
                className="m-0 text-[13.5px] font-semibold"
            >
                {heading}
            </p>
            <RadioCards
                labelledBy={id}
                value={value}
                onChange={onChange}
                options={MEET_ACCESS.map((v) => ({
                    value: v,
                    label: MEET_ACCESS_WORDS[v].label,
                    note: notes ? MEET_ACCESS_WORDS[v].note : undefined,
                }))}
            />
            {hint ? (
                <p className="m-0 text-[12.5px] text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
