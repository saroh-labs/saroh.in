"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { PageHeader } from "@saroh/ui/page-header";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import {
    addSession,
    cancelEnrollment,
    removeSession,
    updateCourse,
} from "@/lib/courses/actions";
import {
    courseTab,
    seatsLeftLine,
    STATUS_LABEL,
    TAB_LABEL,
} from "@/lib/courses/seats";
import type { CourseDetail, Enrollment } from "@/lib/courses/service";
import { wallClockToIso, ymd } from "@/lib/courses/sessions";
import { formatTimeRange } from "@/lib/format/datetime";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { invoiceMoney } from "@/lib/invoices/money";

import { EnrolDialog } from "./enrol-dialog";

const STANDING_WORD = {
    DRAFT: "Draft",
    ISSUED: "Issued",
    OVERDUE: "Overdue",
    PAID: "Paid",
    VOID: "Void",
    CREDITED: "Credited",
} as const;

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");

/**
 * A course, after the "Saroh Billing and Classes" design: its sessions on
 * the left, each a real booking on the schedule; the roster on the right,
 * with its seats. Full is a constraint, not a warning: the enrol button is
 * off and says what would free a seat.
 */
export function CoursePage({
    course,
    contacts,
    canWrite,
    now,
}: {
    course: CourseDetail;
    contacts: ContactOption[];
    canWrite: boolean;
    /** When the page was read, so "done" and "booked" agree with the server. */
    now: string;
}) {
    const router = useRouter();
    const [enrolling, setEnrolling] = useState(false);
    const [cancelling, setCancelling] = useState<Enrollment | null>(null);
    const [busy, setBusy] = useState(false);
    const tab = courseTab({ ...course, sessions: course.sessions });

    async function setStatus(status: CourseDetail["status"], done: string) {
        setBusy(true);
        const res = await updateCourse(course.id, { status });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(done);
        router.refresh();
    }

    const statusAction = !canWrite
        ? null
        : course.status === "DRAFT"
          ? {
                label: "Open for enrolment",
                run: () =>
                    setStatus("OPEN", `${course.name} is open for enrolment`),
                disabled: course.sessions.length === 0,
            }
          : course.status === "OPEN"
            ? {
                  label: "Close enrolment",
                  run: () =>
                      setStatus(
                          "CLOSED",
                          "Enrolment closed. The sessions still run for everyone on it.",
                      ),
                  disabled: false,
              }
            : course.status === "CLOSED"
              ? {
                    label: "Reopen enrolment",
                    run: () =>
                        setStatus("OPEN", `${course.name} is open again`),
                    disabled: false,
                }
              : null;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                className="mb-0"
                breadcrumb={[
                    <Link
                        key="courses"
                        href="/courses"
                        className="hover:text-foreground"
                    >
                        Courses
                    </Link>,
                    course.name,
                ]}
                title={course.name}
                actions={
                    <>
                        {statusAction ? (
                            <Button
                                variant={
                                    course.status === "DRAFT"
                                        ? "default"
                                        : "outline"
                                }
                                disabled={busy || statusAction.disabled}
                                onClick={() => void statusAction.run()}
                            >
                                {statusAction.label}
                            </Button>
                        ) : null}
                        {canWrite ? (
                            <Button variant="outline" asChild>
                                <Link href={`/courses/${course.id}/edit`}>
                                    Edit course
                                </Link>
                            </Button>
                        ) : null}
                        <Button variant="outline" asChild>
                            <Link href="/courses">Back to courses</Link>
                        </Button>
                    </>
                }
            />
            <div className="-mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                <Badge
                    variant={
                        tab === "OPEN"
                            ? "success"
                            : tab === "FULL"
                              ? "warning"
                              : "neutral"
                    }
                >
                    {course.status === "OPEN"
                        ? TAB_LABEL[tab]
                        : STATUS_LABEL[course.status]}
                </Badge>
                {course.service.name} ·{" "}
                {invoiceMoney(course.price, course.currency)} · {course.seats}{" "}
                {course.seats === 1 ? "seat" : "seats"}
                {course.description ? ` · ${course.description}` : ""}
            </div>

            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
                <Sessions course={course} canWrite={canWrite} now={now} />
                <Roster
                    course={course}
                    canWrite={canWrite}
                    onEnrol={() => setEnrolling(true)}
                    onCancel={setCancelling}
                />
            </div>

            {canWrite ? (
                <EnrolDialog
                    open={enrolling}
                    onOpenChange={setEnrolling}
                    courses={[course]}
                    invoicesOnEnrol={course.invoicesOnEnrol}
                    contacts={contacts.filter(
                        (c) =>
                            !course.enrollments.some(
                                (e) =>
                                    e.status === "ACTIVE" &&
                                    e.contact.id === c.id,
                            ),
                    )}
                />
            ) : null}
            {cancelling ? (
                <CancelEnrolmentDialog
                    course={course}
                    enrollment={cancelling}
                    onClose={() => setCancelling(null)}
                />
            ) : null}
        </div>
    );
}

