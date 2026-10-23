"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

/**
 * A role's name, in New role and in a role's own sheet: 40 characters, and
 * "A role needs a name." once a save has been tried with it blank.
 */
export function RoleNameField({
    id,
    value,
    onChange,
    nameless,
    disabled,
    placeholder,
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    /** A save was tried with no name. */
    nameless: boolean;
    disabled: boolean;
    placeholder?: string;
}) {
    const problem = `${id}-problem`;
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>Name</Label>
            <Input
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                maxLength={40}
                disabled={disabled}
                aria-invalid={nameless || undefined}
                aria-describedby={nameless ? problem : undefined}
            />
            {nameless ? (
                <p
                    id={problem}
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    A role needs a name.
                </p>
            ) : null}
        </div>
    );
}
