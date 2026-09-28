"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useState } from "react";

import { StatePill } from "@/components/bookings/calendar/parts";
import { LeaveDialog } from "@/components/commerce/product-editor-v2/editor-parts";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLeaveGuard } from "@/components/sites/use-leave-guard";
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
import type { StaffView } from "@/lib/staff/types";

import { AtAGlance } from "./at-a-glance";
import {
    BookingPageCard,
    PriceSection,
    TimeSection,
    WhatItIs,
    WhoTakesIt,
} from "./editor-sections";
import { MoreSettings } from "./more-settings";

const BTN = "h-[38px] rounded-[9px] px-4 text-[14px]";
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
    kindUp,
    hasPage,
    hasStorefront = null,
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
    /** Kind up front; otherwise under More settings. */
    kindUp: boolean;
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
    /** A storefront to sell treatments from (E10); null when unknown. */
    hasStorefront?: boolean | null;
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
    const [leaving, setLeaving] = useState<string | null>(null);
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

    useLeaveGuard(canEdit && dirty && !saving);

    /** A link out of the page asks first while there are unsaved changes. */
    const guard = (href: string) => (e: MouseEvent) => {
        if (canEdit && dirty && !saving) {
            e.preventDefault();
            setLeaving(href);
        }
    };

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
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px] text-[12px]"
            >
                <Link
                    href="/bookings"
                    onClick={guard("/bookings")}
                    className="text-muted-foreground hover:text-foreground"
                >
                    Bookings
                </Link>
                <Chevron />
                <Link
                    href={SERVICES_HREF}
                    onClick={guard(SERVICES_HREF)}
                    className="text-muted-foreground hover:text-foreground"
                >
                    Services
                </Link>
                <Chevron />
                <span aria-current="page" className="min-w-0 truncate">
                    {crumb}
                </span>
            </nav>

            <div className="sticky top-[61px] z-10 flex flex-wrap items-center gap-2.5 border-b border-border bg-background px-6 py-3 max-[759px]:px-4">
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="m-0 min-w-0 break-words font-display text-[22px] font-semibold tracking-[-0.02em]">
                            {title}
                        </h1>
                        <StatePill label={pill.label} tone={pill.tone} />
                    </div>
                    <div
                        role="status"
                        className={cn(
                            "mt-0.5 text-[12.5px]",
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
                </div>
                {canEdit ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {isNew ? null : (
                            <Button
                                type="button"
                                variant="outline"
                                className={BTN}
                                disabled={saving}
                                onClick={() => set({ taking: !draft.taking })}
                            >
                                {takingLabel(draft.taking)}
                            </Button>
                        )}
                        {dirty ? (
                            <Button
                                type="button"
                                variant="outline"
                                className={BTN}
                                disabled={saving}
                                onClick={() => setDraft(saved)}
                            >
                                Discard changes
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            className={BTN}
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
                )}
            </div>
            {canEdit && bad && (dirty || isNew) && draft.name.trim() ? (
                <div
                    role="alert"
                    className="bg-destructive-subtle px-6 py-[9px] text-[12.5px] text-destructive-subtle-foreground max-[759px]:px-4"
                >
                    {problems.join(" ")}
                </div>
            ) : null}

            <fieldset
                disabled={!canEdit || saving}
                className="m-0 flex min-w-0 flex-wrap items-start gap-4 border-0 px-6 pb-7 pt-4 max-[759px]:px-4"
            >
                <legend className="sr-only">{title}</legend>
                <div className="grid min-w-0 flex-[1_1_420px] gap-3.5">
                    <WhatItIs draft={draft} set={set} kindUp={kindUp} />
                    <TimeSection
                        draft={draft}
                        set={set}
                        hasStaff={hasStaff}
                        noStorefront={noStorefront}
                    />
                    <PriceSection draft={draft} set={set} currency={currency} />
                    <WhoTakesIt
                        draft={draft}
                        set={set}
                        staff={staff}
                        people={people}
                    />

                    <MoreSettings
                        draft={draft}
                        set={set}
                        kindHere={!kindUp}
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
                    />
                    <AtAGlance rows={glance(draft, usage, currency)} />
                    <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                        Changes apply to bookings made after you save. Bookings
                        already made keep their time and price.
                    </p>
                </aside>
            </fieldset>

            <LeaveDialog
                open={leaving !== null}
                onOpenChange={(open) => {
                    if (!open) setLeaving(null);
                }}
                href={leaving ?? SERVICES_HREF}
                creating={isNew}
                sections={changed}
            />
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

function Chevron() {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-3 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M9.5 5 L16.5 12 L9.5 19" />
        </svg>
    );
}
