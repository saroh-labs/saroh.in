"use client";

import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { ShareLink } from "@saroh/ui/copy-button";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { DoorOpen, RefreshCw, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { MeetAccessChoice } from "@/components/shared/google-meet/meet-access-choice";
import { runAction } from "@/lib/api/run-action";
import { saveBookingMeeting } from "@/lib/google-calendar/actions";
import type { BookingMeeting, MeetAccess } from "@/lib/google-calendar/types";
import {
    appliedNote,
    firstName,
    meetAccessLine,
    meetingSyncLine,
} from "@/lib/google-calendar/words";

/**
 * A booking's Meet (boards GC2Booking, GC2AddMeet, DEC-233): the link with
 * Join online and Share link, who can join (Change), and where its event
 * is in Google. A booking with no link to join offers Add Meet link: a
 * Google Meet of its own, or a link pasted in. Take payment stays the
 * page's one black button, so Join is outlined.
 */
export function MeetCard({
    bookingId,
    link,
    meeting,
    staffName,
    customerName,
    canWrite,
    canAdd,
}: {
    bookingId: string;
    /** What it is joined by now; null for none. */
    link: string | null;
    meeting: BookingMeeting;
    staffName: string | null;
    customerName: string | null;
    canWrite: boolean;
    /** An upcoming one-to-one: a link can be added to it. */
    canAdd: boolean;
}) {
    const [sheet, setSheet] = useState<"add" | "access" | null>(null);
    const url = meeting.meetingUrl ?? link;
    const google = meeting.google !== "NONE" || meeting.googleEvent !== null;
    const meet = meeting.meetingLink === "GOOGLE_MEET" || google;
    const sync = meetingSyncLine(meeting, staffName);
    const applied = appliedNote(meeting);

    if (!url && !(meet && meeting.google === "PENDING")) {
        if (!canWrite || !canAdd) return null;
        return (
            <section className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
                <Video
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                    <p
                        data-ph-unmask=""
                        className="m-0 text-[14px] font-semibold"
                    >
                        No link to join
                    </p>
                    <p
                        data-ph-unmask=""
                        className="m-0 text-[12.5px] text-muted-foreground"
                    >
                        Make it a Google Meet, or paste a link of your own.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSheet("add")}
                >
                    Add Meet link
                </Button>
                <AddLinkSheet
                    open={sheet === "add"}
                    onClose={() => setSheet(null)}
                    bookingId={bookingId}
                    staffName={staffName}
                    customerName={customerName}
                    access={meeting.meetAccess.chosen}
                />
            </section>
        );
    }

    const line = meetAccessLine(meeting.meetAccess.chosen);
    return (
        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                    <p className="m-0 flex items-center gap-2 text-[14px] font-semibold">
                        <Video
                            aria-hidden
                            className="size-4 text-muted-foreground"
                        />
                        {meet ? "Google Meet" : "Online"}
                    </p>
                    <p className="m-0 mt-0.5 break-all font-mono text-[12.5px] text-muted-foreground">
                        {url ?? "Google is making the link…"}
                    </p>
                </div>
                {url ? (
                    <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Join online
                            </a>
                        </Button>
                        {/* To send to the person: the share sheet on a phone. */}
                        <ShareLink
                            value={url}
                            text="Your link to join online"
                        />
                    </div>
                ) : null}
            </div>
            {meet ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
                    <DoorOpen
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    <p className="m-0 min-w-0 flex-1 text-[13px]">
                        <strong className="font-semibold">{line.lead}</strong>
                        {line.rest}
                        {applied ? (
                            <span className="block text-[12.5px] text-muted-foreground">
                                {applied}
                            </span>
                        ) : null}
                    </p>
                    {canWrite ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="underline underline-offset-2"
                            onClick={() => setSheet("access")}
                        >
                            Change
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {sync ? (
                <p className="m-0 flex items-center gap-3 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
                    <RefreshCw aria-hidden className="size-4 shrink-0" />
                    {sync}
                </p>
            ) : null}
            <AccessSheet
                open={sheet === "access"}
                onClose={() => setSheet(null)}
                bookingId={bookingId}
                value={meeting.meetAccess.chosen}
            />
        </section>
    );
}

function useSave(bookingId: string, onDone: () => void) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    async function save(input: Parameters<typeof saveBookingMeeting>[1]) {
        setError(null);
        const res = await runAction(
            () => saveBookingMeeting(bookingId, input),
            {
                setBusy: setPending,
                onUnreached: setError,
                quiet: true,
            },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        onDone();
        router.refresh();
    }
    return { pending, error, save };
}

function Problem({ error }: { error: string | null }) {
    return error ? (
        <p role="alert" className="m-0 text-[13px] text-destructive">
            {error}
        </p>
    ) : null;
}

/** Who can join this booking's Meet: its own choice over the service's. */
function AccessSheet({
    open,
    onClose,
    bookingId,
    value,
}: {
    open: boolean;
    onClose: () => void;
    bookingId: string;
    value: MeetAccess;
}) {
    const [draft, setDraft] = useState(value);
    const { pending, error, save } = useSave(bookingId, onClose);
    return (
        <FormSheet
            open={open}
            bottomOnPhone
            title="Who can join"
            description="For this booking's Meet only. Google applies it straight away."
            pending={pending}
            dirty={draft !== value}
            onClose={onClose}
            onSubmit={() => save({ meetAccess: draft })}
        >
            <MeetAccessChoice
                value={draft}
                onChange={setDraft}
                heading="Who can join"
            />
            <Problem error={error} />
        </FormSheet>
    );
}

/** Add a link to join (board GC2AddMeet): a Meet of its own, or a pasted link. */
function AddLinkSheet({
    open,
    onClose,
    bookingId,
    staffName,
    customerName,
    access,
}: {
    open: boolean;
    onClose: () => void;
    bookingId: string;
    staffName: string | null;
    customerName: string | null;
    access: MeetAccess;
}) {
    const labelId = useId();
    const [kind, setKind] = useState<"GOOGLE_MEET" | "MANUAL">("GOOGLE_MEET");
    const [url, setUrl] = useState("");
    const [who, setWho] = useState<MeetAccess>(access);
    const { pending, error, save } = useSave(bookingId, onClose);
    const whose = staffName ? `${firstName(staffName)}'s` : "their";
    const them = customerName ? firstName(customerName) : "the customer";
    return (
        <FormSheet
            open={open}
            title="Add a link to join"
            description="The customer joins this booking by it."
            pending={pending}
            saveLabel="Add link"
            savingLabel="Adding…"
            onClose={onClose}
            onSubmit={() =>
                save(
                    kind === "GOOGLE_MEET"
                        ? { meetingLink: "GOOGLE_MEET", meetAccess: who }
                        : { meetingLink: "MANUAL", meetingUrl: url.trim() },
                )
            }
            fieldsClassName="gap-5"
        >
            <div className="grid gap-2">
                <p
                    data-ph-unmask=""
                    id={labelId}
                    className="m-0 text-[13.5px] font-semibold"
                >
                    Link
                </p>
                <RadioCards
                    labelledBy={labelId}
                    value={kind}
                    onChange={setKind}
                    options={[
                        {
                            value: "GOOGLE_MEET",
                            label: "Make a Google Meet link",
                            note: `On ${whose} Google Calendar. Google emails ${them} the updated invite.`,
                        },
                        {
                            value: "MANUAL",
                            label: "Paste a link",
                            note: "Zoom, Teams or a Meet room you already have.",
                        },
                    ]}
                />
            </div>
            <Field
                label="Your link"
                hint={
                    kind === "MANUAL"
                        ? undefined
                        : "Pick Paste a link to type one."
                }
            >
                <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://zoom.us/j/…"
                    maxLength={500}
                    disabled={kind !== "MANUAL"}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                />
            </Field>
            {kind === "GOOGLE_MEET" ? (
                <MeetAccessChoice
                    value={who}
                    onChange={setWho}
                    notes={false}
                    hint={null}
                />
            ) : null}
            <Problem error={error} />
        </FormSheet>
    );
}
