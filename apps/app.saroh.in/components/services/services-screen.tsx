"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatePill } from "@/components/bookings/calendar/parts";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { formatMoney } from "@/lib/format/money";
import { updateService } from "@/lib/services/actions";
import type { Service } from "@/lib/services/service";
import type { StaffView } from "@/lib/staff/types";

import type { ServiceTarget } from "./service-dialog";
import { ServiceDialog } from "./service-dialog";

export interface ServiceUsage {
    /** Places or bookings this week, cancelled ones left out. */
    thisWeek: number;
    /** Bookings (or class starts) still to come. */
    comingUp: number;
}

const btn = "h-[38px] rounded-[9px] px-4 text-[14px]";

/**
 * Bookings › Services (U16, the design's `?view=services`): what people can
 * book, as cards — kind, price, length and the gap after, places, who
 * takes it, and how it is being used. New / Edit in a dialog; Pause takes a
 * service off the booking page and keeps the bookings already made, with
 * Undo. The full editor keeps everything else a service has.
 */
export function ServicesScreen({
    services,
    staff,
    usage,
    timezone,
    currency,
    canEdit,
}: {
    services: Service[];
    /** Null when the staff read failed. */
    staff: StaffView[] | null;
    /** Null when the bookings read failed. */
    usage: Record<string, ServiceUsage> | null;
    timezone: string;
    currency: string;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [target, setTarget] = useState<ServiceTarget>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const on = services.filter((s) => s.status === "ACTIVE").length;
    const paused = services.length - on;
    const takers = (id: string) =>
        (staff ?? []).filter(
            (p) => p.status === "ACTIVE" && p.serviceIds.includes(id),
        );

    async function toggle(s: Service) {
        const wasOn = s.status === "ACTIVE";
        setBusy(s.id);
        const res = await updateService(s.id, {
            status: wasOn ? "ARCHIVED" : "ACTIVE",
        });
        setBusy(null);
        if (!res.ok) return showError(res.error);
        router.refresh();
        showUndo(
            wasOn
                ? `${s.name} paused. It's off the booking page; bookings already made still happen.`
                : `${s.name} is bookable again.`,
            () => {
                void updateService(s.id, {
                    status: wasOn ? "ACTIVE" : "ARCHIVED",
                }).then((back) => {
                    if (!back.ok) showError(back.error);
                    router.refresh();
                });
            },
        );
    }

    return (
        <>
            <div className="mb-1 flex flex-wrap items-center gap-3">
                <h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                    Services
                </h1>
                <span className="ml-auto text-[12.5px] text-muted-foreground">
                    {on} on the booking page
                    {paused ? ` · ${paused} paused` : ""}
                </span>
                {canEdit ? (
                    <Button
                        className="h-[38px] rounded-[9px] px-4 text-[13px]"
                        onClick={() => setTarget({ service: null })}
                    >
                        New service
                    </Button>
                ) : null}
            </div>
            <p className="mb-3.5 max-w-[70ch] text-[12.5px] text-muted-foreground">
                What people can book. One-to-one services fill a person&apos;s
                free time; classes run at set times with a number of places.
                Changing a price only affects bookings made after.
            </p>
            {canEdit ? null : (
                <ReadOnlyNote>
                    Your role can see these services but not change them.
                </ReadOnlyNote>
            )}
            {services.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-border px-5 py-8 text-center">
                    <p className="text-[14px] font-semibold">No services yet</p>
                    <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-muted-foreground">
                        Add what people can book — a one-to-one session or a
                        class — and it shows on your booking page.
                    </p>
                </div>
            ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
                    {services.map((s) => {
                        const isClass = s.capacity > 1;
                        const live = s.status === "ACTIVE";
                        const price = s.priceCents
                            ? formatMoney(s.priceCents, s.currency ?? currency)
                            : "Free";
                        const who = takers(s.id);
                        const use = usage?.[s.id];
                        return (
                            <li
                                key={s.id}
                                className={cn(
                                    "rounded-[12px] border bg-card px-4 py-3.5",
                                    live
                                        ? "border-border"
                                        : "border-dashed border-border-strong",
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-2.5 shrink-0 rounded-full",
                                            isClass
                                                ? "bg-diary-class"
                                                : "bg-diary-one",
                                        )}
                                    />
                                    <Link
                                        href={`/services/${s.id}`}
                                        className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground hover:text-brand"
                                    >
                                        {s.name}
                                    </Link>
                                    {live ? null : (
                                        <StatePill
                                            label="Paused"
                                            tone="neutral"
                                        />
                                    )}
                                    <StatePill
                                        label={isClass ? "Class" : "One-to-one"}
                                        tone={isClass ? "draft" : "success"}
                                    />
                                </div>
                                <div
                                    className={cn(
                                        "mt-2.5 font-display text-[20px] font-semibold tabular-nums tracking-[-0.02em]",
                                        !live && "text-muted-foreground",
                                    )}
                                >
                                    {price}
                                    {isClass && s.priceCents
                                        ? " or a pack class"
                                        : ""}
                                </div>
                                <div className="mt-1 text-[12.5px]">
                                    {s.durationMinutes} min ·{" "}
                                    {s.bufferAfterMinutes
                                        ? `${s.bufferAfterMinutes} min gap after`
                                        : "no gap after"}
                                    {isClass ? ` · ${s.capacity} places` : ""}
                                </div>
                                <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                                    {staff === null
                                        ? "Who takes it couldn't be loaded"
                                        : who.length
                                          ? `With ${who.map((p) => p.name.split(" ")[0]).join(", ")}`
                                          : "Nobody takes it yet — it books in its own hours"}
                                </div>
                                <div className="mt-2 border-t border-border/60 pt-2 text-[12px] text-muted-foreground">
                                    {!live
                                        ? `Paused — hidden from the booking page${use?.comingUp ? `; ${use.comingUp === 1 ? "its 1 booking still to come still happens" : `its ${use.comingUp} bookings still to come still happen`}` : ""}`
                                        : use
                                          ? `${use.thisWeek} booked this week · ${use.comingUp} still to come`
                                          : "Bookings couldn't be counted"}
                                </div>
                                {canEdit ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            className={btn}
                                            onClick={() =>
                                                setTarget({ service: s })
                                            }
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className={btn}
                                            disabled={busy === s.id}
                                            onClick={() => void toggle(s)}
                                        >
                                            {live
                                                ? "Pause"
                                                : "Put back on sale"}
                                        </Button>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
            <ServiceDialog
                target={target}
                staff={staff ?? []}
                timezone={timezone}
                currency={currency}
                comingUp={Object.fromEntries(
                    Object.entries(usage ?? {}).map(([id, u]) => [
                        id,
                        u.comingUp,
                    ]),
                )}
                onClose={() => setTarget(null)}
            />
        </>
    );
}