// — Sessions ——————————————————————————————————————————————————————

function Sessions({
    course,
    canWrite,
    now: nowIso,
}: {
    course: CourseDetail;
    canWrite: boolean;
    now: string;
}) {
    const router = useRouter();
    const tz = course.service.timezone;
    const now = Date.parse(nowIso);
    const month = (iso: string) =>
        new Intl.DateTimeFormat(DISPLAY_LOCALE, {
            timeZone: tz,
            month: "short",
        })
            .format(new Date(iso))
            .toUpperCase();
    const dayNum = (iso: string) =>
        new Intl.DateTimeFormat(DISPLAY_LOCALE, {
            timeZone: tz,
            day: "numeric",
        }).format(new Date(iso));
    const weekday = (iso: string) =>
        new Intl.DateTimeFormat(DISPLAY_LOCALE, {
            timeZone: tz,
            weekday: "long",
        }).format(new Date(iso));

    async function remove(sessionId: string) {
        const res = await removeSession(course.id, sessionId);
        if (!res.ok) return showError(res.error);
        showSuccess("Session removed");
        router.refresh();
    }

    return (
        <section className="flex min-w-0 flex-col gap-2.5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Sessions
            </h2>
            {course.sessions.length === 0 ? (
                <p className="rounded-[11px] border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No sessions yet. Add one below; a course opens once it has a
                    session.
                </p>
            ) : (
                <ol className="divide-y overflow-hidden rounded-[11px] border border-border bg-card">
                    {course.sessions.map((s) => {
                        const past = Date.parse(s.startAt) <= now;
                        return (
                            <li
                                key={s.id}
                                className="flex items-center gap-4 px-4 py-3"
                            >
                                <span className="flex w-9 shrink-0 flex-col items-center leading-none">
                                    <span className="text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground">
                                        {month(s.startAt)}
                                    </span>
                                    <span className="font-display text-[20px] font-semibold tabular-nums">
                                        {dayNum(s.startAt)}
                                    </span>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm">
                                        {weekday(s.startAt)}{" "}
                                        {formatTimeRange(
                                            s.startAt,
                                            s.endAt,
                                            tz,
                                        )}
                                    </span>
                                    <span className="block text-[12px] text-muted-foreground">
                                        {s.booked === 0
                                            ? "Nobody booked"
                                            : `${s.booked} booked`}
                                    </span>
                                </span>
                                <Badge
                                    variant={
                                        past || s.booked === 0
                                            ? "neutral"
                                            : "success"
                                    }
                                >
                                    {past
                                        ? "Done"
                                        : s.booked === 0
                                          ? "Upcoming"
                                          : "Booked"}
                                </Badge>
                                {canWrite && !past && s.booked === 0 ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="coarse:size-11"
                                        aria-label="Remove this session"
                                        onClick={() => void remove(s.id)}
                                    >
                                        <X className="size-4" aria-hidden />
                                    </Button>
                                ) : null}
                            </li>
                        );
                    })}
                </ol>
            )}
            <p className="text-[12px] leading-[1.5] text-muted-foreground">
                Each session is a real booking on {course.service.name}, so it
                shows on the schedule with its attendees and takes a seat there
                too. Times are in {tz}.
            </p>
            {canWrite && course.status !== "ARCHIVED" ? (
                <AddSession course={course} />
            ) : null}
        </section>
    );
}

