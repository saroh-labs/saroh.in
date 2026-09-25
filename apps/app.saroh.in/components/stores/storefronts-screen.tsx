"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";
import { formatTime, TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { mayAddStorefront } from "@/lib/business-limits";
import { providerName } from "@/lib/payments/providers";
import {
    newStorefrontHref,
    storefrontDetailsHref,
    storefrontPeopleHref,
} from "@/lib/stores/links";
import {
    closeStorefront,
    updateStorefront,
} from "@/lib/stores/storefront-actions";
import type {
    OpeningHoursDay,
    StorefrontInput,
    StorefrontKind,
    StorefrontSettings,
    StorefrontSummary,
    Weekday,
} from "@/lib/stores/storefronts";

/**
 * The currencies offered before a storefront's first order: the ones Saroh's
 * payment providers settle in. A storefront already on another code keeps it
 * — it is added to the list rather than hidden.
 */
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"];

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

const DAYS: { key: Weekday; label: string }[] = [
    { key: "MON", label: "Monday" },
    { key: "TUE", label: "Tuesday" },
    { key: "WED", label: "Wednesday" },
    { key: "THU", label: "Thursday" },
    { key: "FRI", label: "Friday" },
    { key: "SAT", label: "Saturday" },
    { key: "SUN", label: "Sunday" },
];

/** A week to start from when a shop has never saved one. */
const DEFAULT_WEEK: OpeningHoursDay[] = DAYS.map(({ key }) => ({
    day: key,
    open: "09:00",
    close: "18:00",
    closed: key === "SUN",
}));

const ordersLabel = (n: number) =>
    n === 0 ? "no orders yet" : n === 1 ? "1 order" : `${n} orders`;

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;

/**
 * Sell → Storefronts, after the "Saroh Storefront Settings" design: every
 * storefront on the left, the chosen one's own settings on the right.
 *
 * Every control saves on its own — a switch when it is flipped, a field when
 * its Save is pressed — so there is no page-wide save to forget.
 */
export function StorefrontsScreen({
    businessName,
    storefronts,
    selected,
    canCreate,
    canEdit,
    canClose,
}: {
    businessName: string;
    storefronts: StorefrontSummary[];
    /** `null` when the chosen storefront could not be read. */
    selected: StorefrontSettings | null;
    canCreate: boolean;
    canEdit: boolean;
    canClose: boolean;
}) {
    // One storefront per business for now (ADR-006): the screen is about
    // "your storefront", and a list and a New button appear only for a
    // business that already has more than one, or may still add one.
    const many = storefronts.length > 1;
    const title = many ? "Storefronts" : "Storefront";
    const header = (
        <PageHeader
            breadcrumb={["Sell", title]}
            title={title}
            actions={
                canCreate &&
                storefronts.length > 0 &&
                mayAddStorefront(storefronts.length) ? (
                    <Button asChild variant="brand">
                        <Link href={newStorefrontHref}>New storefront</Link>
                    </Button>
                ) : undefined
            }
        />
    );

    if (storefronts.length === 0) {
        return (
            <>
                {header}
                <EmptyState
                    title="No storefront yet"
                    description={`${businessName} has Commerce turned on but nowhere to sell from. A storefront is where a catalogue meets a checkout — a shop counter, an online store, a market stall.`}
                    action={
                        canCreate ? (
                            <Button asChild variant="brand">
                                <Link href={newStorefrontHref}>
                                    Create a storefront
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            </>
        );
    }

    return (
        <>
            {header}
            <div className="flex flex-wrap items-start gap-5">
                {many ? (
                    <StorefrontList
                        storefronts={storefronts}
                        selectedId={selected?.id ?? null}
                    />
                ) : null}
                <div
                    className={cn(
                        "flex min-w-0 flex-[1_1_420px] flex-col gap-4",
                        !many && "max-w-[860px]",
                    )}
                >
                    {selected ? (
                        // Keyed by storefront, so picking another one starts
                        // from its own values rather than the last one's edits.
                        <StorefrontDetail
                            key={selected.id}
                            store={selected}
                            businessName={businessName}
                            canEdit={canEdit}
                            canClose={canClose}
                        />
                    ) : (
                        <FailedState
                            title="This storefront could not be loaded"
                            description="Its settings could not be read, so none are shown rather than guessed. Nothing has been changed."
                        />
                    )}
                </div>
            </div>
        </>
    );
}

function StorefrontList({
    storefronts,
    selectedId,
}: {
    storefronts: StorefrontSummary[];
    selectedId: string | null;
}) {
    return (
        <nav
            aria-label="Storefronts"
            className="min-w-0 max-w-[280px] flex-[0_1_236px] overflow-hidden rounded-xl border border-border max-sm:max-w-none max-sm:flex-[1_1_100%]"
        >
            <p className="border-b border-border px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {storefronts.length === 1
                    ? "1 storefront"
                    : `${storefronts.length} storefronts`}
            </p>
            <ul className="flex flex-col gap-0.5 p-1.5">
                {storefronts.map((s) => {
                    const on = s.id === selectedId;
                    return (
                        <li key={s.id}>
                            <Link
                                href={`/commerce/storefronts?storefront=${s.id}`}
                                scroll={false}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "flex min-h-11 items-center gap-[9px] rounded-lg px-[9px] py-[7px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on ? "bg-muted" : "hover:bg-muted/60",
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        {ordersLabel(s.orderCount)}
                                    </span>
                                </span>
                                <Badge
                                    variant={s.paused ? "warning" : "neutral"}
                                    className="shrink-0"
                                >
                                    {s.paused
                                        ? "Paused"
                                        : s.kind === "SHOP"
                                          ? "Shop"
                                          : "Online"}
                                </Badge>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section
            aria-label={title}
            className="rounded-xl border border-border px-5 py-[18px]"
        >
            <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {title}
            </h2>
            <div className="flex flex-col gap-5">{children}</div>
        </section>
    );
}

function Note({ id, children }: { id?: string; children: ReactNode }) {
    return (
        <p
            id={id}
            className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
        >
            {children}
        </p>
    );
}

interface SectionProps {
    store: StorefrontSettings;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: (fn: (s: StorefrontSettings) => StorefrontSettings) => void;
}

function StorefrontDetail({
    store: initial,
    businessName,
    canEdit,
    canClose,
}: {
    store: StorefrontSettings;
    businessName: string;
    canEdit: boolean;
    canClose: boolean;
}) {
    const router = useRouter();
    const [store, setStore] = useState(initial);
    const [pending, startTransition] = useTransition();

    /**
     * One save path for every control. The screen shows what the API
     * returned, not what was asked for — so a value the server normalised
     * ("18" → "18.00") or refused is what the merchant sees afterwards.
     */
    const save: Saver = (input, said, onFail) => {
        startTransition(async () => {
            const res = await updateStorefront(store.id, input);
            if (!res.ok) {
                onFail?.();
                showError(res.error);
                return;
            }
            setStore(res.data);
            showSuccess(said);
            // The list on the left shows the name, the kind and the pause.
            if (
                input.name !== undefined ||
                input.kind !== undefined ||
                input.paused !== undefined
            ) {
                router.refresh();
            }
        });
    };

    const shared = { store, canEdit, pending, save, setStore };

    return (
        <>
            <BasicsSection {...shared} businessName={businessName} />
            {store.kind === "SHOP" ? <PlaceSection {...shared} /> : null}
            <CheckoutSection {...shared} businessName={businessName} />
            <BehaviourSection {...shared} />
            {canClose || canEdit ? (
                <ClosingSection
                    {...shared}
                    businessName={businessName}
                    canClose={canClose}
                />
            ) : null}
        </>
    );
}

function BasicsSection({
    store,
    businessName,
    canEdit,
    pending,
    save,
    setStore,
}: SectionProps & { businessName: string }) {
    const [name, setName] = useState(store.name);
    const trimmed = name.trim();
    const dirty = trimmed !== store.name;

    const setKind = (kind: StorefrontKind) => {
        if (kind === store.kind) return;
        const before = store.kind;
        setStore((s) => ({ ...s, kind }));
        save(
            { kind },
            kind === "SHOP" ? "Now a shop" : "Now an online store",
            () => setStore((s) => ({ ...s, kind: before })),
        );
    };

    return (
        <Section title="Basics">
            <form
                className="grid gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (dirty && trimmed) save({ name: trimmed }, "Name saved");
                }}
            >
                <Label htmlFor="storefront-name">Storefront name</Label>
                <div className="flex gap-2">
                    <Input
                        id="storefront-name"
                        value={name}
                        maxLength={80}
                        readOnly={!canEdit}
                        aria-describedby="storefront-name-note"
                        onChange={(e) => setName(e.target.value)}
                        className="max-w-sm"
                    />
                    {canEdit && dirty ? (
                        <Button type="submit" disabled={pending || !trimmed}>
                            Save
                        </Button>
                    ) : null}
                </div>
                <Note id="storefront-name-note">
                    Customers see this at checkout and on receipts. It is not
                    the business name — {businessName} stays the same across all
                    of them.
                </Note>
            </form>

            <div className="grid gap-2">
                <p id="storefront-kind-label" className="text-sm font-medium">
                    What kind of storefront is this?
                </p>
                <ToggleGroup
                    type="single"
                    value={store.kind}
                    // Radix clears a single group when the pressed item is
                    // pressed again; a storefront is always one or the other.
                    onValueChange={(v) => {
                        if (v === "SHOP" || v === "ONLINE") setKind(v);
                    }}
                    disabled={!canEdit || pending}
                    aria-labelledby="storefront-kind-label"
                    aria-describedby="storefront-kind-note"
                    className={SEGMENTED}
                >
                    <ToggleGroupItem value="SHOP" className={SEGMENT}>
                        Shop
                    </ToggleGroupItem>
                    <ToggleGroupItem value="ONLINE" className={SEGMENT}>
                        Online store
                    </ToggleGroupItem>
                </ToggleGroup>
                <Note id="storefront-kind-note">
                    A shop is a place, so it has an address, opening hours and
                    collection. An online store is a channel and needs none of
                    them.
                </Note>
            </div>

            {/* What used to be the storefront's own Settings and Members
                tabs, now reached from here (#376). */}
            <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                    <Link href={storefrontDetailsHref(store.id)}>
                        Web address, description and logo
                    </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                    <Link href={storefrontPeopleHref(store.id)}>
                        People who work on it
                    </Link>
                </Button>
            </div>
        </Section>
    );
}

/** Only a shop has a door: where it is and when it is open. */
function PlaceSection({ store, canEdit, pending, save }: SectionProps) {
    const [address, setAddress] = useState(store.address ?? "");
    const addressDirty = address.trim() !== (store.address ?? "");

    return (
        <Section title="Where customers find it">
            <form
                className="grid gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (addressDirty) {
                        save(
                            { address: address.trim() || null },
                            "Address saved",
                        );
                    }
                }}
            >
                <Label htmlFor="storefront-address">Address</Label>
                <Textarea
                    id="storefront-address"
                    value={address}
                    rows={3}
                    maxLength={500}
                    readOnly={!canEdit}
                    aria-describedby="storefront-address-note"
                    onChange={(e) => setAddress(e.target.value)}
                    className="max-w-md"
                />
                <Note id="storefront-address-note">
                    Printed on the receipt, so a customer knows where to come
                    back to.
                </Note>
                {canEdit && addressDirty ? (
                    <Button type="submit" disabled={pending} className="w-fit">
                        Save address
                    </Button>
                ) : null}
            </form>

            <OpeningHours
                saved={store.openingHours}
                canEdit={canEdit}
                pending={pending}
                onSave={(openingHours) => {
                    save({ openingHours }, "Opening hours saved");
                }}
            />
        </Section>
    );
}

const SHORT: Record<Weekday, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

const PRESETS: { label: string; days: Weekday[] }[] = [
    { label: "Mon–Fri", days: ["MON", "TUE", "WED", "THU", "FRI"] },
    { label: "Mon–Sat", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
    { label: "Every day", days: DAYS.map((d) => d.key) },
];

const sameHours = (a: OpeningHoursDay, b: OpeningHoursDay) =>
    a.closed === b.closed &&
    (a.closed || (a.open === b.open && a.close === b.close));

/**
 * "Mon–Sat 9:00 AM – 6:00 PM · Sun closed": runs of neighbouring days with
 * the same hours, the way a shop writes them on its door.
 */
function summarise(week: OpeningHoursDay[]): string {
    const runs: { from: number; to: number; day: OpeningHoursDay }[] = [];
    week.forEach((day, i) => {
        const last = runs.at(-1);
        if (last?.to === i - 1 && sameHours(last.day, day)) {
            last.to = i;
        } else {
            runs.push({ from: i, to: i, day });
        }
    });
    return runs
        .map(({ from, to, day }) => {
            const a = SHORT[week[from]?.day ?? "MON"];
            const b = SHORT[week[to]?.day ?? "MON"];
            const days = from === to ? a : `${a}–${b}`;
            return day.closed
                ? `${days} closed`
                : `${days} ${formatTime(day.open)} – ${formatTime(day.close)}`;
        })
        .join(" · ");
}

/** Every open day on the same hours — the case for almost every shop. */
function isUniform(week: OpeningHoursDay[]): boolean {
    const open = week.filter((d) => !d.closed);
    return open.every(
        (d) => d.open === open[0]?.open && d.close === open[0]?.close,
    );
}

/**
 * A shop's week, set the way a shop thinks about it: which days it opens and
 * the hours it keeps, once. Only a shop whose Saturday (say) runs short opens
 * the day-by-day list — and it starts there if its saved week already does.
 * Either way what is saved is the full seven days, so the receipt reads the
 * same.
 */
function OpeningHours({
    saved,
    canEdit,
    pending,
    onSave,
}: {
    saved: OpeningHoursDay[] | null;
    canEdit: boolean;
    pending: boolean;
    onSave: (week: OpeningHoursDay[]) => void;
}) {
    const initial = saved ?? DEFAULT_WEEK;
    const [week, setWeek] = useState<OpeningHoursDay[]>(initial);
    const [eachDay, setEachDay] = useState(!isUniform(initial));
    const dirty = JSON.stringify(week) !== JSON.stringify(initial);
    const backwards = week.some((d) => !d.closed && d.open >= d.close);

    const openDays = week.filter((d) => !d.closed).map((d) => d.day);
    const preset = PRESETS.find(
        (p) =>
            p.days.length === openDays.length &&
            p.days.every((d) => openDays.includes(d)),
    );
    // Custom is a choice, not only a state: picking it keeps the day chips
    // open even while the days happen to match a preset.
    const [custom, setCustom] = useState(!preset);
    const daysChoice = custom || !preset ? "CUSTOM" : preset.label;
    // The hours the "same" mode edits: the first open day's, or the default.
    const shared = week.find((d) => !d.closed) ?? {
        open: "09:00",
        close: "18:00",
    };

    const setOpenDays = (days: string[]) => {
        setWeek((w) =>
            w.map((d) =>
                days.includes(d.day)
                    ? {
                          ...d,
                          closed: false,
                          open: d.closed ? shared.open : d.open,
                          close: d.closed ? shared.close : d.close,
                      }
                    : { ...d, closed: true },
            ),
        );
    };
    const setSharedHours = (patch: { open?: string; close?: string }) => {
        setWeek((w) => w.map((d) => (d.closed ? d : { ...d, ...patch })));
    };
    const setDay = (i: number, patch: Partial<OpeningHoursDay>) => {
        setWeek((w) => w.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    };

    return (
        <form
            className="grid gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                if (!backwards) onSave(week);
            }}
        >
            <div>
                <p id="storefront-hours-label" className="text-sm font-medium">
                    Opening hours
                </p>
                {/* The controls already say it in the simple case; the line
                    earns its place when the week is day-by-day, or when it
                    is all a viewer who cannot edit gets to see. */}
                {eachDay || !canEdit ? (
                    <p className="mt-0.5 text-[12.5px] tabular-nums text-muted-foreground">
                        {openDays.length === 0
                            ? "Closed every day"
                            : summarise(week)}
                    </p>
                ) : null}
            </div>

            {eachDay ? (
                <div
                    role="group"
                    aria-labelledby="storefront-hours-label"
                    className="overflow-hidden rounded-lg border border-border"
                >
                    {week.map((d, i) => {
                        const label = DAYS[i]?.label ?? d.day;
                        const wrong = !d.closed && d.open >= d.close;
                        return (
                            <div
                                key={d.day}
                                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 last:border-b-0"
                            >
                                <span className="w-24 text-[13px] font-medium">
                                    {label}
                                </span>
                                <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                    <Switch
                                        checked={!d.closed}
                                        disabled={!canEdit}
                                        onCheckedChange={(isOpen) => {
                                            setDay(i, { closed: !isOpen });
                                        }}
                                        aria-label={`Open on ${label}`}
                                    />
                                    <span aria-hidden className="w-11">
                                        {d.closed ? "Closed" : "Open"}
                                    </span>
                                </span>
                                {d.closed ? null : (
                                    <span className="flex items-center gap-1.5">
                                        <TimeSelect
                                            value={d.open}
                                            disabled={!canEdit}
                                            aria-label={`${label} opens`}
                                            aria-invalid={wrong || undefined}
                                            onValueChange={(open) => {
                                                setDay(i, { open });
                                            }}
                                        />
                                        <span
                                            aria-hidden
                                            className="text-muted-foreground"
                                        >
                                            –
                                        </span>
                                        <TimeSelect
                                            value={d.close}
                                            disabled={!canEdit}
                                            aria-label={`${label} closes`}
                                            aria-invalid={wrong || undefined}
                                            onValueChange={(close) => {
                                                setDay(i, { close });
                                            }}
                                        />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="grid grid-cols-[3.5rem_1fr] items-start gap-x-4 gap-y-3">
                    <span
                        id="storefront-open-days"
                        className="pt-1.5 text-[12.5px] text-muted-foreground"
                    >
                        Days
                    </span>
                    <div className="grid gap-2">
                        {/* One control for "which days" — the same segmented
                            style as Shop / Online store. The chips only
                            appear for Custom, so the common answer is one
                            click and the rare one is still there. */}
                        <ToggleGroup
                            type="single"
                            value={daysChoice}
                            onValueChange={(v) => {
                                if (!v) return;
                                if (v === "CUSTOM") {
                                    setCustom(true);
                                    return;
                                }
                                const next = PRESETS.find((p) => p.label === v);
                                if (next) {
                                    setCustom(false);
                                    setOpenDays(next.days);
                                }
                            }}
                            disabled={!canEdit}
                            aria-labelledby="storefront-open-days"
                            className={SEGMENTED}
                        >
                            {PRESETS.map((p) => (
                                <ToggleGroupItem
                                    key={p.label}
                                    value={p.label}
                                    className={SEGMENT}
                                >
                                    {p.label}
                                </ToggleGroupItem>
                            ))}
                            <ToggleGroupItem value="CUSTOM" className={SEGMENT}>
                                Custom
                            </ToggleGroupItem>
                        </ToggleGroup>
                        {daysChoice === "CUSTOM" ? (
                            <ToggleGroup
                                type="multiple"
                                value={openDays}
                                onValueChange={setOpenDays}
                                disabled={!canEdit}
                                aria-label="Open days"
                                className="w-fit flex-wrap justify-start gap-1"
                            >
                                {DAYS.map((d) => (
                                    <ToggleGroupItem
                                        key={d.key}
                                        value={d.key}
                                        aria-label={d.label}
                                        className="h-8 w-11 rounded-md border border-border text-[12.5px] font-medium text-muted-foreground data-[state=on]:border-foreground/50 data-[state=on]:bg-muted data-[state=on]:text-foreground coarse:h-11"
                                    >
                                        {SHORT[d.key]}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        ) : null}
                    </div>

                    <span className="pt-2.5 text-[12.5px] text-muted-foreground">
                        Hours
                    </span>
                    {openDays.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <TimeSelect
                                value={shared.open}
                                disabled={!canEdit}
                                aria-label="Opens"
                                aria-invalid={backwards || undefined}
                                onValueChange={(open) => {
                                    setSharedHours({ open });
                                }}
                            />
                            <span aria-hidden className="text-muted-foreground">
                                –
                            </span>
                            <TimeSelect
                                value={shared.close}
                                disabled={!canEdit}
                                aria-label="Closes"
                                aria-invalid={backwards || undefined}
                                onValueChange={(close) => {
                                    setSharedHours({ close });
                                }}
                            />
                        </div>
                    ) : (
                        <p className="pt-2.5 text-[12.5px] text-muted-foreground">
                            Closed every day — pick the days it opens.
                        </p>
                    )}
                </div>
            )}

            {canEdit ? (
                <Button
                    type="button"
                    variant="link"
                    className="h-auto w-fit p-0 text-[12.5px] font-medium text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground"
                    onClick={() => {
                        if (eachDay) {
                            // Back to one set of hours: every open day takes
                            // the first open day's.
                            setSharedHours({
                                open: shared.open,
                                close: shared.close,
                            });
                        }
                        setEachDay(!eachDay);
                    }}
                >
                    {eachDay
                        ? "Use the same hours for every open day"
                        : "Some days have different hours"}
                </Button>
            ) : null}

            <Note>
                {backwards
                    ? "A day has to close after it opens."
                    : saved
                      ? "Shown on the receipt, in the shop's own time."
                      : "Not saved yet — this is a starting week. Save it to show it on receipts."}
            </Note>
            {canEdit && (dirty || !saved) ? (
                <Button
                    type="submit"
                    disabled={pending || backwards}
                    className="w-fit"
                >
                    Save hours
                </Button>
            ) : null}
        </form>
    );
}

function CheckoutSection({
    store,
    businessName,
    canEdit,
    pending,
    save,
    setStore,
}: SectionProps & { businessName: string }) {
    const [rate, setRate] = useState(String(Number(store.taxRate)));
    const rateValid = /^\d{1,2}(\.\d{1,2})?$|^100$/.test(rate.trim());
    const rateDirty = rateValid && Number(rate) !== Number(store.taxRate);
    const currencies = CURRENCIES.includes(store.currency)
        ? CURRENCIES
        : [store.currency, ...CURRENCIES];
    const orders = store.orderCount;

    return (
        <Section title="Checkout">
            <div className="grid gap-2">
                <Label htmlFor="storefront-currency">Currency</Label>
                <div className="flex items-center gap-2.5">
                    {/* A select in every state: once orders lock it, it is the
                        same control shown disabled, so the merchant sees what
                        it is and why it will not move. */}
                    <Select
                        value={store.currency}
                        disabled={store.currencyLocked || !canEdit || pending}
                        onValueChange={(currency) => {
                            const before = store.currency;
                            setStore((s) => ({ ...s, currency }));
                            save(
                                { currency },
                                `Currency set to ${currency}`,
                                () => {
                                    setStore((s) => ({
                                        ...s,
                                        currency: before,
                                    }));
                                },
                            );
                        }}
                    >
                        <SelectTrigger
                            id="storefront-currency"
                            aria-describedby="storefront-currency-note"
                            className="w-32 font-mono"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {currencies.map((c) => (
                                <SelectItem
                                    key={c}
                                    value={c}
                                    className="font-mono"
                                >
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Badge variant="outline" className="gap-1">
                        {store.currencyLocked ? (
                            <>
                                <Lock aria-hidden className="size-3" />
                                Locked
                            </>
                        ) : (
                            "Editable"
                        )}
                    </Badge>
                </div>
                <Note id="storefront-currency-note">
                    {store.currencyLocked
                        ? `Locked by the ${orders === 1 ? "order" : `${orders} orders`} already taken here. Changing it now would rewrite what every one of them means.`
                        : "No orders yet, so this can still change. After the first one it locks for good."}
                </Note>
            </div>

            <ToggleRow
                id="storefront-tax"
                label="Charge tax"
                note="Added to each new order at this rate. A single order can still be changed by hand."
                checked={store.taxEnabled}
                disabled={!canEdit || pending}
                onChange={(taxEnabled) => {
                    setStore((s) => ({ ...s, taxEnabled }));
                    save(
                        { taxEnabled },
                        taxEnabled ? "Tax turned on" : "Tax turned off",
                        () => {
                            setStore((s) => ({
                                ...s,
                                taxEnabled: !taxEnabled,
                            }));
                        },
                    );
                }}
            />
            {store.taxEnabled ? (
                <form
                    className="grid gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (rateDirty) {
                            save(
                                { taxRate: rate.trim() },
                                `Tax rate set to ${Number(rate)}%`,
                            );
                        }
                    }}
                >
                    <Label htmlFor="storefront-tax-rate">Tax rate</Label>
                    <div className="flex items-center gap-2">
                        <div className="relative w-28">
                            <Input
                                id="storefront-tax-rate"
                                inputMode="decimal"
                                value={rate}
                                readOnly={!canEdit}
                                aria-invalid={!rateValid || undefined}
                                aria-describedby="storefront-tax-rate-note"
                                onChange={(e) => setRate(e.target.value)}
                                className="pr-7 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
                            >
                                %
                            </span>
                        </div>
                        {canEdit && rateDirty ? (
                            <Button type="submit" disabled={pending}>
                                Save
                            </Button>
                        ) : null}
                    </div>
                    <Note id="storefront-tax-rate-note">
                        {rateValid
                            ? "A percentage of the order's items, before delivery."
                            : "A percentage from 0 to 100, with up to 2 decimals."}
                    </Note>
                </form>
            ) : null}

            <Payments
                store={store}
                businessName={businessName}
                canEdit={canEdit}
                pending={pending}
                save={save}
            />
        </Section>
    );
}

/**
 * Providers are connected once, for the business — the checks are on the
 * business and the money lands in its account. Each storefront only picks
 * which of them its checkout uses.
 */
function Payments({
    store,
    businessName,
    canEdit,
    pending,
    save,
}: Pick<SectionProps, "store" | "canEdit" | "pending" | "save"> & {
    businessName: string;
}) {
    const connected = store.providers.filter((p) => p.status === "CONNECTED");
    const summary =
        connected.length === 0
            ? `${businessName} has no payment provider connected, so this storefront cannot take payments yet.`
            : store.effectiveProvider
              ? `Checkout here charges through ${providerName(store.effectiveProvider)}. A provider is connected once for ${businessName}; each storefront picks which one its checkout uses.`
              : store.checkoutProvider
                ? `${providerName(store.checkoutProvider)} is no longer connected, so checkout here cannot take payments. Choose another.`
                : "More than one provider is connected, so checkout cannot pick for itself. Choose which one this storefront uses.";

    return (
        <div className="grid gap-2">
            <p className="text-sm font-medium">Payments</p>
            <Note>{summary}</Note>
            {store.providers.length > 0 ? (
                <ul className="overflow-hidden rounded-lg border border-border">
                    {store.providers.map((p) => {
                        const inUse = store.effectiveProvider === p.provider;
                        const usable = p.status === "CONNECTED";
                        return (
                            <li
                                key={p.provider}
                                className="flex min-h-12 items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13.5px] font-medium">
                                        {providerName(p.provider)}
                                    </span>
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        {usable
                                            ? "Connected for the business"
                                            : "Turned off for the business"}
                                    </span>
                                </span>
                                {inUse ? (
                                    <Badge variant="success">In use here</Badge>
                                ) : canEdit && usable ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => {
                                            save(
                                                {
                                                    checkoutProvider:
                                                        p.provider,
                                                },
                                                `Checkout now uses ${providerName(p.provider)}`,
                                            );
                                        }}
                                        aria-label={`Use ${providerName(p.provider)} for this storefront`}
                                    >
                                        Use here
                                    </Button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            <Link
                href="/settings/providers"
                className="w-fit text-[12.5px] font-medium underline-offset-4 hover:underline"
            >
                {connected.length === 0
                    ? "Connect a provider"
                    : "Manage providers for the business"}
            </Link>
        </div>
    );
}

type BehaviourKey =
    "shippingEnabled" | "collectionEnabled" | "tipsEnabled" | "guestCheckout";

function BehaviourSection({
    store,
    canEdit,
    pending,
    save,
    setStore,
}: SectionProps) {
    const [threshold, setThreshold] = useState(
        store.freeShippingThreshold ?? "",
    );
    const next = threshold.trim();
    const valid = next === "" || MONEY_RE.test(next);
    const dirty =
        valid &&
        (next === ""
            ? store.freeShippingThreshold !== null
            : Number(next) !== Number(store.freeShippingThreshold ?? NaN));

    /** A switch that saves itself, and springs back if the save fails. */
    const flip =
        (key: BehaviourKey, on: string, off: string) => (value: boolean) => {
            setStore((s) => ({ ...s, [key]: value }));
            save({ [key]: value }, value ? on : off, () => {
                setStore((s) => ({ ...s, [key]: !value }));
            });
        };

    return (
        <Section title="Behaviour">
            {store.kind === "SHOP" ? (
                <ToggleRow
                    id="storefront-collection"
                    label="Collection from this storefront"
                    note="Customers choose a slot and pick up in person."
                    later
                    checked={store.collectionEnabled}
                    disabled={!canEdit || pending}
                    onChange={flip(
                        "collectionEnabled",
                        "Collection turned on",
                        "Collection turned off",
                    )}
                />
            ) : null}
            <ToggleRow
                id="storefront-delivery"
                label="Delivery"
                note="Orders from here can be sent to the customer. Off means nothing is sent, so there is no shipping to charge."
                checked={store.shippingEnabled}
                disabled={!canEdit || pending}
                onChange={flip(
                    "shippingEnabled",
                    "Delivery turned on",
                    "Delivery turned off",
                )}
            />
            {store.shippingEnabled ? (
                <form
                    className="grid gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!dirty) return;
                        save(
                            {
                                freeShippingThreshold:
                                    next === "" ? null : next,
                            },
                            next === ""
                                ? "Free delivery removed"
                                : `Free delivery over ${next} ${store.currency}`,
                        );
                    }}
                >
                    <Label htmlFor="storefront-free-over">
                        Free delivery over
                    </Label>
                    <div className="flex items-center gap-2">
                        <div className="relative w-40">
                            <Input
                                id="storefront-free-over"
                                inputMode="decimal"
                                value={threshold}
                                placeholder="Never"
                                readOnly={!canEdit}
                                aria-invalid={!valid || undefined}
                                aria-describedby="storefront-free-over-note"
                                onChange={(e) => setThreshold(e.target.value)}
                                className="pr-12 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-muted-foreground"
                            >
                                {store.currency}
                            </span>
                        </div>
                        {canEdit && dirty ? (
                            <Button type="submit" disabled={pending}>
                                Save
                            </Button>
                        ) : null}
                    </div>
                    <Note id="storefront-free-over-note">
                        {valid
                            ? "An order whose items come to this or more is marked as free to deliver. Leave it empty to always charge."
                            : "A number with up to 2 decimals, or empty."}
                    </Note>
                </form>
            ) : null}
            <ToggleRow
                id="storefront-tips"
                label="Ask for a tip at checkout"
                note="A single optional line, never pre-selected."
                later
                checked={store.tipsEnabled}
                disabled={!canEdit || pending}
                onChange={flip(
                    "tipsEnabled",
                    "Tips turned on",
                    "Tips turned off",
                )}
            />
            <ToggleRow
                id="storefront-guest"
                label="Allow guest checkout"
                note="Off means someone must make an account before they can pay."
                later
                checked={store.guestCheckout}
                disabled={!canEdit || pending}
                onChange={flip(
                    "guestCheckout",
                    "Guest checkout turned on",
                    "Guest checkout turned off",
                )}
            />
            <Note>
                Settings marked “Not live yet” are saved now and take effect
                when customers can check out on their own. Today an order is
                keyed in here and paid by link.
            </Note>
        </Section>
    );
}

function ToggleRow({
    id,
    label,
    note,
    later,
    checked,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    note: string;
    /** Saved, but nothing reads it until customers can check out alone. */
    later?: boolean;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={id} className="text-[13.5px] font-medium">
                        {label}
                    </Label>
                    {later ? (
                        <Badge variant="neutral">Not live yet</Badge>
                    ) : null}
                </span>
                <p
                    id={`${id}-note`}
                    className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    {note}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                aria-describedby={`${id}-note`}
                onCheckedChange={onChange}
                className="mt-0.5 shrink-0"
            />
        </div>
    );
}

/**
 * Pausing is reversible, so it takes an Undo and no confirm — the repo's rule
 * for reversible actions. Closing is not, so it takes a confirm: the design
 * drew an Undo there too, but the API keeps no way back from a close.
 */
function ClosingSection({
    store,
    businessName,
    canEdit,
    canClose,
    pending,
    save,
    setStore,
}: SectionProps & { businessName: string; canClose: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [closing, startClosing] = useTransition();
    const orders = store.orderCount;
    const kept = `${orders} past ${orders === 1 ? "order stays" : "orders stay"}`;
    const paused = Boolean(store.pausedAt);
    const resume = () => {
        save({ paused: false }, `${store.name} is taking payments again`);
    };

    const pause = () => {
        startClosing(async () => {
            const res = await updateStorefront(store.id, { paused: true });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setStore(() => res.data);
            router.refresh();
            showUndo(
                `${store.name} is paused — customers cannot pay until it is back on.`,
                resume,
            );
        });
    };

    return (
        <Section title="Closing up">
            <Note>
                {paused
                    ? `${store.name} is paused: customers cannot pay for orders here until it is turned back on. Everything is kept.`
                    : store.unfulfilled > 0
                      ? `Pausing stops ${store.name} taking payments and keeps everything. ${store.unfulfilled === 1 ? "One order here is" : `${store.unfulfilled} orders here are`} still waiting to go out, so it cannot be closed until ${store.unfulfilled === 1 ? "that one is" : "they are"} fulfilled or cancelled.`
                      : orders > 0
                        ? `Pausing stops ${store.name} taking payments and keeps everything. Closing it permanently cannot be undone, and its ${kept} on the business's record either way.`
                        : `Pausing stops ${store.name} taking payments and keeps everything. Nothing has been sold here yet, so closing it removes it cleanly.`}
            </Note>
            <div className="flex flex-wrap gap-2">
                {canEdit ? (
                    <Button
                        variant="outline"
                        disabled={pending || closing}
                        onClick={paused ? resume : pause}
                    >
                        {paused ? "Resume storefront" : "Pause storefront"}
                    </Button>
                ) : null}
                {canClose ? (
                    <Button
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:border-destructive hover:text-destructive"
                        disabled={closing || store.unfulfilled > 0}
                        onClick={() => setOpen(true)}
                    >
                        Close permanently
                    </Button>
                ) : null}
            </div>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={`Close ${store.name} permanently?`}
                description={`This removes ${store.name} from ${businessName} for good. ${
                    orders > 0
                        ? `Its ${kept} on the business's record, and the catalogue is untouched — it belongs to the business, not to this storefront.`
                        : "Nothing has been sold here, so there is nothing to keep."
                } This cannot be undone.`}
                confirmLabel="Close permanently"
                onConfirm={() => {
                    startClosing(async () => {
                        const res = await closeStorefront(store.id);
                        if (!res.ok) {
                            showError(res.error);
                            return;
                        }
                        showSuccess(`${store.name} is closed`);
                        router.replace("/commerce/storefronts");
                    });
                }}
            />
        </Section>
    );
}
