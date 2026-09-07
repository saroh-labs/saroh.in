import { Label } from "@saroh/ui/label";

import { FIELD_LABEL } from "./constants";

/** Small labelled field wrapper to keep the per-type editors terse. */
export function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <Label className={FIELD_LABEL}>{label}</Label>
            {children}
        </div>
    );
}
