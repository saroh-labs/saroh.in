"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import {
    archiveService,
    createService,
    updateService,
} from "@/lib/services/actions";
import type { Service } from "@/lib/services/service";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    changeNote,
    fromMinor,
    serviceRefusal,
    toMinor,
    wholeNumber,
} from "@/lib/services/service-editor";
import { setStaffServices } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

const btn = "h-[38px] rounded-[9px] px-4 text-[14px]";

export type ServiceTarget = { service: Service | null } | null;

function draftOf(service: Service | null, staff: StaffView[]): ServiceDraft {
    if (!service) {
        return {
            kind: "one",
            name: "",
            minutes: "60",
            gap: "15",
            price: "",
            places: "",
            staffIds: [],
        };
    }
    return {
        kind: service.capacity > 1 ? "class" : "one",
        name: service.name,
        minutes: String(service.durationMinutes),
        gap: String(service.bufferAfterMinutes),
        price: fromMinor(service.priceCents),
        places: service.capacity > 1 ? String(service.capacity) : "",
        staffIds: staff
            .filter((p) => p.serviceIds.includes(service.id))
            .map((p) => p.id),
    };
}

/**
 * New service / Edit (the design's dialog): one-to-one or class, length and
 * the gap after, price, places for a class, and who takes it. Refuses no
 * name, under 15 minutes, nobody, or a class under 2 places. A price or
 * length change says it only reaches new bookings. Everything else a
 * service has — description, where it happens, GST, a class's weekly times
 * — stays in the full editor, one link away.
 */
