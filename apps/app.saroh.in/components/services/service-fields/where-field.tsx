"use client";

import { Input } from "@saroh/ui/input";
import { useId } from "react";

import { Eyebrow } from "@/components/bookings/calendar/parts";
import { MeetAccessChoice } from "@/components/shared/google-meet/meet-access-choice";
import type { MeetAccess, MeetSetup } from "@/lib/google-calendar/types";
import { needsMeetingLink, whereNote } from "@/lib/services/editor";
import type { LocationType, MeetingLink } from "@/lib/services/service";

import { HELP } from "@/components/services/service-editor/fields";
import { ChipGroup, RadioCards } from "@saroh/ui/choice-group";
import { Field } from "@saroh/ui/field";

const WHERE: [LocationType, string][] = [
    ["IN_PERSON", "In person"],
    ["ONLINE", "Online"],
    ["EITHER", "Either, they choose"],
];

export type { MeetSetup };

export interface WherePatch {
    where?: LocationType;
    meetingUrl?: string;
    meetingLink?: MeetingLink;
    meetAccess?: MeetAccess | null;
}

/**
 * Where it happens (E2): in person, online, or either — the customer
 * chooses when booking. The link people join by is asked for whenever it
 * can happen online; it is a shared credential, so the help says how to
 * keep a paid session paid.
 *
 * With Google Calendar on for the business (`meet`, board GC2ServiceMeet)
 * the link is a choice: a Google Meet for each booking, made on the
 * calendar of whoever takes it, with who can join; or your own link for
 * everyone. With a Meet, the typed link is only for someone who hasn't
 * connected Google, and may be left empty.
 */
export function WhereField({
    where,
    meetingUrl,
    meetingLink = "MANUAL",
    meetAccess = null,
    meet = null,
    onChange,
    error,
    onLeave,
}: {
    where: LocationType;
    meetingUrl: string;
    meetingLink?: MeetingLink;
    meetAccess?: MeetAccess | null;
    /** Null while Google Calendar isn't on here: the one typed link, as before. */
    meet?: MeetSetup | null;
    onChange: (patch: WherePatch) => void;
    /** What is wrong with the link, once it should be said. */
    error?: string | null;
    onLeave?: () => void;
}) {
    const ids = { label: useId(), link: useId() };
    // A service already on Meet keeps its choice in view if Google goes off.
    const offerMeet = meet !== null || meetingLink === "GOOGLE_MEET";
    const google = offerMeet && meetingLink === "GOOGLE_MEET";
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
            <p className={HELP}>
                {google && where !== "IN_PERSON"
                    ? "Online visits join by a Google Meet link made for each booking."
                    : whereNote(where)}
            </p>
            {needsMeetingLink(where) && offerMeet ? (
                <div className="mt-4 grid gap-2">
                    <p
                        id={ids.link}
                        data-ph-unmask=""
                        className="m-0 text-[13.5px] font-semibold"
                    >
                        Link to join
                    </p>
                    <RadioCards
                        labelledBy={ids.link}
                        value={meetingLink}
                        onChange={(next) => onChange({ meetingLink: next })}
                        options={[
                            {
                                value: "GOOGLE_MEET",
                                label: "A Google Meet link for each booking",
                                note: "Made on the Google Calendar of whoever takes it.",
                            },
                            {
                                value: "MANUAL",
                                label: "Your own link, the same for everyone",
                                note: "Zoom, Teams or a Meet room you keep.",
                            },
                        ]}
                    />
                </div>
            ) : null}
            {needsMeetingLink(where) && google ? (
                <div className="mt-4">
                    <MeetAccessChoice
                        value={
                            meetAccess ?? meet?.businessDefault ?? "RESTRICTED"
                        }
                        onChange={(next) => onChange({ meetAccess: next })}
                    />
                </div>
            ) : null}
            {needsMeetingLink(where) ? (
                <Field
                    label={
                        google
                            ? "If whoever takes it hasn't connected Google"
                            : "Link to join"
                    }
                    className="mt-3"
                    error={error}
                    onBlur={onLeave}
                    hint={
                        google
                            ? "Bookings taken by someone who hasn't connected Google Calendar get this link. Leave it empty and they get none."
                            : "Everyone who books online gets this same link, on their confirmation and on the booking. For a paid session, set a passcode or a waiting room. A new link reaches bookings made after you save."
                    }
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
