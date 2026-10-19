"use client";

import { Button } from "@saroh/ui/button";
import { focusFirstError } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { lostNew, useLeaveGuard } from "@/components/shared/use-leave-guard";
import { useSaveShortcut } from "@/lib/hooks/keyboard-save";
import { callName } from "@/lib/services/call-name";
import type { ServiceDraft, ServiceField } from "@/lib/services/service-editor";
import {
    changedSections,
    chargedAsSaved,
    draftOf,
    gstPlace,
    problemFor,
    savedMessage,
    serviceFieldProblems,
} from "@/lib/services/service-editor";
import {
    addedMessage,
    gapsLine,
    liveLine,
    sameNameAs,
    summaryLine,
    withSameName,
} from "@/lib/services/service-form";
import {
    hoursNotSaved,
    startingHours,
} from "@/lib/services/service-hours-draft";
import type { PanelKey } from "@/lib/services/service-panels";
import { detailRows, PANEL_FIELDS } from "@/lib/services/service-panels";
import { zoneShortName } from "@/lib/services/time-picker";

import { DetailPanel } from "./detail-panel";
import type { EditorProps } from "./editor-props";
import { BackToServices } from "./editor-props";
import { NewServiceFoot, NewServiceSide } from "./new-service-side";
import { FiveQuestions } from "./questions";
import { useServiceSave } from "./use-service-save";

/** The five questions' own fields: a problem in any keeps More closed. */
const QUESTIONS: readonly ServiceField[] = [
    "name",
    "places",
    "minutes",
    "price",
    "staffIds",
];

/**
 * New service (U16, #1032; boards BKMServiceNew, BKMServiceNewStep2 and
 * BKDServiceNew's new states): five plain questions — What is it called?
 * Who comes? How long does it take? Price? Who does it? — and a live line
 * saying whether customers could book it as soon as it is added. "Who
 * can book it" (DEC-170, Q5) and everything else sit under More details,
 * a row each opening its own panel; nothing is taken away (00-universal
 * §15). At a desk the questions are on the left and the live line, the
 * ticks and More details on the right; on a phone More details opens
 * under the questions, in their place.
 *
 * Add service is never off: pressing it with gaps says how many and
 * which over the form, each again at its field, and the keyboard goes to
 * the first. Discard asks "Discard what you typed?" once something is
 * typed. It goes in up to three calls (`useServiceSave`); when the
 * service is added and its hours are not, the page says so with Try
 * again.
 */