export function ServiceDialog({
    target,
    staff,
    timezone,
    currency,
    comingUp,
    onClose,
}: {
    target: ServiceTarget;
    staff: StaffView[];
    timezone: string;
    currency: string;
    /** Bookings still to come per service, for the price note. */
    comingUp: Record<string, number>;
    onClose: () => void;
}) {
    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[calc(100vh-40px)] max-w-[480px] gap-0 overflow-y-auto rounded-[14px] px-5 py-[18px]">
                {target ? (
                    <Form
                        key={target.service?.id ?? "new"}
                        service={target.service}
                        staff={staff}
                        timezone={timezone}
                        currency={currency}
                        comingUp={comingUp}
                        onClose={onClose}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function Form({
    service,
    staff,
    timezone,
    currency,
    comingUp,
    onClose,
}: {
    service: Service | null;
    staff: StaffView[];
    timezone: string;
    currency: string;
    comingUp: Record<string, number>;
    onClose: () => void;
}) {
    const router = useRouter();
    const ids = {
        name: useId(),
        mins: useId(),
        gap: useId(),
        price: useId(),
        places: useId(),
        kind: useId(),
        who: useId(),
    };
    const people = staff.filter((p) => p.status === "ACTIVE");
    const [draft, setDraft] = useState(() => draftOf(service, staff));
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<ServiceDraft>) =>
        setDraft((d) => ({ ...d, ...patch }));
    const bad = serviceRefusal(draft, people.length > 0);
    const change = changeNote(
        service
            ? {
                  priceCents: service.priceCents,
                  durationMinutes: service.durationMinutes,
              }
            : null,
        draft,
        service ? (comingUp[service.id] ?? 0) : 0,
    );
    const note =
        bad ??
        [
            draft.kind === "class"
                ? `Classes run at set times — ${service ? "change them" : "set them"} in the full editor.`
                : people.length
                  ? `Fills the free time of whoever takes it, in ${wholeNumber(draft.minutes)}-minute slots.`
                  : "Nobody is on the diary yet, so it books in its own weekly hours.",
            change,
        ]
            .filter(Boolean)
            .join(" ");

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

    async function save() {
        if (bad || saving) return;
        setSaving(true);
        const fields = {
            name: draft.name.trim(),
            durationMinutes: wholeNumber(draft.minutes),
            bufferAfterMinutes: wholeNumber(draft.gap),
            capacity: draft.kind === "class" ? wholeNumber(draft.places) : 1,
            priceCents: toMinor(draft.price) ?? 0,
        };
        if (service) {
            const before = {
                name: service.name,
                durationMinutes: service.durationMinutes,
                bufferAfterMinutes: service.bufferAfterMinutes,
                capacity: service.capacity,
                priceCents: service.priceCents ?? 0,
            };
            const beforeWho = draftOf(service, staff).staffIds;
            const res = await updateService(service.id, fields);
            const whoError = res.ok
                ? await setWho(service.id, draft.staffIds)
                : null;
            setSaving(false);
            if (!res.ok || whoError) {
                showError(res.ok ? (whoError ?? "") : res.error);
                router.refresh();
                return;
            }
            onClose();
            router.refresh();
            showUndo("Saved. New bookings use it now.", () => {
                void updateService(service.id, before)
                    .then(async (back) => {
                        if (!back.ok) return showError(back.error);
                        const err = await setWho(service.id, beforeWho);
                        if (err) showError(err);
                    })
                    .then(() => router.refresh());
            });
            return;
        }
        const res = await createService({
            ...fields,
            currency,
            timezone,
            locationType: "IN_PERSON",
        });
        if (!res.ok) {
            setSaving(false);
            showError(res.error);
            return;
        }
        const whoError = await setWho(res.data.id, draft.staffIds);
        setSaving(false);
        if (whoError) showError(whoError);
        onClose();
        router.refresh();
        showUndo(
            draft.kind === "class"
                ? `${fields.name} added — set its weekly times in the full editor.`
                : `${fields.name} added — it's bookable in free time now.`,
            () => {
                void archiveService(res.data.id).then((back) => {
                    if (!back.ok) showError(back.error);
                    router.refresh();
                });
            },
        );
    }

    const field = "mt-[5px] h-9 rounded-[8px] text-[13px] font-normal";
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <DialogTitle className="mb-3 font-display text-[17px] font-semibold tracking-[-0.02em]">
                {service ? `Edit ${service.name}` : "New service"}
            </DialogTitle>
            <DialogDescription className="sr-only">
                What people can book: its length, price and who takes it.
            </DialogDescription>
            <div
                role="radiogroup"
                aria-label="Kind"
                className="mb-3 flex gap-1.5"
            >
                <Chip
                    on={draft.kind === "one"}
                    onClick={() => set({ kind: "one" })}
                >
                    One-to-one
                </Chip>
                <Chip
                    on={draft.kind === "class"}
                    onClick={() => set({ kind: "class" })}
                >
                    Class
                </Chip>
            </div>
            <Label htmlFor={ids.name} className="text-[12.5px] font-medium">
                Name
            </Label>
            <Input
                id={ids.name}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                className={field}
                autoComplete="off"
            />
            <div className="mt-2.5 flex flex-wrap gap-2.5">
                <div className="flex-[1_1_100px]">
                    <Label
                        htmlFor={ids.mins}
                        className="text-[12.5px] font-medium"
                    >
                        Length (min)
                    </Label>
                    <Input
                        id={ids.mins}
                        inputMode="numeric"
                        value={draft.minutes}
                        onChange={(e) =>
                            set({
                                minutes: e.target.value.replace(/[^0-9]/g, ""),
                            })
                        }
                        className={field}
                    />
                </div>
                <div className="flex-[1_1_100px]">
                    <Label
                        htmlFor={ids.gap}
                        className="text-[12.5px] font-medium"
                    >
                        Gap after (min)
                    </Label>
                    <Input
                        id={ids.gap}
                        inputMode="numeric"
                        value={draft.gap}
                        onChange={(e) =>
                            set({ gap: e.target.value.replace(/[^0-9]/g, "") })
                        }
                        className={field}
                    />
                </div>
                <div className="flex-[1_1_100px]">
                    <Label
                        htmlFor={ids.price}
                        className="text-[12.5px] font-medium"
                    >
                        Price (₹)
                    </Label>
                    <Input
                        id={ids.price}
                        inputMode="decimal"
                        value={draft.price}
                        placeholder="Free"
                        onChange={(e) => set({ price: e.target.value })}
                        className={field}
                    />
                </div>
            </div>
            {draft.kind === "class" ? (
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                    <div className="flex-[1_1_100px]">
                        <Label
                            htmlFor={ids.places}
                            className="text-[12.5px] font-medium"
                        >
                            Places
                        </Label>
                        <Input
                            id={ids.places}
                            inputMode="numeric"
                            value={draft.places}
                            onChange={(e) =>
                                set({
                                    places: e.target.value.replace(
                                        /[^0-9]/g,
                                        "",
                                    ),
                                })
                            }
                            className={field}
                        />
                    </div>
                    <div className="flex-[2_1_200px] self-end pb-2 text-[11.5px] text-muted-foreground">
                        A class takes a class from a pack or a membership, or
                        its price.
                    </div>
                </div>
            ) : null}
            {people.length ? (
                <>
                    <Eyebrow id={ids.who} className="mb-1.5 mt-3">
                        Who takes it
                    </Eyebrow>
                    <div
                        role="group"
                        aria-labelledby={ids.who}
                        className="flex flex-wrap gap-1.5"
                    >
                        {people.map((p) => {
                            const on = draft.staffIds.includes(p.id);
                            return (
                                <Chip
                                    key={p.id}
                                    on={on}
                                    role={undefined}
                                    aria-checked={undefined}
                                    aria-pressed={on}
                                    onClick={() =>
                                        set({
                                            staffIds: on
                                                ? draft.staffIds.filter(
                                                      (id) => id !== p.id,
                                                  )
                                                : [...draft.staffIds, p.id],
                                        })
                                    }
                                >
                                    {p.name}
                                    {p.title ? ` · ${p.title}` : ""}
                                </Chip>
                            );
                        })}
                    </div>
                </>
            ) : null}
            <p
                role={bad ? "alert" : "status"}
                className={cn(
                    "mt-3 text-[12.5px] leading-[1.5]",
                    bad
                        ? "text-destructive-subtle-foreground"
                        : change
                          ? "text-brand-subtle-foreground"
                          : "text-muted-foreground",
                )}
            >
                {note}
            </p>
            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
                <Link
                    href={service ? `/services/${service.id}` : "/services/new"}
                    className="mr-auto text-[12.5px] font-semibold text-brand hover:text-foreground"
                >
                    {service ? "The full editor" : "Use the full form"}
                </Link>
                <Button
                    type="button"
                    variant="outline"
                    className={btn}
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    className={btn}
                    disabled={Boolean(bad) || saving}
                >
                    {saving ? "Saving…" : service ? "Save" : "Add service"}
                </Button>
            </div>
        </form>
    );
}
