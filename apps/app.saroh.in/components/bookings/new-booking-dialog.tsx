"use client";

import { formatDateTime } from "@/lib/format/datetime";
import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { TimePicker } from "@/components/bookings/sheets/time-picker";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { bookVisit } from "@/lib/services/actions";
import type { VisitToBook } from "@/lib/services/treatment";

/**
 * "Book visit N" of a treatment (E10): the service, the customer and the
 * order are set, so only the time is chosen, from the one time picker
 * (U3). The visit is paid for on its order, so no pack or payment is
 * asked. A new booking of anything else is New booking's journey (U8,
 * `new-booking/new-booking-host.tsx`).
 */
export function NewBookingDialog({
    services,
    visit,
    triggerClassName,
    primaryTrigger = false,
}: {
    /** The treatment's service: the first is booked. */
    services: {
        id: string;
        name: string;
        timezone: string;
        minutes: number;
        priceCents: number | null;
    }[];
    /** Kept for the callers that pass it; a visit asks nothing of it. */
    people?: unknown;
    /** Book this treatment's next visit (E10), on its order. */
    visit: VisitToBook;
    triggerClassName?: string;
    /**
     * "Book visit N" as the page's primary action (B14, Order Detail's
     * header) rather than the booking page's outline button.
     */
    primaryTrigger?: boolean;
}) {
    const router = useRouter();
    const service = services.at(0);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tried, setTried] = useState(false);
    const [picked, setPicked] = useState<string | null>(null);
    const [staffId, setStaffId] = useState<string | null>(null);
    const [taken, setTaken] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    function close() {
        setOpen(false);
        setPicked(null);
        setStaffId(null);
        setTaken(null);
        setTried(false);
    }

    async function save() {
        setTried(true);
        if (saving || !service || !picked) return;
        const res = await runAction(
            () =>
                bookVisit(visit.orderId, {
                    visitNumber: visit.visitNumber,
                    startAt: picked,
                    ...(staffId ? { staffId } : {}),
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok && res.plan) {
            // At the plan's bookings-a-month limit (U13): its notice, and
            // the time stays picked for when there's room.
            showPlanRefusal(res.plan);
            return;
        }
        if (!res.ok) {
            if (res.field === "startAt") {
                // The time went while this was open: said in the picker,
                // which reads the times again.
                setTaken(picked);
                setPicked(null);
                setReload((n) => n + 1);
                return;
            }
            showError(res.error);
            return;
        }
        showSuccess(
            "Visit booked.",
            `Visit ${visit.visitNumber} of ${visit.visits} for ${visit.who}, ${formatDateTime(picked, service.timezone, { weekday: "short" })}.`,
        );
        close();
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title={`Book visit ${visit.visitNumber} of ${visit.visits}`}
            description={`${service?.name ?? "The treatment"} for ${visit.who}. It's paid for on order #${visit.orderNumber}, so there's only the time to choose.`}
            pending={saving}
            dirty={picked !== null ? true : undefined}
            onOpen={() => setOpen(true)}
            onClose={close}
            trigger={
                <Button
                    data-ph-unmask=""
                    variant={primaryTrigger ? "default" : "outline"}
                    size={primaryTrigger ? "default" : "sm"}
                    disabled={!service}
                    className={triggerClassName}
                >
                    Book visit {visit.visitNumber}
                </Button>
            }
        >
            <FormSheetBody className="gap-4">
                {service ? (
                    <TimePicker
                        serviceId={service.id}
                        timezone={service.timezone}
                        value={picked}
                        onChange={(at, person) => {
                            setPicked(at);
                            setStaffId(person?.id ?? null);
                            if (at) setTaken(null);
                        }}
                        withChips={false}
                        taken={taken}
                        reloadKey={reload}
                    />
                ) : null}
                <p className="text-[12px] leading-[1.5] text-muted-foreground">
                    A visit is never billed on its own: the treatment was sold
                    once, on order #{visit.orderNumber}.
                </p>
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Book visit"
                savingLabel="Booking…"
                pending={saving}
                note={
                    tried && !picked ? (
                        <p
                            role="alert"
                            className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            Pick a time.
                        </p>
                    ) : null
                }
                onSubmit={save}
            />
        </FormSheet>
    );
}
