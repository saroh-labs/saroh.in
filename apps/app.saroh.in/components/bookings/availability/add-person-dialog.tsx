"use client";

import { Refusal } from "@/components/shared/states/refusal";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormDialog } from "@/components/shared/forms/form-dialog";
import { runAction } from "@/lib/api/run-action";
import { firstName } from "@/lib/names";
import { addPerson } from "@/lib/staff/actions";
import { defaultWeek, weekLines } from "@/lib/staff/starting-week";

/** The default week in words: "Monday to Saturday, 9:00 am to 6:00 pm". */
const DEFAULT_WORDS = weekLines(defaultWeek())
    .filter((line) => line.hours)
    .map((line) => `${line.days}, ${line.hours}`)
    .join(", and ");

/**
 * The dialog's one sentence about the week they start with, by what is
 * known where it opens: the opening hours, the default week when the
 * business has none, or either when the opener can't tell (the calendar).
 */
export function weekSentence(week?: "opening" | "default"): string {
    const then = "Change their hours any time. They don't need a sign-in.";
    return week === "opening"
        ? `They start with your opening hours. ${then}`
        : week === "default"
          ? `They start with ${DEFAULT_WORDS}. ${then}`
          : `They start with your opening hours, or ${DEFAULT_WORDS} if you haven't set any. ${then}`;
}

/**
 * Someone new on the diary (U3): a name and what they do. A trainer at the
 * front desk may never log in, so no login is needed. Nobody starts with
 * an empty week: they get the business's opening hours as their weekly
 * hours, and the dialog says so. Like everyone who takes bookings with no
 * login they use a team seat (DEC-105), which is said only where the plan
 * counts seats (`seatNote`); a full team is refused by the API and said
 * here, and a refusal keeps the dialog open with what was typed. Which
 * services they take is set on Services.
 *
 * Opened from Availability and, so nobody is sent away to add a name, from
 * the calendar's "Nobody is on the diary yet". Cancel, Escape and the close
 * button drop what was typed, it can't be dismissed while it is adding, and
 * the keyboard goes back to the button that opened it.
 */
export function AddPersonDialog({
    open,
    onOpenChange,
    onAdded,
    hoursHint = "Their week is below. Change it any time.",
    week,
    seatNote,
    hoursScreen = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded?: (staffId: string) => void;
    /** Where their hours are changed from here, said once they are added. */
    hoursHint?: string;
    /** Which week they will start with, when the opener knows. */
    week?: "opening" | "default";
    /** The seat this uses, said only when the plan counts seats. */
    seatNote?: string | null;
    /**
     * Opened on Hours and time off (U17, BKMAvailability "add someone"):
     * its words, and the button names them ("Add Ishaan").
     */
    hoursScreen?: boolean;
}) {
    const router = useRouter();
    const ids = { name: useId(), title: useId() };
    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    const nameless = tried && !name.trim();

    function close() {
        if (saving) return;
        setName("");
        setTitle("");
        setError(null);
        setTried(false);
        onOpenChange(false);
    }

    async function add() {
        setTried(true);
        if (!name.trim() || saving) return;
        setError(null);
        const res = await runAction(
            () =>
                addPerson({
                    name: name.trim(),
                    title: title.trim() || undefined,
                }),
            { setBusy: setSaving, quiet: true, onUnreached: setError },
        );
        if (!res) return;
        if (!res.ok) {
            setError(res.error);
            return;
        }
        showSuccess(`${res.data.name} added.`, hoursHint);
        setName("");
        setTitle("");
        setTried(false);
        onOpenChange(false);
        onAdded?.(res.data.id);
        router.refresh();
    }

    const sentence = hoursScreen
        ? week === "default"
            ? `They start with ${DEFAULT_WORDS} and don't need a sign-in.`
            : "They start with your opening hours and don't need a sign-in."
        : weekSentence(week);
    return (
        <FormDialog
            open={open}
            size="sm"
            title={
                hoursScreen
                    ? "Add someone who takes bookings"
                    : "New person who takes bookings"
            }
            description={seatNote ? `${sentence} ${seatNote}` : sentence}
            pending={saving}
            saveLabel={
                hoursScreen && name.trim()
                    ? `Add ${firstName(name)}`
                    : "Add person"
            }
            savingLabel="Adding…"
            fieldsClassName="gap-0"
            onClose={close}
            onSubmit={add}
        >
            <Label htmlFor={ids.name} className="text-[12.5px]">
                Name
            </Label>
            <Input
                id={ids.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                aria-invalid={Boolean(error) || nameless}
                autoComplete="off"
            />
            {nameless ? (
                <p
                    role="alert"
                    className="mt-1 text-[12.5px] text-destructive-subtle-foreground"
                >
                    They need a name.
                </p>
            ) : null}
            <Label htmlFor={ids.title} className="mt-2.5 block text-[12.5px]">
                What they do{" "}
                <span className="font-normal text-muted-foreground">
                    (optional)
                </span>
            </Label>
            <Input
                id={ids.title}
                value={title}
                placeholder="Trainer, Yoga teacher…"
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                autoComplete="off"
            />
            <Refusal className="mt-2">{error}</Refusal>
        </FormDialog>
    );
}
