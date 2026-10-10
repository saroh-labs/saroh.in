"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormDialog } from "@/components/shared/form-dialog";
import { runAction } from "@/lib/api/run-action";
import { createStaff } from "@/lib/staff/actions";

/**
 * Someone new on the diary (U3): a name and what they do. A trainer at the
 * front desk may never log in, so no login is needed, but like everyone who
 * takes bookings they use a team seat (DEC-105); a full team is refused by
 * the API and said here, and a refusal keeps the dialog open with what was
 * typed. Their hours are set on Availability once they are added, and which
 * services they take on Services.
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
    hoursHint = "Set their hours below.",
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded?: (staffId: string) => void;
    /** Where their hours are set from here, said once they are added. */
    hoursHint?: string;
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
                createStaff({
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

    return (
        <FormDialog
            open={open}
            size="sm"
            title="Add someone who takes bookings"
            description="They don't need a login, but they use a team seat, as everyone who takes bookings does. Their hours start empty, so nobody can book them until you add some."
            pending={saving}
            saveLabel="Add person"
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
                className="mt-1 h-9"
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
                className="mt-1 h-9"
                autoComplete="off"
            />
            {error ? (
                <p
                    role="alert"
                    className="mt-2 text-[12.5px] text-destructive-subtle-foreground"
                >
                    {error}
                </p>
            ) : null}
        </FormDialog>
    );
}
