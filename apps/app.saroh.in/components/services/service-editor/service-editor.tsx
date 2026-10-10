"use client";

import { useSaveShortcut } from "@/lib/hooks/keyboard-save";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { ConfirmResult } from "@/components/shared/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLeaveGuard } from "@/components/shared/use-leave-guard";
import type { PlanLock } from "@/lib/billing/access";
import { joinAnd } from "@/lib/editor-shell/state";
import {
    archiveService,
    createService,
    replaceRules,
    updateService,
} from "@/lib/services/actions";
import type { AvailabilityRule, Service } from "@/lib/services/service";
import { takingLabel } from "@/lib/services/service-cards";
import type { ServiceDraft, ServiceField } from "@/lib/services/service-editor";
import {
    changedParts,
    changedSections,
    draftOf,
    glance,
    hasBookableHours,
    problemFor,
    savedMessage,
    serviceFieldProblems,
    serviceInput,
    serviceUpdate,
    staffFor,
    stateLine,
    statePill,
    TREATMENT_NEEDS_STOREFRONT,
    VIEW_ONLY,
} from "@/lib/services/service-editor";
import {
    hoursFromRules,
    hoursNotSaved,
    rulesOf,
    startingHours,
} from "@/lib/services/service-hours-draft";
import type { ServiceUsage } from "@/lib/services/usage";
import { setStaffServices } from "@/lib/staff/actions";
import type {
    BookingPaymentView,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

import { StatusBadge } from "@/components/shared/status-badge";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { focusFirstError } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { AtAGlance } from "./at-a-glance";
import {
    BookingPageCard,
    PriceSection,
    TimeSection,
    WhatItIs,
    WhoTakesIt,
} from "./editor-sections";
import { MoreSettings } from "./more-settings";

const SERVICES_HREF = "/services";

/**
 * The Service Editor (E2, "Saroh Service Editor"): one page for a new
 * service and a saved one, in place of the old dialog and forms. What it
 * is, its time and where, its price, who takes it, the booking page and
 * At a glance; everything else the old forms had is under More settings.
 * One Save, in the header, applies to bookings made after it. It goes in
 * up to three calls: the service, who takes it, and its own weekly hours
 * (`PUT …/rules`). When the service is saved and its hours are not, the
 * page says exactly that, keeps the hours typed, and Try again sends only
 * the hours.
 *
 * A field says what is wrong once it has been left; Save says the rest and
 * puts the keyboard on the first one.
 *
 * "At booking, they pay" sits under Price (E8), and Visits under Time
 * (E10): more than one makes it a treatment, which needs a storefront to
 * be sold from — said under Time, with the way to add one.
 */
export function ServiceEditor({
    service,
    rules,
    staff,
    usage,
    currency,
    timezone,
    openingHours = null,
    canEdit,
    hasPage,
    hasStorefront = null,
    paymentsLock = null,
    payment = null,
}: {
    /** Null while creating. */
    service: Service | null;
    /** Null when the service's own hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    /** Null when the people on the diary couldn't be read. */
    staff: StaffView[] | null;
    /** Null when the bookings couldn't be counted. */
    usage: ServiceUsage | null;
    /** The business's currency. */
    currency: string;
    /** The business's time zone, for a new service. */
    timezone: string;
    /**
     * When the business is open: what a new service's own hours start
     * from. Null with none set, or when they couldn't be read.
     */
    openingHours?: WeeklyRange[] | null;
    canEdit: boolean;
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
    /** A storefront to sell treatments from (E10); null when unknown. */
    hasStorefront?: boolean | null;
    /**
     * The plan's lock on online payments (`rowLock(…, "payments")`): a
     * deposit is taken online, so it locks the deposits. Null when open,
     * unknown or not enforced.
     */
    paymentsLock?: PlanLock | null;
    /** How people pay when they book (DEC-088); null when unknown. */
    payment?: BookingPaymentView | null;
}) {
    const router = useRouter();
    const people = (staff ?? []).filter((p) => p.status === "ACTIVE");
    const hasStaff = people.length > 0;
    // A service added by this page's Save whose hours then failed: it is
    // saved, so the page edits it from here on, and Try again sends only
    // the hours.
    const [createdId, setCreatedId] = useState<string | null>(null);
    const serviceId = service?.id ?? createdId;
    const isNew = serviceId === null;
    // Its own hours give a service its times when nobody on the diary
    // takes it, or it is a class (`startingHours`).
    const ownHours = (kind: ServiceDraft["kind"]) =>
        startingHours(openingHours, kind === "class" || !hasStaff);
    const [saved, setSaved] = useState(() =>
        draftOf(
            service,
            service
                ? staffFor(service.id, people)
                : // One person on the diary: they take it, unasked.
                  people.length === 1 && people[0]
                  ? [people[0].id]
                  : [],
            timezone,
            service ? hoursFromRules(rules ?? []) : ownHours("one"),
        ),
    );
    const [draft, setDraft] = useState(saved);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    // A new service's hours follow its kind until someone changes them.
    const [hoursTouched, setHoursTouched] = useState(false);
    const set = (patch: Partial<ServiceDraft>) => {
        if (patch.hours) setHoursTouched(true);
        setDraft((d) => {
            const next = { ...d, ...patch };
            if (
                service === null &&
                createdId === null &&
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
    // The service was saved and its hours were not: said on the page until
    // they are, or the page is left.
    const [hoursFailed, setHoursFailed] = useState<{
        created: boolean;
        reason: string;
    } | null>(null);
    const form = useRef<HTMLFieldSetElement>(null);
    // Fields that have been left: each says what is wrong from then on.
    const [left, setLeft] = useState<ReadonlySet<ServiceField>>(new Set());
    const leave = (field: ServiceField) =>
        setLeft((had) => (had.has(field) ? had : new Set(had).add(field)));

    // The API said there is no storefront to sell a treatment from (E10),
    // though the page couldn't tell: said under Time from then on.
    const [refusedStorefront, setRefusedStorefront] = useState(false);
    // A service already a treatment keeps saving when its storefront has
    // gone since; the booking page refuses it then (E9).
    const wasTreatment = (service?.visits ?? 1) > 1;
    const noStorefront =
        !wasTreatment && (hasStorefront === false || refusedStorefront);

    const [tried, setTried] = useState(false);
    const changed = changedSections(saved, draft);
    const dirty = changed.length > 0;
    const problems = serviceFieldProblems(
        draft,
        hasStaff,
        noStorefront,
        people.length === 1,
    );
    const bad = problems.length > 0;
    const problem = (field: ServiceField) =>
        tried || left.has(field) ? problemFor(problems, field) : null;
    const hoursProblem = (row: number) =>
        tried || hoursTouched ? problemFor(problems, "hours", row) : null;
    // What is wrong under More settings opens it, so the keyboard can land
    // on it.
    const inMore = (["timezone", "bufferBefore", "sacCode", "hours"] as const)
        .map((field) => problemFor(problems, field))
        .some((message) => message !== null);
    const comingUp = isNew ? 0 : usage ? usage.comingUp : null;
    const pill = statePill(isNew, draft.taking);
    const title = draft.name.trim() || (service?.name ?? "New service");

    // Every link out of the page asks first while there are unsaved
    // changes: the breadcrumbs, the rail, and "Add a location" under Time.
    const guard = useLeaveGuard({
        dirty: canEdit && dirty && !saving,
        lost: isNew
            ? "The service isn't created yet, so nothing you've entered will be kept."
            : `Your changes to ${joinAnd(changed)} will be lost.`,
    });

    /** Who takes it, written to each person whose list changes. */
    async function setWho(serviceId: string, want: string[]) {
        for (const p of people) {
            const has = p.serviceIds.includes(serviceId);
            const should = want.includes(p.id);
            if (has === should) continue;
            const next = should
                ? [...p.serviceIds, serviceId]
                : p.serviceIds.filter((id) => id !== serviceId);
            const res = await setStaffServices(p.id, next);
            if (!res.ok) return res.error;
        }
        return null;
    }

    /** A refused save: said under Time when it is the storefront (E10). */
    function refused(error: string) {
        if (error === TREATMENT_NEEDS_STOREFRONT) {
            setRefusedStorefront(true);
            return;
        }
        showError(error);
    }

    async function save() {
        if (!canEdit || saving || (!dirty && !isNew)) return;
        if (bad) {
            // Say what is missing, under each field, and go to the first.
            setTried(true);
            focusFirstError(form.current);
            return;
        }
        setSaving(true);
        const input = serviceInput(draft, currency);
        const parts = changedParts(saved, draft);
        const creating = serviceId === null;
        const added = creating || createdId !== null;
        const ownHoursCount = draft.hours.length;
        const message = savedMessage({
            isNew: added,
            name: input.name,
            kind: draft.kind,
            comingUp,
            hasPerson: draft.staffIds.length > 0,
            hasHours: ownHoursCount > 0,
        });

        // 1. The service itself.
        let id = serviceId;
        if (id === null) {
            const res = await runAction(() => createService(input));
            if (!res?.ok) {
                setSaving(false);
                if (res) refused(res.error);
                return;
            }
            id = res.data.id;
            setCreatedId(id);
        } else if (parts.fields) {
            const target = id;
            const res = await runAction(() =>
                updateService(target, serviceUpdate(draft, currency)),
            );
            if (!res?.ok) {
                setSaving(false);
                if (res) refused(res.error);
                return;
            }
        }
        const savedId = id;
        // From here the service is saved. Each later part says so itself
        // when it is not, and `saved` keeps what the server still has.
        let nowSaved: ServiceDraft = {
            ...draft,
            staffIds: saved.staffIds,
            hours: saved.hours,
        };

        // 2. Who takes it: a call per person whose list changes.
        let whoError: string | null = null;
        if (staff && (creating ? draft.staffIds.length > 0 : parts.who)) {
            const who = await runAction(
                async () => ({
                    error: await setWho(savedId, draft.staffIds),
                }),
                { quiet: true },
            );
            whoError = who ? who.error : UNREACHED;
        }
        if (!whoError) nowSaved = { ...nowSaved, staffIds: draft.staffIds };

        // 3. Its own weekly hours: one call that replaces the set.
        let hoursError: string | null = null;
        const sendHours =
            rules !== null && (creating ? ownHoursCount > 0 : parts.hours);
        if (sendHours) {
            const toSend = rulesOf(draft.hours) ?? [];
            const res = await runAction(() => replaceRules(savedId, toSend), {
                quiet: true,
            });
            hoursError = res ? (res.ok ? null : res.error) : UNREACHED;
        }
        if (!hoursError) nowSaved = { ...nowSaved, hours: draft.hours };

        // A new service's draft started with these already in it, so what
        // is not saved has to differ from `saved` for Try again to send it.
        if (creating) {
            if (whoError) nowSaved = { ...nowSaved, staffIds: [] };
            if (hoursError) nowSaved = { ...nowSaved, hours: [] };
        }
        setSaved(nowSaved);
        setSaving(false);
        setHoursFailed(
            hoursError ? { created: added, reason: hoursError } : null,
        );

        if (whoError) {
            showError(
                added
                    ? "Added, but who takes it wasn't saved."
                    : "Saved, but who takes it didn't change.",
                whoError,
            );
        }
        if (hoursError) {
            // It stays on this page with the hours typed, and says so.
            if (!creating) router.refresh();
            return;
        }
        if (!whoError) showSuccess(message);
        if (added) router.replace(`/services/${savedId}`);
        else router.refresh();
    }

    async function remove(): Promise<ConfirmResult> {
        if (!serviceId) return;
        setSaving(true);
        // The confirm says a refusal, and one that never got there.
        const res = await runAction(() => archiveService(serviceId), {
            quiet: true,
        });
        if (!res?.ok) {
            setSaving(false);
            return { ok: false, error: res ? res.error : UNREACHED };
        }
        showSuccess("Service deleted.");
        router.push(SERVICES_HREF);
    }

    // Save is never off for "not filled in yet": pressing it says what is
    // wrong under each field and under the header, and goes to the first.
    const problemsShown = canEdit && bad && tried;
    const saveOff = saving || (!dirty && !isNew);
    const failedNotice = hoursFailed
        ? hoursNotSaved({
              created: hoursFailed.created,
              name: draft.name.trim() || "The service",
              reason: hoursFailed.reason,
          })
        : null;
    // Cmd/Ctrl+S: the page's one Save (it knows when there is nothing to).
    useSaveShortcut(() => void save(), canEdit);
    const crumb = service ? service.name : "New service";

    return (
        <main className="w-full pb-8">
            <div className="sticky top-[61px] z-10 border-b border-border bg-card px-4 py-3 dark:bg-background sm:px-[26px]">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link key="bookings" href="/bookings">
                            Bookings
                        </Link>,
                        <Link key="services" href={SERVICES_HREF}>
                            Services
                        </Link>,
                        crumb,
                    ]}
                    title={title}
                    badge={
                        <StatusBadge tone={pill.tone} hint={pill.hint}>
                            {pill.label}
                        </StatusBadge>
                    }
                    description={
                        <div
                            role="status"
                            className={cn(
                                "text-[12.5px]",
                                dirty && canEdit
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {stateLine({
                                isNew,
                                dirty: dirty && canEdit,
                                comingUp,
                            })}
                        </div>
                    }
                    actions={
                        canEdit ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {isNew ? null : (
                                    <Button
                                        type="button"
                                        variant="outline"

                                        disabled={saving}
                                        onClick={() =>
                                            set({ taking: !draft.taking })
                                        }
                                    >
                                        {takingLabel(draft.taking)}
                                    </Button>
                                )}
                                {dirty ? (
                                    <Button
                                        type="button"
                                        variant="outline"

                                        disabled={saving}
                                        onClick={() => setDraft(saved)}
                                    >
                                        Discard changes
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    disabled={saveOff}
                                    onClick={() => void save()}
                                    busy={saving}
                                    busyLabel="Saving…"
                                >
                                    {isNew ? "Add service" : "Save"}
                                </Button>
                            </div>
                        ) : (
                            <span className="text-[12.5px] text-muted-foreground">
                                {VIEW_ONLY}
                            </span>
                        )
                    }
                />
            </div>
            {problemsShown ? (
                <Notice tone="error" layout="banner">
                    {problems.map((p) => p.message).join(" ")}
                </Notice>
            ) : null}
            {failedNotice && canEdit ? (
                <Notice
                    tone="error"
                    layout="banner"
                    role="alert"
                    title={failedNotice.title}
                    action={
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void save()}
                            busy={saving}
                            busyLabel="Saving…"
                        >
                            Try again
                        </Button>
                    }
                >
                    {failedNotice.body}
                </Notice>
            ) : null}

            <fieldset
                ref={form}
                disabled={!canEdit || saving}
                className="m-0 flex min-w-0 flex-wrap items-start gap-4 border-0 px-4 pb-7 pt-4 sm:px-[26px]"
            >
                <legend className="sr-only">{title}</legend>
                <div className="grid min-w-0 flex-[1_1_420px] gap-3.5">
                    <WhatItIs
                        draft={draft}
                        set={set}
                        problem={problem}
                        leave={leave}
                    />
                    <TimeSection
                        draft={draft}
                        set={set}
                        problem={problem}
                        leave={leave}
                        hasStaff={hasStaff}
                        noStorefront={noStorefront}
                    />
                    <PriceSection
                        draft={draft}
                        set={set}
                        problem={problem}
                        leave={leave}
                        currency={currency}
                        savedDeposit={saved.deposit}
                        paymentsLock={paymentsLock}
                        payment={payment}
                    />
                    <WhoTakesIt
                        draft={draft}
                        set={set}
                        problem={problem}
                        leave={leave}
                        staff={staff}
                        people={people}
                    />

                    <MoreSettings
                        draft={draft}
                        set={set}
                        problem={problem}
                        leave={leave}
                        hoursProblem={hoursProblem}
                        startedFromOpening={
                            isNew && !hoursTouched && draft.hours.length > 0
                        }
                        forceOpen={(tried && inMore) || hoursFailed !== null}
                        serviceId={serviceId}
                        rules={rules}
                        canEdit={canEdit}
                        onDelete={() => setConfirmDelete(true)}
                    />
                </div>

                <aside className="grid min-w-0 max-w-full flex-[0_0_300px] gap-3.5">
                    <BookingPageCard
                        draft={draft}
                        set={set}
                        hasPage={hasPage}
                        hasHours={
                            rules === null ||
                            hasBookableHours(
                                saved.kind,
                                // A new one is judged by what Save will send.
                                (isNew ? draft : saved).hours.length,
                                (isNew ? draft : saved).staffIds.length,
                            )
                        }
                    />
                    <AtAGlance rows={glance(draft, usage, currency)} />
                    <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                        Changes apply to bookings made after you save. Bookings
                        already made keep their time and price.
                    </p>
                </aside>
            </fieldset>

            {guard.dialog}
            {service ? (
                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title={`Delete ${service.name}?`}
                    description="It leaves your services and can no longer be booked. Bookings already made keep it. To stop bookings for now, choose Stop taking bookings instead. This cannot be undone."
                    confirmLabel="Delete service"
                    keepLabel="Keep service"
                    onConfirm={remove}
                />
            ) : null}
        </main>
    );
}
