"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLeaveGuard } from "@/components/shared/use-leave-guard";
import type { PlanLock } from "@/lib/billing/access";
import { joinAnd } from "@/lib/editor-shell/state";
import {
    archiveService,
    createService,
    updateService,
} from "@/lib/services/actions";
import type { AvailabilityRule, Service } from "@/lib/services/service";
import { takingLabel } from "@/lib/services/service-cards";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    changedSections,
    draftOf,
    glance,
    hasBookableHours,
    savedMessage,
    serviceInput,
    serviceProblems,
    serviceUpdate,
    staffFor,
    stateLine,
    statePill,
    TREATMENT_NEEDS_STOREFRONT,
    VIEW_ONLY,
} from "@/lib/services/service-editor";
import type { ServiceUsage } from "@/lib/services/usage";
import { setStaffServices } from "@/lib/staff/actions";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";

import { StatusBadge } from "@/components/shared/status-badge";
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
 * One Save, in the header, applies to bookings made after it.
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
    const isNew = service === null;
    const [saved, setSaved] = useState(() =>
        draftOf(service, service ? staffFor(service.id, people) : [], timezone),
    );
    const [draft, setDraft] = useState(saved);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const set = (patch: Partial<ServiceDraft>) =>
        setDraft((d) => ({ ...d, ...patch }));

    // The API said there is no storefront to sell a treatment from (E10),
    // though the page couldn't tell: said under Time from then on.
    const [refusedStorefront, setRefusedStorefront] = useState(false);
    // A service already a treatment keeps saving when its storefront has
    // gone since; the booking page refuses it then (E9).
    const wasTreatment = (service?.visits ?? 1) > 1;
    const noStorefront =
        !wasTreatment && (hasStorefront === false || refusedStorefront);

    const changed = changedSections(saved, draft);
    const dirty = changed.length > 0;
    const problems = serviceProblems(draft, hasStaff, noStorefront);
    const bad = problems.length > 0;
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
        if (!canEdit || bad || saving || (!dirty && !isNew)) return;
        setSaving(true);
        const input = serviceInput(draft, currency);
        const message = savedMessage({
            isNew,
            name: input.name,
            kind: draft.kind,
            comingUp,
            hasPerson: draft.staffIds.length > 0,
        });
        if (service) {
            const res = await updateService(
                service.id,
                serviceUpdate(draft, currency),
            );
            if (!res.ok) {
                setSaving(false);
                refused(res.error);
                return;
            }
            const whoError = staff
                ? await setWho(service.id, draft.staffIds)
                : null;
            setSaving(false);
            router.refresh();
            if (whoError) {
                setSaved({ ...draft, staffIds: saved.staffIds });
                showError(`Saved, but who takes it didn't change: ${whoError}`);
                return;
            }
            setSaved(draft);
            showSuccess(message);
            return;
        }
        const res = await createService(input);
        if (!res.ok) {
            setSaving(false);
            refused(res.error);
            return;
        }
        const whoError = await setWho(res.data.id, draft.staffIds);
        if (whoError) {
            showError(`Added, but who takes it didn't save: ${whoError}`);
        } else {
            showSuccess(message);
        }
        router.replace(`/services/${res.data.id}`);
    }

    async function remove() {
        if (!service) return;
        setSaving(true);
        const res = await archiveService(service.id);
        if (!res.ok) {
            setSaving(false);
            showError(res.error);
            return;
        }
        showSuccess(`${service.name} deleted`);
        router.push(SERVICES_HREF);
    }

    const saveOff = bad || (!dirty && !isNew) || saving;
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
                                    ? "text-brand"
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
                                >
                                    {saving
                                        ? "Saving…"
                                        : isNew
                                          ? "Add service"
                                          : "Save changes"}
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
            {canEdit && bad && (dirty || isNew) && draft.name.trim() ? (
                <Notice tone="error" layout="banner">
                    {problems.join(" ")}
                </Notice>
            ) : null}

            <fieldset
                disabled={!canEdit || saving}
                className="m-0 flex min-w-0 flex-wrap items-start gap-4 border-0 px-4 pb-7 pt-4 sm:px-[26px]"
            >
                <legend className="sr-only">{title}</legend>
                <div className="grid min-w-0 flex-[1_1_420px] gap-3.5">
                    <WhatItIs draft={draft} set={set} />
                    <TimeSection
                        draft={draft}
                        set={set}
                        hasStaff={hasStaff}
                        noStorefront={noStorefront}
                    />
                    <PriceSection
                        draft={draft}
                        set={set}
                        currency={currency}
                        savedDeposit={saved.deposit}
                        paymentsLock={paymentsLock}
                        payment={payment}
                    />
                    <WhoTakesIt
                        draft={draft}
                        set={set}
                        staff={staff}
                        people={people}
                    />

                    <MoreSettings
                        draft={draft}
                        set={set}
                        serviceId={service?.id ?? null}
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
                                rules.length,
                                saved.staffIds.length,
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
                    description="It leaves your services and can no longer be booked. Bookings already made keep it. This cannot be undone — to stop bookings for now, choose Stop taking bookings instead."
                    confirmLabel="Delete service"
                    onConfirm={() => void remove()}
                />
            ) : null}
        </main>
    );
}
