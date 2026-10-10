"use client";

import { Input } from "@saroh/ui/input";
import { useId } from "react";

import { Eyebrow } from "@/components/bookings/calendar/parts";
import type { LocationType } from "@/lib/services/service";
import { needsMeetingLink, whereNote } from "@/lib/services/service-editor";

import { ChipGroup } from "@/components/shared/choice-group";
import { Field } from "@saroh/ui/field";
import { HELP } from "./fields";

const WHERE: [LocationType, string][] = [
    ["IN_PERSON", "In person"],
    ["ONLINE", "Online"],
    ["EITHER", "Either, they choose"],
];

/**
 * Where it happens (E2): in person, online, or either — the customer
 * chooses when booking. The link people join by is asked for whenever it
 * can happen online; it is a shared credential, so the help says how to
 * keep a paid session paid.
 */
export function WhereField({
    where,
    meetingUrl,
    onChange,
    error,
    onLeave,
}: {
    where: LocationType;
    meetingUrl: string;
    onChange: (patch: { where?: LocationType; meetingUrl?: string }) => void;
    /** What is wrong with the link, once it should be said. */
    error?: string | null;
    onLeave?: () => void;
}) {
    const ids = { label: useId() };
    return (
        <>
            <Eyebrow id={ids.label} className="mt-3">
                Where
            </Eyebrow>
            <ChipGroup
                labelledBy={ids.label}
                value={where}
                onChange={(next) => onChange({ where: next })}
                choices={WHERE.map(([value, label]) => ({ value, label }))}
            />
            <p className={HELP}>{whereNote(where)}</p>
            {needsMeetingLink(where) ? (
                <Field
                    label="Link to join"
                    className="mt-3"
                    error={error}
                    onBlur={onLeave}
                    hint="Everyone who books online gets this same link, on their confirmation and on the booking. For a paid session, set a passcode or a waiting room. A new link reaches bookings made after you save."
                >
                    <Input
                        type="url"
                        inputMode="url"
                        placeholder="https://meet.google.com/abc-defg-hij"
                        maxLength={500}
                        value={meetingUrl}
                        onChange={(e) =>
                            onChange({ meetingUrl: e.target.value })
                        }
                    />
                </Field>
            ) : null}
        </>
    );
}
