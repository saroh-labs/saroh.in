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
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

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
    const opener = useRef<HTMLElement | null>(null);

    function close() {
        if (saving) return;
        setName("");
        setTitle("");
        setError(null);
        onOpenChange(false);
    }

    async function add() {
        if (!name.trim() || saving) return;
        setSaving(true);
        setError(null);
        const res = await createStaff({
            name: name.trim(),
            title: title.trim() || undefined,
        });
        setSaving(false);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        showSuccess(`${res.data.name} is on the diary. ${hoursHint}`);
        setName("");
        setTitle("");
        onOpenChange(false);
        onAdded?.(res.data.id);
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => (o ? onOpenChange(true) : close())}
        >
            <DialogContent
                className="max-w-[420px] gap-0 rounded-[14px] px-5 py-[18px]"
                onOpenAutoFocus={() => {
                    // Before the dialog takes the keyboard: who opened it.
                    opener.current =
                        document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                }}
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    if (opener.current?.isConnected) opener.current.focus();
                }}
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void add();
                    }}
                >
                    <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        Add someone who takes bookings
                    </DialogTitle>
                    <DialogDescription className="mb-3 mt-[3px] text-[12.5px] text-muted-foreground">
                        They don&apos;t need a login, but they use a team seat,
                        as everyone who takes bookings does. Their hours start
                        empty, so nobody can book them until you add some.
                    </DialogDescription>
                    <Label htmlFor={ids.name} className="text-[12.5px]">
                        Name
                    </Label>
                    <Input
                        id={ids.name}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 h-9"
                        aria-invalid={Boolean(error)}
                        autoComplete="off"
                    />
                    <Label
                        htmlFor={ids.title}
                        className="mt-2.5 block text-[12.5px]"
                    >
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
                    <div className="mt-3.5 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-[38px] rounded-[9px] px-4 text-[14px]"
                            disabled={saving}
                            onClick={close}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="h-[38px] rounded-[9px] px-4 text-[14px]"
                            disabled={!name.trim() || saving}
                        >
                            {saving ? "Adding…" : "Add them"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
