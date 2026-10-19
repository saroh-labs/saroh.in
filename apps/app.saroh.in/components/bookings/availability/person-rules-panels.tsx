"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Textarea } from "@saroh/ui/textarea";
import { Fragment, useState } from "react";

import { RadioCards } from "@/components/shared/choice-group";
import { FailedRead } from "@/components/shared/failed-read";
import { formatDateTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import type { PersonRuleKey } from "@/lib/staff/person-rules";
import {
    businessSentence,
    changedKeys,
    choiceValue,
    ifApproved,
    keptSentence,
    personChoices,
    personRuleRows,
    personSentence,
    ruleLabel,
    SAME,
} from "@/lib/staff/person-rules";
import type { RuleRequest, StaffView } from "@/lib/staff/types";

import { PersonRulesList } from "./booking-rules-card";
import { HoursPanel } from "./hours-panel";
import type { PersonRulesState } from "./use-person-rules";
import { ROW as CHOICE_ROW } from "./whose-hours";

const HELP = "text-pretty text-[12.5px] leading-normal text-muted-foreground";

/** The line under a person's rules: what a change will do, or who can make it. */
function changeHelp(pr: PersonRulesState, person: StaffView): string {
    const name = firstName(person.name);
    if (!pr.canChange(person)) {
        return pr.isOwn(person)
            ? "Your role can't change booking rules. An owner or admin can."
            : person.membership
              ? `Only ${name} or an owner or admin can change these.`
              : "Only an owner or admin can change these.";
    }
    return pr.waits(person)
        ? "An owner or admin approves your change before it applies. Until then your rules stay as they are."
        : "Saves as soon as you pick, with Undo. Bookings already made stay.";
}

/**
 * The sheets of each person's own rules (U20): their rules, one rule's
 * choices, a request to review, and turning one down with a reason. A
 * bottom sheet on a phone and a right-hand panel on a desk (`HoursPanel`).
 */
export function PersonRulesPanels({
    pr,
    timezone,
}: {
    pr: PersonRulesState;
    timezone: string;
}) {
    const { panel } = pr;
    if (!panel) return null;

    if (panel.kind === "list" || panel.kind === "rule") {
        const person = pr.personOf(panel.staffId);
        if (!person || person.id !== pr.subject?.id) return null;
        const name = firstName(person.name);
        const own = pr.ownOf(person);
        const business = pr.business;

        if (panel.kind === "rule" && business && pr.canChange(person)) {
            const key = panel.key;
            const current = own[key];
            return (
                <HoursPanel
                    open
                    onClose={() =>
                        pr.setPanel({ kind: "list", staffId: person.id })
                    }
                    title={ruleLabel(key)}
                    sub={
                        <span data-ph-mask="">
                            {name}&apos;s rule · the business&apos;s is “
                            {businessSentence(key, business)}”
                        </span>
                    }
                >
                    <div className="grid gap-2">
                        <RadioCards
                            label={`${ruleLabel(key)} for ${name}`}
                            value={current === null ? SAME : String(current)}
                            disabled={pr.busy === "pick"}
                            onChange={(v) =>
                                void pr.pick(person, key, choiceValue(v))
                            }
                            rowClassName={CHOICE_ROW}
                            options={personChoices(
                                key,
                                own,
                                business,
                                name,
                            ).map((c) => ({
                                value: c.value,
                                label: (
                                    <span className="text-[14.5px] font-semibold">
                                        {c.label}
                                    </span>
                                ),
                                note: <span data-ph-mask="">{c.note}</span>,
                            }))}
                        />
                        <p className={HELP}>{changeHelp(pr, person)}</p>
                    </div>
                </HoursPanel>
            );
        }

        return (
            <HoursPanel
                open
                onClose={() => pr.setPanel(null)}
                title={`Booking rules for ${name}`}
                sub={
                    <span data-ph-mask="">
                        They replace the business&apos;s rules for {name}. Same
                        as the business unless you change one.
                    </span>
                }
            >
                {business ? (
                    <>
                        <PersonRulesList
                            rows={personRuleRows(own, business)}
                            name={name}
                            canChange={pr.canChange(person)}
                            onOpen={(key: PersonRuleKey) =>
                                pr.setPanel({
                                    kind: "rule",
                                    staffId: person.id,
                                    key,
                                })
                            }
                        />
                        <p className={`mt-2.5 ${HELP}`}>
                            How customers pay, refunds and free cancelling are
                            the same for everyone · set in the business&apos;s
                            Booking rules.
                        </p>
                        <p className={`mt-1.5 ${HELP}`}>
                            {changeHelp(pr, person)}
                        </p>
                    </>
                ) : (
                    <FailedRead
                        things="the booking rules"
                        reassurance="They are as you left them."
                    />
                )}
            </HoursPanel>
        );
    }

    const request = pr.requests.find((r) => r.id === panel.id);
    if (!request) return null;
    return panel.kind === "review" ? (
        <ReviewPanel pr={pr} request={request} timezone={timezone} />
    ) : (
        <TurnDownPanel pr={pr} request={request} />
    );
}

/**
 * A request to review (BKMHoursRuleRequest, BKDHoursRuleRequest): what they
 * asked for, how it stands now, what approving does, and Approve or Turn
 * down at the foot.
 */
function ReviewPanel({
    pr,
    request,
    timezone,
}: {
    pr: PersonRulesState;
    request: RuleRequest;
    timezone: string;
}) {
    const name = pr.nameOfRequest(request);
    const person = pr.personOf(request.staffId);
    const own = person ? pr.ownOf(person) : null;
    const sent = formatDateTime(request.createdAt, timezone, {
        relative: true,
    });
    return (
        <HoursPanel
            open
            done={false}
            onClose={() => pr.setPanel(null)}
            title={`${name}'s request`}
            sub={`Sent ${sent.replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())} · you also got a notification`}
            foot={
                <>
                    <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        busy={pr.busy === "approve"}
                        busyLabel="Approving…"
                        disabled={pr.busy === "turnDown"}
                        onClick={() => void pr.approve(request)}
                    >
                        Approve
                    </Button>
                    <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="w-full"
                        disabled={pr.busy === "approve"}
                        onClick={() =>
                            pr.setPanel({ kind: "decline", id: request.id })
                        }
                    >
                        Turn down
                    </Button>
                </>
            }
        >
            <dl
                data-ph-mask=""
                className="overflow-hidden rounded-[12px] border border-border bg-card"
            >
                {changedKeys(request.changes).map((key) => {
                    const asked = request.changes[key] ?? null;
                    const now = own?.[key] ?? null;
                    return (
                        <Fragment key={key}>
                            <div className="border-b border-border px-3.5 py-2.5">
                                <dt className="text-[12.5px] text-muted-foreground">
                                    {ruleLabel(key)}, for {name} only
                                </dt>
                                <dd className="text-[14.5px] font-semibold">
                                    {asked === null
                                        ? "Same as the business"
                                        : personSentence(key, asked)}
                                </dd>
                            </div>
                            <div className="border-b border-border px-3.5 py-2.5 last:border-b-0">
                                <dt className="text-[12.5px] text-muted-foreground">
                                    Now
                                </dt>
                                <dd className="text-[14.5px] font-medium">
                                    {pr.business && own
                                        ? keptSentence(key, own, pr.business)
                                        : null}
                                    {now === null
                                        ? " · same as the business"
                                        : ` · just for ${name}`}
                                </dd>
                            </div>
                        </Fragment>
                    );
                })}
            </dl>
            <p data-ph-mask="" className={`mt-2.5 ${HELP}`}>
                {ifApproved(request.changes, name)} Bookings already made stay.{" "}
                {name} is told either way.
            </p>
        </HoursPanel>
    );
}

/**
 * Turning a request down (BKMHoursRuleRequest's second step): an optional
 * reason the person reads, then Turn down, or Back to the request. What
 * was typed stays when the API refuses.
 */
function TurnDownPanel({
    pr,
    request,
}: {
    pr: PersonRulesState;
    request: RuleRequest;
}) {
    const [reason, setReason] = useState("");
    const name = pr.nameOfRequest(request);
    const person = pr.personOf(request.staffId);
    const own = person ? pr.ownOf(person) : null;
    const keys = changedKeys(request.changes);
    const same = own ? keys.every((k) => own[k] === null) : true;
    const stays =
        keys.length > 1
            ? same
                ? `${name}'s rules stay the same as the business.`
                : `${name}'s rules stay as they are.`
            : same
              ? `${name}'s rule stays the same as the business.`
              : `${name}'s rule stays as it is.`;
    return (
        <HoursPanel
            open
            done={false}
            onClose={() => pr.setPanel({ kind: "review", id: request.id })}
            title={`Turn down ${name}'s request?`}
            sub={stays}
            foot={
                <>
                    <Button
                        type="button"
                        size="lg"
                        variant="destructive"
                        className="w-full"
                        busy={pr.busy === "turnDown"}
                        busyLabel="Turning down…"
                        onClick={() => void pr.turnDown(request, reason)}
                    >
                        Turn down
                    </Button>
                    <Button
                        type="button"
                        size="lg"
                        variant="ghost"
                        className="w-full"
                        disabled={pr.busy === "turnDown"}
                        onClick={() =>
                            pr.setPanel({ kind: "review", id: request.id })
                        }
                    >
                        Back
                    </Button>
                </>
            }
        >
            <Field label="Reason" optional hint={`${name} sees it.`} holdsData>
                <Textarea
                    value={reason}
                    maxLength={300}
                    rows={4}
                    onChange={(e) => setReason(e.target.value)}
                />
            </Field>
        </HoursPanel>
    );
}
