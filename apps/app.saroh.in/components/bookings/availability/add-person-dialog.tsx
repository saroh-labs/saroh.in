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
import { useId, useState } from "react";

import { createStaff } from "@/lib/staff/actions";

/**
 * Someone new on the diary (U3): a name and what they do. A trainer at the
 * front desk may never log in, so no account is needed; their hours are set
 * on this page once they are added, and which services they take on
 * Services.
 */
export function AddPersonDialog({
    open,
    onOpenChange,
    onAdded,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: (staffId: string) => void;
}) {
    const router = useRouter();
    const ids = { name: useId(), title: useId() };
    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        showSuccess(`${res.data.name} is on the diary. Set their hours below.`);
        setName("");
        setTitle("");
        onOpenChange(false);
        onAdded(res.data.id);
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[420px] gap-0 rounded-[14px] px-5 py-[18px]">
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
                        They need no account. Their hours start empty, so nobody
                        can book them until you add some.
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
                            onClick={() => onOpenChange(false)}
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
