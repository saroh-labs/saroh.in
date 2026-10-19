"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";

import { count } from "@/lib/format/plural";
import { firstName } from "@/lib/names";
import {
    askedWords,
    requestLine,
    rulesSummary,
    turnedDownLine,
    waitingLine,
} from "@/lib/staff/person-rules";

import { PersonRulesRow } from "./more-list";
import type { PersonRulesState } from "./use-person-rules";

/**
 * The owner's and admin's line under Whose hours (U20, BKMHoursRuleRequest,
 * BKDHoursRuleRequest): "1 request · Arjun wants their own rule: booking
 * late up to 12 hours before the start." and Review, which opens the
 * oldest. Nothing while nothing waits.
 */
export function RuleRequestLine({ pr }: { pr: PersonRulesState }) {
    const first = pr.requests.at(0);
    if (!first) return null;
    return (
        <Notice
            tone="warning"
            align="center"
            data-rule-requests=""
            className="mt-2.5 min-[760px]:-mt-1.5 min-[760px]:mb-4"
            action={
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                    onClick={() =>
                        pr.setPanel({ kind: "review", id: first.id })
                    }
                >
                    Review
                </Button>
            }
        >
            <span data-ph-mask="">
                <strong>{count(pr.requests.length, "request")}</strong> ·{" "}
                {requestLine(pr.requests, pr.nameOfRequest)}
            </span>
        </Notice>
    );
}

/**
 * "Booking rules for ‹person›" (U20, BKMHoursRules, BKDHoursRules), between
 * Time off and More: one row saying how many of their rules are their own,
 * which opens them. Over it, a Member's own request while it waits (with
 * Withdraw), and the outcome once decided (with OK; a turn-down says the
 * reason and offers Change it again). Under it, for someone who may only
 * read them, who can change them.
 */
export function PersonRulesSection({ pr }: { pr: PersonRulesState }) {
    const person = pr.subject;
    if (!person) return null;
    const name = firstName(person.name);
    const own = pr.ownOf(person);
    const summary = rulesSummary(own, name);
    const canChange = pr.canChange(person);
    const request = pr.request?.staffId === person.id ? pr.request : null;
    const decider = request?.decidedBy?.name
        ? ` by ${firstName(request.decidedBy.name)}`
        : "";
    const lock = canChange
        ? null
        : pr.isOwn(person)
          ? "Your role can't change booking rules. An owner or admin can."
          : person.membership
            ? `Only ${name} or an owner or admin can change ${name}'s booking rules.`
            : `Only an owner or admin can change ${name}'s booking rules.`;

    return (
        <section aria-labelledby="person-rules-title" className="min-w-0">
            <h2
                id="person-rules-title"
                data-ph-mask=""
                className="mb-2.5 mt-[26px] font-display text-[16px] font-semibold tracking-[-0.01em] min-[760px]:mt-0 min-[760px]:text-[17px] min-[760px]:tracking-[-0.02em]"
            >
                Booking rules for {name}
            </h2>

            {request?.status === "WAITING" && pr.business ? (
                <Notice
                    tone="warning"
                    className="mb-2"
                    data-rule-request="waiting"
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            busy={pr.busy === "withdraw"}
                            busyLabel="Withdrawing…"
                            onClick={() => void pr.withdraw()}
                        >
                            Withdraw the request
                        </Button>
                    }
                >
                    <span data-ph-mask="">
                        <strong>Waiting for approval</strong> · sent to owners
                        and admins.
                        <br />
                        {waitingLine(request.changes, own, pr.business)}
                    </span>
                </Notice>
            ) : null}

            {request?.status === "TURNED_DOWN" ? (
                <Notice
                    tone="error"
                    role="status"
                    className="mb-2"
                    data-rule-request="turned-down"
                    action={
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pr.busy === "dismiss"}
                                onClick={() => pr.tryAgain(person)}
                            >
                                Change it again
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                busy={pr.busy === "dismiss"}
                                busyLabel="Clearing…"
                                onClick={() => void pr.dismiss()}
                            >
                                OK
                            </Button>
                        </>
                    }
                >
                    <span data-ph-mask="">
                        <strong>Turned down{decider}</strong> ·{" "}
                        {turnedDownLine(request.changes, own)}
                        <br />
                        {request.reason
                            ? `“${request.reason}”`
                            : "No reason was given."}
                    </span>
                </Notice>
            ) : null}

            {request?.status === "APPROVED" ? (
                <Notice
                    tone="success"
                    className="mb-2"
                    data-rule-request="approved"
                    action={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            busy={pr.busy === "dismiss"}
                            busyLabel="Clearing…"
                            onClick={() => void pr.dismiss()}
                        >
                            OK
                        </Button>
                    }
                >
                    <span data-ph-mask="">
                        <strong>Approved{decider}</strong> ·{" "}
                        {upperFirst(askedWords(request.changes))} is your rule
                        now.
                    </span>
                </Notice>
            ) : null}

            <PersonRulesRow
                title={summary.title}
                sub={summary.sub}
                action={canChange ? "Change" : "See them"}
                onOpen={() => pr.setPanel({ kind: "list", staffId: person.id })}
            />
            {lock ? (
                <p
                    data-ph-mask=""
                    className="mt-1.5 text-pretty px-0.5 text-[12.5px] leading-normal text-muted-foreground"
                >
                    {lock}
                </p>
            ) : null}
        </section>
    );
}

const upperFirst = (words: string) =>
    words.charAt(0).toUpperCase() + words.slice(1);
