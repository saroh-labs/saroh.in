"use client";

import { useEffect, useMemo, useState } from "react";

import { buttonClass } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { todayIso } from "@/lib/tools/dates";
import { useDraft } from "@/lib/tools/draft-store";
import { decodeDraft } from "@/lib/tools/handoff";
import type { Channel, ReminderDraft, Tone } from "@/lib/tools/reminder";
import {
    applyReminderCarry,
    daysOverdue,
    openHref,
    reminderMessage,
} from "@/lib/tools/reminder";

import { CopyButton, DateField, Section } from "./fields";
import type { MomentCopy } from "./signup-moment";
import { NextStepCard, SignupSheet, useSignupMoment } from "./signup-moment";

const SERVER: ReminderDraft = {
    client: "",
    sender: "",
    number: "",
    amount: "",
    wasDue: "",
    payBy: "",
    payLink: "",
    tone: "friendly",
    channel: "email",
};

const TOOL = "payment-reminder";

const TONES: { value: Tone; label: string }[] = [
    { value: "friendly", label: "Friendly" },
    { value: "firm", label: "Firm" },
    { value: "final", label: "Final" },
];

const CHANNELS: { value: Channel; label: string }[] = [
    { value: "email", label: "Email" },
    { value: "whatsapp", label: "WhatsApp" },
];

export function ReminderTool({ copy }: { copy: MomentCopy }) {
    const [d, set, clear] = useDraft<ReminderDraft>(
        "saroh.tech.reminder",
        SERVER,
        () => SERVER,
        TOOL,
    );
    // A template's example, once, then out of the address.
    useEffect(() => {
        const hash = location.hash;
        if (!hash.startsWith("#carry=")) return;
        history.replaceState(null, "", location.pathname);
        set(applyReminderCarry(decodeDraft(hash.slice("#carry=".length))));
    }, [set]);
    // The same on the server and the first paint: nothing here shows until a date is picked.
    const [today] = useState(todayIso);
    const message = useMemo(() => reminderMessage(d, today), [d, today]);
    const late = daysOverdue(d.wasDue, today);
    const moment = useSignupMoment(TOOL);
    const email = d.channel === "email";
    const copied = () =>
        moment.finished(email ? "Reminder copied" : "Message copied");
    return (
        <div className="grid items-start gap-7 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
                <Section
                    title="The invoice"
                    aside={
                        <button
                            type="button"
                            onClick={clear}
                            className="-my-2 min-h-11 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] underline"
                        >
                            Clear
                        </button>
                    }
                >
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            label="Client's first name"
                            value={d.client}
                            onChange={(e) => set({ client: e.target.value })}
                        />
                        <Field
                            label="Your name"
                            value={d.sender}
                            onChange={(e) => set({ sender: e.target.value })}
                        />
                        <Field
                            label="Invoice number"
                            className="[&_input]:font-mono"
                            value={d.number}
                            onChange={(e) => set({ number: e.target.value })}
                        />
                        <Field
                            label="Amount"
                            placeholder="$0.00"
                            className="[&_input]:font-mono"
                            value={d.amount}
                            onChange={(e) => set({ amount: e.target.value })}
                        />
                        <DateField
                            label="Was due"
                            value={d.wasDue}
                            onChange={(wasDue) => set({ wasDue })}
                        />
                        <DateField
                            label="Pay by"
                            value={d.payBy}
                            onChange={(payBy) => set({ payBy })}
                        />
                    </div>
                    <Field
                        label="Payment link"
                        hint="(optional)"
                        type="url"
                        placeholder="https://"
                        value={d.payLink}
                        onChange={(e) => set({ payLink: e.target.value })}
                    />
                    {d.wasDue ? (
                        <span className="text-[13px] text-muted-foreground">
                            {late > 0
                                ? `${late} day${late === 1 ? "" : "s"} overdue`
                                : "Not overdue yet"}
                        </span>
                    ) : null}
                </Section>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Tone</span>
                    <SegmentedControl
                        legend="Tone"
                        value={d.tone}
                        options={TONES}
                        onChange={(tone) => set({ tone })}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Send by</span>
                    <SegmentedControl
                        legend="Channel"
                        value={d.channel}
                        options={CHANNELS}
                        onChange={(channel) => set({ channel })}
                    />
                </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3.5">
                <section
                    aria-live="polite"
                    aria-label="Your message"
                    className="flex flex-col gap-3 rounded-mk-card border border-foreground bg-card p-4 text-[15.5px] leading-normal md:p-6"
                >
                    {email ? (
                        <div>
                            <span className="text-[13px] text-muted-foreground">
                                Subject
                            </span>
                            <br />
                            <b>{message.subject}</b>
                        </div>
                    ) : null}
                    <div className="whitespace-pre-line [overflow-wrap:anywhere]">
                        {message.body}
                    </div>
                </section>
                <div className="grid grid-cols-[1fr_1.6fr] gap-2">
                    <CopyButton
                        label="Copy"
                        className="!h-[52px]"
                        text={
                            email
                                ? `${message.subject}\n\n${message.body}`
                                : message.body
                        }
                        onCopied={copied}
                    />
                    <a
                        href={openHref(d.channel, message)}
                        target={email ? undefined : "_blank"}
                        rel={email ? undefined : "noreferrer"}
                        onClick={copied}
                        className={buttonClass("primary")}
                    >
                        {email ? "Open in my email" : "Open WhatsApp"}
                    </a>
                </div>
                <span className="text-[13px] text-muted-foreground">
                    Opens your own app with the message filled in. You tap send.
                </span>
                <NextStepCard copy={copy} tool={TOOL} done={moment.done} />
            </div>
            <SignupSheet
                copy={copy}
                tool={TOOL}
                done={moment.sheet}
                onClose={moment.closeSheet}
            />
        </div>
    );
}
