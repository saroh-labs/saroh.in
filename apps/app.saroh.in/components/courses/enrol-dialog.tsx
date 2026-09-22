"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { OptionSelect } from "@/components/shared/option-select";
import { enrol } from "@/lib/courses/actions";
import { booksLine, seatsLeftLine } from "@/lib/courses/seats";
import type { Course } from "@/lib/courses/service";
import { invoiceMoney } from "@/lib/invoices/money";

/** What the dialog reads of a course: a list row or a course page's detail. */
export type EnrolCourse = Pick<
    Course,
    | "id"
    | "name"
    | "price"
    | "currency"
    | "seats"
    | "enrolled"
    | "seatsLeft"
    | "sessions"
    | "sessionsLeft"
>;

/**
 * Enrol someone: who, and what they pay. The dialog says what it books and
 * charges before anything happens — and says nothing about an invoice when
 * Payments is off, because none is issued.
 *
 * A course page passes its one course; a contact page passes the courses
 * open to them and its own person, and the dialog asks which course instead
 * of who.
 */
export function EnrolDialog({
    open,
    onOpenChange,
    courses,
    contacts,
    initialContactId,
    invoicesOnEnrol,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** One course, or the ones to choose from. */
    courses: readonly EnrolCourse[];
    contacts: readonly ContactOption[];
    /** Who, already chosen. */
    initialContactId?: string;
    invoicesOnEnrol: boolean;
}) {
    const router = useRouter();
    const ids = { who: useId(), course: useId(), price: useId() };
    const first = courses.at(0);
    const [courseId, setCourseId] = useState(first?.id ?? "");
    const [contactId, setContactId] = useState(initialContactId ?? "");
    const [price, setPrice] = useState(first?.price ?? "");
    const [busy, setBusy] = useState(false);
    const course = courses.find((c) => c.id === courseId);
    const person = contacts.find((c) => c.id === contactId);
    const priceOk = /^\d{1,9}(\.\d{1,2})?$/.test(price.trim());
    const choosing = courses.length > 1;

    // Each opening starts fresh.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setCourseId(first?.id ?? "");
            setContactId(initialContactId ?? "");
            setPrice(first?.price ?? "");
        }
    }

    function chooseCourse(id: string) {
        setCourseId(id);
        // Its own price: a price typed for another course is not this one's.
        setPrice(courses.find((c) => c.id === id)?.price ?? "");
    }

    const n = course?.sessionsLeft ?? 0;

    async function save() {
        if (!course) return showError("Choose a course.");
        if (!contactId) return showError("Choose who is enrolling.");
        if (!priceOk) return showError("Give a price like 240 or 240.50.");
        setBusy(true);
        const res = await enrol(course.id, {
            contactId,
            ...(price.trim() !== course.price ? { price: price.trim() } : {}),
        });
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            `${person?.name ?? "They"} enrolled${choosing ? ` on ${course.name}` : ""} — ${n} ${n === 1 ? "session" : "sessions"} booked`,
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[18px] tracking-[-0.02em]">
                        {initialContactId && person
                            ? `Enrol ${person.name}`
                            : "Enrol someone"}
                    </DialogTitle>
                    <DialogDescription>
                        {course
                            ? `${course.name} · ${seatsLeftLine(course)}`
                            : "There is no open course with a seat left."}
                    </DialogDescription>
                </DialogHeader>
                {course ? (
                    <div className="grid gap-4">
                        {choosing ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor={ids.course}>Course</Label>
                                <OptionSelect
                                    id={ids.course}
                                    value={courseId}
                                    onValueChange={chooseCourse}
                                    options={courses.map((c) => ({
                                        value: c.id,
                                        label: `${c.name} · ${seatsLeftLine(c)}`,
                                    }))}
                                />
                            </div>
                        ) : null}
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.who}>Who</Label>
                            <ContactPicker
                                id={ids.who}
                                contacts={contacts}
                                value={contactId}
                                onValueChange={setContactId}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.price}>
                                What they pay ({course.currency})
                            </Label>
                            <Input
                                id={ids.price}
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                inputMode="decimal"
                                aria-invalid={!priceOk}
                            />
                        </div>
                        <p className="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted-foreground">
                            {booksLine(course)}
                            {invoicesOnEnrol
                                ? ` · invoice ${priceOk ? invoiceMoney(price.trim(), course.currency) : "—"}. Nothing is charged and nobody is contacted.`
                                : ". Payments is off, so no invoice is issued."}
                        </p>
                    </div>
                ) : null}
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        disabled={busy || !contactId || !course}
                        onClick={() => void save()}
                    >
                        {busy ? "Enrolling…" : "Enrol and book"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