function AddSession({ course }: { course: CourseDetail }) {
    const router = useRouter();
    const ids = { day: useId(), time: useId() };
    const last = course.sessions.at(-1);
    const [day, setDay] = useState<Date | undefined>(
        last ? new Date(Date.parse(last.startAt) + 7 * 86_400_000) : undefined,
    );
    const [time, setTime] = useState(
        last
            ? new Intl.DateTimeFormat("en-GB", {
                  timeZone: course.service.timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
              }).format(new Date(last.startAt))
            : "18:30",
    );
    const [busy, setBusy] = useState(false);
    const on = course.enrolled;

    async function add() {
        if (!day) return;
        setBusy(true);
        const res = await addSession(
            course.id,
            wallClockToIso(ymd(day), time, course.service.timezone),
        );
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            on > 0
                ? `Session added, and ${on} ${on === 1 ? "person" : "people"} booked on it`
                : "Session added",
        );
        router.refresh();
    }

    return (
        <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="grid gap-1.5">
                <Label htmlFor={ids.day}>New session</Label>
                <DatePicker
                    id={ids.day}
                    value={day}
                    onValueChange={setDay}
                    className="w-[11rem]"
                />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor={ids.time}>Time</Label>
                <TimeSelect
                    id={ids.time}
                    value={time}
                    onValueChange={setTime}
                    stepMinutes={15}
                />
            </div>
            <Button
                variant="outline"
                disabled={busy || !day}
                onClick={() => void add()}
            >
                {busy
                    ? "Adding…"
                    : on > 0
                      ? `Add and book ${on}`
                      : "Add session"}
            </Button>
        </div>
    );
}

// — Roster ————————————————————————————————————————————————————————