export function NewService(props: EditorProps) {
    const {
        staff,
        rules,
        currency,
        timezone,
        openingHours = null,
        hasPage,
        hasStorefront = null,
        paymentsLock = null,
        payment = null,
        gstRegistered = null,
        businessPriceMode = null,
        others = [],
    } = props;
    const router = useRouter();
    const people = (staff ?? []).filter((p) => p.status === "ACTIVE");
    const hasStaff = people.length > 0;
    const onePerson = people.length === 1;
    // Its own hours give it times when nobody on the diary does it, or it
    // is a class: then it starts from the opening hours.
    const ownHours = (kind: ServiceDraft["kind"]) =>
        startingHours(openingHours, kind === "class" || !hasStaff);
    const [initial] = useState(() =>
        draftOf(
            null,
            // One person on the diary: they do it, unasked.
            onePerson && people[0] ? [people[0].id] : [],
            timezone,
            ownHours("one"),
        ),
    );
    const store = useServiceSave({
        serviceId: null,
        initial,
        people,
        staffRead: staff !== null,
        hoursRead: rules !== null,
        currency,
    });
    const [draft, setDraft] = useState(initial);
    const [hoursTouched, setHoursTouched] = useState(false);
    const set = (patch: Partial<ServiceDraft>) => {
        if (patch.hours) setHoursTouched(true);
        setDraft((d) => {
            const next = { ...d, ...patch };
            // Its hours follow its kind until someone changes them.
            if (
                store.createdId === null &&
                !hoursTouched &&
                !patch.hours &&
                patch.kind &&
                patch.kind !== d.kind
            ) {
                next.hours = ownHours(patch.kind);
            }
            return next;
        });
    };

    const form = useRef<HTMLFormElement>(null);
    const [tried, setTried] = useState(false);
    const [left, setLeft] = useState<ReadonlySet<ServiceField>>(new Set());
    const leave = (field: ServiceField) =>
        setLeft((had) => (had.has(field) ? had : new Set(had).add(field)));
    const [moreOpen, setMoreOpen] = useState(false);
    const [panel, setPanel] = useState<PanelKey | null>(null);
    const [lastPanel, setLastPanel] = useState<PanelKey>("describe");
    const [round, setRound] = useState(0);
    const [asking, setAsking] = useState(false);

    const noStorefront = hasStorefront === false || store.refusedStorefront;
    const [gstAt] = useState(() => gstPlace(gstRegistered, initial));
    // The zone's short name ("IST"), read once.
    const [zoneShort] = useState(() => zoneShortName(timezone, Date.now()));
    const problemsOf = (d: ServiceDraft) =>
        withSameName(
            serviceFieldProblems(
                d,
                hasStaff,
                noStorefront,
                onePerson,
                gstRegistered === true,
            ),
            d.name,
            others,
            null,
        );
    const problems = problemsOf(draft);
    const bad = problems.length > 0;
    const problem = (field: ServiceField) =>
        tried || left.has(field) ? problemFor(problems, field) : null;
    const dirty = changedSections(store.saved, draft).length > 0;
    const isNew = store.serviceId === null;

    const guard = useLeaveGuard({
        dirty: dirty && !store.saving,
        lost: lostNew("service"),
    });

    const chosen = people.filter((p) => draft.staffIds.includes(p.id));
    const names = chosen.map((p) => callName(p.name));
    const bookers = {
        customers: draft.showOnBookingPage,
        team: draft.bookableByTeam,
    };
    const live = liveLine({
        draft,
        staffNeeded: hasStaff && !onePerson,
        names,
        hasPage,
    });
    const rows = detailRows({
        draft,
        names,
        fullNames: staff === null ? null : chosen.map((p) => p.name),
        currency,
        businessZone: timezone,
        zoneShort,
        hoursRead: rules !== null,
        gstAt,
    });
    // A row says what is wrong in its panel once Add has been pressed. The
    // price is the deposit's only while one is asked for.
    const panelProblem = (key: PanelKey) => {
        if (!tried) return null;
        if (key === "pay" && draft.deposit === "NONE") return null;
        const found = problems.find((p) => PANEL_FIELDS[key].includes(p.field));
        return found?.message ?? null;
    };

    function openPanel(key: PanelKey) {
        setLastPanel(key);
        setRound((n) => n + 1);
        setPanel(key);
    }

    async function add() {
        if (store.saving) return;
        if (bad) {
            setTried(true);
            // The questions first; More opens when only it has gaps.
            if (!problems.some((p) => QUESTIONS.includes(p.field))) {
                setMoreOpen(true);
            }
            focusFirstError(form.current);
            return;
        }
        const name = draft.name.trim();
        const message = addedMessage(
            name,
            bookers,
            savedMessage({
                isNew: true,
                name,
                kind: draft.kind,
                comingUp: 0,
                hasPerson: draft.staffIds.length > 0,
                hasHours: draft.hours.length > 0,
            }),
        );
        await store.save(draft, message);
    }
    useSaveShortcut(() => void add(), true);

    function discard() {
        if (!dirty) {
            router.push("/services");
            return;
        }
        setAsking(true);
    }

    const failed = store.hoursFailed
        ? hoursNotSaved({
              created: store.hoursFailed.created,
              name: draft.name.trim() || "The service",
              reason: store.hoursFailed.reason,
          })
        : null;
    const title = isNew ? "New service" : draft.name.trim() || "New service";

    return (
        <main className="w-full px-4 pt-4 sm:px-[26px]">
            <BackToServices />
            <PageHeader
                className="mb-4"
                holdsData={isNew ? false : "title"}
                title={title}
                badge={
                    <StatusBadge tone="neutral">
                        {isNew ? (dirty ? "Not added yet" : "New") : "Added"}
                    </StatusBadge>
                }
            />
            {tried && bad ? (
                <Notice
                    tone="error"
                    role="alert"
                    className="mb-3.5"
                    data-ph-unmask=""
                >
                    {gapsLine(problems)}
                </Notice>
            ) : null}
            {failed ? (
                <Notice
                    tone="error"
                    role="alert"
                    title={failed.title}
                    className="mb-3.5"
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void add()}
                            busy={store.saving}
                            busyLabel="Saving…"
                        >
                            Try again
                        </Button>
                    }
                >
                    {failed.body}
                </Notice>
            ) : null}
            <form
                ref={form}
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    void add();
                }}
            >
                <fieldset
                    disabled={store.saving}
                    className="m-0 grid min-w-0 gap-5 border-0 p-0 pb-6 min-[760px]:grid-cols-[minmax(0,1fr)_400px] min-[760px]:items-start"
                >
                    <legend className="sr-only">New service</legend>
                    <FiveQuestions
                        edit={{ draft, set, problem, leave }}
                        hidden={moreOpen}
                        taken={sameNameAs(draft.name, others)}
                        currency={currency}
                        staff={staff}
                        people={people}
                    />

                    <NewServiceSide
                        draft={draft}
                        names={names}
                        currency={currency}
                        live={live}
                        moreOpen={moreOpen}
                        setMoreOpen={setMoreOpen}
                        bookers={bookers}
                        onBookers={(b) =>
                            set({
                                showOnBookingPage: b.customers,
                                bookableByTeam: b.team,
                            })
                        }
                        rows={rows}
                        panelProblem={panelProblem}
                        openPanel={openPanel}
                    />
                </fieldset>

                <NewServiceFoot
                    summary={`${draft.name.trim() || "New service"} · ${summaryLine(draft, names, currency)}`}
                    dirty={dirty}
                    saving={store.saving}
                    label={isNew ? "Add service" : "Save"}
                    onDiscard={discard}
                />
            </form>

            <DetailPanel
                key={round}
                which={panel ?? lastPanel}
                open={panel !== null}
                source={draft}
                setup={{
                    currency,
                    staff,
                    people,
                    payment,
                    paymentsLock,
                    saved: store.saved,
                    savedDeposit: "NONE",
                    gstAt,
                    businessPriceMode,
                    charged: (d) => chargedAsSaved(null, d),
                    canEdit: true,
                    noStorefront,
                    hoursRead: rules !== null,
                    comingUp: 0,
                    isSaved: false,
                    others,
                    selfId: null,
                }}
                problemsOf={problemsOf}
                saveLabel={
                    (panel ?? lastPanel) === "hours"
                        ? "Use these hours"
                        : "Use this"
                }
                onApply={(next) => {
                    if (!sameHoursOf(next, draft)) setHoursTouched(true);
                    setDraft(next);
                    return true;
                }}
                onClose={() => setPanel(null)}
            />

            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                tone="neutral"
                title="Discard what you typed?"
                description="Nothing is added yet. Discarding drops this new service and goes back to Services."
                confirmLabel="Discard"
                keepLabel="Keep typing"
                onConfirm={() => {
                    guard.release();
                    router.push("/services");
                }}
            />
            {guard.dialog}
        </main>
    );
}

function sameHoursOf(a: ServiceDraft, b: ServiceDraft): boolean {
    return JSON.stringify(a.hours) === JSON.stringify(b.hours);
}
