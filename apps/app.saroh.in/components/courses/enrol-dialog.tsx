"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { FormSheet } from "@/components/shared/form-sheet";
import { OptionSelect } from "@/components/shared/option-select";
import { runAction } from "@/lib/api/run-action";
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
 * Enrol someone: who, and what they pay, in a side sheet. It says what it
 * books and charges before anything happens, and says nothing about an
 * invoice when Payments is off, because none is issued.
 *
 * A course page passes its one course; a contact page passes the courses
 * open to them and its own person, and the sheet asks which course instead
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
        const res = await runAction(
            () =>
                enrol(course.id, {
                    contactId,
                    ...(price.trim() !== course.price
                        ? { price: price.trim() }
                        : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            `${person?.name ?? "They"} enrolled${choosing ? ` on ${course.name}` : ""}.`,
            `${n} ${n === 1 ? "session" : "sessions"} booked.`,
        );
        onOpenChange(false);
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            title={
                initialContactId && person
                    ? `Enrol ${person.name}`
                    : "Enrol someone"
            }
            description={
                course
                    ? `${course.name} · ${seatsLeftLine(course)}`
                    : "There is no open course with a seat left."
            }
            pending={busy}
            doneOnly={!course}
            doneLabel="Close"
            saveLabel="Enrol and book"
            savingLabel="Enrolling…"
            fieldsClassName="block"
            onClose={() => onOpenChange(false)}
            onSubmit={save}
        >
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
                            ? ` · invoice ${priceOk ? invoiceMoney(price.trim(), course.currency) : "not set"}. Nothing is charged and nobody is contacted.`
                            : ". Payments is off, so no invoice is issued."}
                    </p>
                </div>
            ) : null}
        </FormSheet>
    );
}
