"use client";

import type { ToastId } from "@saroh/ui/toast";
import {
    dismissToast,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { firstName } from "@/lib/names";
import {
    approveRuleRequest,
    dismissRuleRequest,
    turnDownRuleRequest,
    updatePersonRules,
    withdrawRuleRequest,
} from "@/lib/staff/actions";
import type { PersonRuleKey } from "@/lib/staff/person-rules";
import {
    changedKeys,
    nowWords,
    ownRules,
    personRuleSaved,
} from "@/lib/staff/person-rules";
import type {
    BookingRules,
    PersonRules,
    PersonRulesView,
    RuleRequest,
    StaffView,
} from "@/lib/staff/types";

import { PERSON_RULES_ROW_ID } from "./more-list";

/** What the page read for each person's own rules (U20, #1038). */
export interface PersonRulesData {
    /** The signed-in person's user id: whose diary is their own. */
    meId: string | null;
    /** The requests waiting (an owner's or admin's: everyone's), or null unread. */
    requests: RuleRequest[] | null;
    /** A Member's own diary's rules, with their request, or null. */
    mine: PersonRulesView | null;
}

/** Which of these sheets is open: one at a time. */
export type RulesPanel =
    | { kind: "list"; staffId: string }
    | { kind: "rule"; staffId: string; key: PersonRuleKey }
    | { kind: "review"; id: string }
    | { kind: "decline"; id: string };

/**
 * Each person's own booking rules on Hours and time off (U20, DEC-170,
 * #1038): whose rules show (the person shown; on Everyone, your own), who
 * may change them and whether a change waits, and every move — a pick,
 * Undo, Withdraw, OK on an outcome, Approve and Turn down. A change saves
 * as it is picked: at once with Undo for an owner or admin, and for a
 * Member while the business's switch is off; as a request while it is on.
 * Paying and refunds stay business-wide.
 */
export function usePersonRules({
    staff,
    people,
    shown,
    everyone,
    canEdit,
    canManage,
    business,
    data,
}: {
    /** The page's own list, as it came: when it changes, the server spoke. */
    staff: StaffView[];
    people: StaffView[];
    shown: StaffView | null;
    everyone: boolean;
    canEdit: boolean;
    canManage: boolean;
    /** The business's rules as last saved, or null when unread. */
    business: BookingRules | null;
    data: PersonRulesData | null;
}) {
    const router = useRouter();
    const [overrides, setOverrides] = useState<Record<string, PersonRules>>({});
    const [request, setRequest] = useState(data?.mine?.request ?? null);
    const [requests, setRequests] = useState(data?.requests ?? []);
    const [seen, setSeen] = useState({ staff, data });
    if (seen.staff !== staff || seen.data !== data) {
        setSeen({ staff, data });
        setOverrides({});
        setRequest(data?.mine?.request ?? null);
        setRequests(data?.requests ?? []);
    }
    const [panel, setPanel] = useState<RulesPanel | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    // The keyboard back on the person's rules once an answered sheet has
    // gone: after the sheet's own return of focus, which looks for the row
    // that opened it and went with it.
    const [refocus, setRefocus] = useState(0);
    useEffect(() => {
        if (!refocus) return;
        const t = setTimeout(
            () => document.getElementById(PERSON_RULES_ROW_ID)?.focus(),
            0,
        );
        return () => clearTimeout(t);
    }, [refocus]);
    const focusRow = () => setRefocus((n) => n + 1);

    const meId = data?.meId ?? null;
    const isOwn = (p: StaffView) =>
        Boolean(meId) && p.membership?.userId === meId;
    const myDiary = people.find(isOwn) ?? null;
    const subject = everyone ? myDiary : shown;
    const ownOf = (p: StaffView) => overrides[p.id] ?? ownRules(p.rules);
    const canChange = (p: StaffView) => canManage || (canEdit && isOwn(p));
    const waits = (p: StaffView) =>
        !canManage &&
        isOwn(p) &&
        (business?.memberRuleChangesNeedApproval ?? true);
    const personOf = (staffId: string) =>
        people.find((p) => p.id === staffId) ?? null;
    const nameOfRequest = (r: RuleRequest) =>
        firstName(personOf(r.staffId)?.name ?? r.staffName);

    // Only the latest change keeps its Undo: two on screen is how the
    // wrong one gets pressed.
    const lastUndo = useRef<ToastId | null>(null);

    async function pick(
        person: StaffView,
        key: PersonRuleKey,
        value: number | null,
    ) {
        const name = firstName(person.name);
        const was = ownOf(person)[key];
        if (was === value) {
            setPanel({ kind: "list", staffId: person.id });
            return;
        }
        const res = await runAction(
            () => updatePersonRules(person.id, { [key]: value }),
            { setBusy: (b) => setBusy(b ? "pick" : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(
                "Couldn't save that rule. Nothing has changed.",
                res.error,
            );
            return;
        }
        const saved = res.data;
        setOverrides((o) => ({ ...o, [person.id]: saved.rules.own }));
        router.refresh();
        if (!saved.applied) {
            // Waiting for an owner or admin: the line on the page says so.
            setRequest(saved.rules.request);
            setPanel(null);
            focusRow();
            return;
        }
        setPanel({ kind: "list", staffId: person.id });
        // Undo puts back this one rule, never the others changed since.
        const previous = saved.previous[key];
        const undo = { [key]: previous === undefined ? was : previous };
        if (lastUndo.current !== null) dismissToast(lastUndo.current);
        lastUndo.current = showUndo(
            personRuleSaved(key, value, name),
            async () => {
                const back = await updatePersonRules(person.id, undo);
                if (!back.ok) return back;
                setOverrides((o) => ({
                    ...o,
                    [person.id]: back.data.rules.own,
                }));
                router.refresh();
                return { ok: true };
            },
        );
    }

    async function withdraw() {
        if (!request) return;
        const res = await runAction(() => withdrawRuleRequest(request.id), {
            setBusy: (b) => setBusy(b ? "withdraw" : null),
        });
        if (!res) return;
        router.refresh();
        if (!res.ok) {
            showError("Couldn't withdraw the request.", res.error);
            return;
        }
        setRequest(null);
        focusRow();
        showSuccess("Request withdrawn.", "Nothing changed.");
    }

    /** OK on an outcome; `then` opens what comes next once it is cleared. */
    async function dismiss(then?: () => void) {
        if (!request) return;
        const res = await runAction(() => dismissRuleRequest(request.id), {
            setBusy: (b) => setBusy(b ? "dismiss" : null),
        });
        if (!res) return;
        if (!res.ok) {
            showError("Couldn't clear that.", res.error);
            return;
        }
        setRequest(null);
        router.refresh();
        if (then) then();
        else focusRow();
    }

    /** "Change it again": clears the turn-down and opens the rule it was about. */
    function tryAgain(person: StaffView) {
        const key = request ? changedKeys(request.changes).at(0) : undefined;
        void dismiss(() =>
            setPanel(
                key
                    ? { kind: "rule", staffId: person.id, key }
                    : { kind: "list", staffId: person.id },
            ),
        );
    }

    async function approve(r: RuleRequest) {
        const name = nameOfRequest(r);
        const res = await runAction(() => approveRuleRequest(r.id), {
            setBusy: (b) => setBusy(b ? "approve" : null),
        });
        if (!res) return;
        router.refresh();
        if (!res.ok) {
            showError("Couldn't approve the request.", res.error);
            return;
        }
        const person = personOf(r.staffId);
        if (person) {
            setOverrides((o) => ({
                ...o,
                [person.id]: { ...ownOf(person), ...r.changes },
            }));
        }
        setRequests((rs) => rs.filter((x) => x.id !== r.id));
        setPanel(null);
        focusRow();
        const first = changedKeys(r.changes).at(0);
        showSuccess(
            "Request approved.",
            `${first ? `${nowWords(first, r.changes[first] ?? null, name)}. ` : ""}${name} is told.`,
        );
    }

    async function turnDown(r: RuleRequest, reason: string) {
        const name = nameOfRequest(r);
        const words = reason.trim();
        const res = await runAction(
            () => turnDownRuleRequest(r.id, words || undefined),
            { setBusy: (b) => setBusy(b ? "turnDown" : null) },
        );
        if (!res) return;
        router.refresh();
        if (!res.ok) {
            showError("Couldn't turn down the request.", res.error);
            return;
        }
        setRequests((rs) => rs.filter((x) => x.id !== r.id));
        setPanel(null);
        focusRow();
        showSuccess(
            "Request turned down.",
            words ? `${name} sees your reason.` : `${name} is told.`,
        );
    }

    return {
        subject,
        /** Your own first name, when you take bookings. */
        ownName: myDiary ? firstName(myDiary.name) : null,
        business,
        panel,
        setPanel,
        busy,
        request,
        requests: canManage ? requests : [],
        isOwn,
        ownOf,
        canChange,
        waits,
        personOf,
        nameOfRequest,
        pick,
        withdraw,
        dismiss,
        tryAgain,
        approve,
        turnDown,
    };
}

export type PersonRulesState = ReturnType<typeof usePersonRules>;