function Roster({
    course,
    canWrite,
    onEnrol,
    onCancel,
}: {
    course: CourseDetail;
    canWrite: boolean;
    onEnrol: () => void;
    onCancel: (e: Enrollment) => void;
}) {
    const active = course.enrollments.filter((e) => e.status === "ACTIVE");
    const cancelled = course.enrollments.filter(
        (e) => e.status === "CANCELLED",
    );
    const full = course.seatsLeft <= 0;
    const why = full
        ? "Every seat is taken. Add a seat in the course, or wait for someone to cancel — a cancellation frees one straight away."
        : course.status === "DRAFT"
          ? "Open the course to take enrolments."
          : course.status !== "OPEN"
            ? "Enrolment is closed. Reopen it to add someone."
            : course.sessionsLeft === 0
              ? "All of this course's sessions have run."
              : null;

    return (
        <section className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-card">
            <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 dark:bg-transparent">
                <h2 className="text-sm font-semibold">Roster</h2>
                <Badge variant={full ? "warning" : "neutral"}>
                    {seatsLeftLine(course)}
                </Badge>
            </header>
            {active.length === 0 ? (
                <p className="px-4 py-5 text-[13px] text-muted-foreground">
                    Nobody is on this course yet.
                </p>
            ) : (
                <ul className="divide-y">
                    {active.map((e) => (
                        <RosterRow
                            key={e.id}
                            enrollment={e}
                            onCancel={canWrite ? () => onCancel(e) : undefined}
                        />
                    ))}
                </ul>
            )}
            {canWrite ? (
                <div className="flex flex-col gap-2 border-t border-border p-4">
                    <Button
                        className="w-full"
                        disabled={why !== null}
                        onClick={onEnrol}
                    >
                        Enrol someone
                    </Button>
                    {why ? (
                        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                            {why}
                        </p>
                    ) : null}
                </div>
            ) : null}
            {cancelled.length > 0 ? (
                <details className="border-t border-border px-4 py-3 text-[13px]">
                    <summary className="cursor-pointer text-muted-foreground">
                        {cancelled.length} cancelled
                    </summary>
                    <ul className="mt-2 space-y-1.5 text-muted-foreground">
                        {cancelled.map((e) => (
                            <li key={e.id}>
                                {e.contact.name}
                                {e.invoice
                                    ? ` · ${STANDING_WORD[e.invoice.standing]} ${e.invoice.number ?? ""}`
                                    : ""}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </section>
    );
}

function RosterRow({
    enrollment: e,
    onCancel,
}: {
    enrollment: Enrollment;
    onCancel?: () => void;
}) {
    const money = invoiceMoney(e.price, e.currency);
    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
            >
                {initials(e.contact.name)}
            </span>
            <span className="min-w-0 flex-1">
                <Link
                    href={`/contacts/${e.contact.id}`}
                    className="-my-1 block truncate py-1 text-sm font-medium underline-offset-4 hover:underline"
                >
                    {e.contact.name}
                </Link>
                <span className="block text-pretty text-[12px] text-muted-foreground">
                    {e.invoice ? (
                        <>
                            {STANDING_WORD[e.invoice.standing]} ·{" "}
                            <Link
                                href={`/billing/invoices/${e.invoice.id}`}
                                className="font-mono underline-offset-4 hover:underline"
                            >
                                {e.invoice.number ?? "draft"}
                            </Link>
                        </>
                    ) : (
                        `${money} · no invoice`
                    )}
                    {` · ${e.upcoming} ${e.upcoming === 1 ? "session" : "sessions"} to come`}
                </span>
            </span>
            {onCancel ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="coarse:h-11"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            ) : null}
        </li>
    );
}

// — Dialogs ———————————————————————————————————————————————————————

/**
 * Take someone off a course. Their sessions still to come are cancelled —
 * that cannot be undone — and their seat frees. The invoice stays unless
 * the merchant ticks "Void it too", which is left unticked: money already
 * taken is not undone by a cancel.
 */
function CancelEnrolmentDialog({
    course,
    enrollment,
    onClose,
}: {
    course: CourseDetail;
    enrollment: Enrollment;
    onClose: () => void;
}) {
    const router = useRouter();
    const voidId = useId();
    const [voidToo, setVoidToo] = useState(false);
    const [busy, setBusy] = useState(false);
    const open =
        enrollment.invoice &&
        (enrollment.invoice.standing === "ISSUED" ||
            enrollment.invoice.standing === "OVERDUE")
            ? enrollment.invoice
            : null;
    const n = enrollment.upcoming;

    async function confirm() {
        setBusy(true);
        const res = await cancelEnrollment(
            course.id,
            enrollment.id,
            voidToo && open ? open.id : undefined,
        );
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            router.refresh();
            return;
        }
        showSuccess(
            `${enrollment.contact.name} is off the course${n > 0 ? ` — ${n} ${n === 1 ? "session" : "sessions"} cancelled` : ""}`,
        );
        onClose();
        router.refresh();
    }

    return (
        <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        Take {enrollment.contact.name} off {course.name}?
                    </DialogTitle>
                    <DialogDescription>
                        {n > 0
                            ? `Their ${n} ${n === 1 ? "session" : "sessions"} still to come ${n === 1 ? "is" : "are"} cancelled, which cannot be undone, and their seat frees at once. Sessions already run stay as they were.`
                            : "Their seat frees at once. Sessions already run stay as they were."}
                    </DialogDescription>
                </DialogHeader>
                {open ? (
                    <div className="flex items-start gap-2.5 rounded-[10px] border border-border px-3.5 py-3">
                        <Checkbox
                            id={voidId}
                            checked={voidToo}
                            onCheckedChange={(v) => setVoidToo(v === true)}
                            className="mt-0.5"
                        />
                        <Label
                            htmlFor={voidId}
                            className="text-[13px] font-normal leading-[1.5]"
                        >
                            Void their open invoice {open.number} too. Leave it
                            if they owe for sessions they had.
                        </Label>
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Keep them on
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void confirm()}
                    >
                        {busy ? "Cancelling…" : "Cancel enrolment"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
