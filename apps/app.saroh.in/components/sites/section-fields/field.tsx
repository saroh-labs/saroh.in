import { Label } from "@saroh/ui/label";
import { cloneElement, isValidElement, useId } from "react";

import { FIELD_LABEL } from "./constants";

/**
 * Small labelled field wrapper to keep the per-type editors terse.
 *
 * The label names its control: a single element child is given an id (unless
 * it has one) and the label points at it, so "Heading" is the field's
 * accessible name, not its placeholder. A child made of several controls
 * (a picker, a group) keeps its own names; the label stays a caption.
 */
export function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    const generated = useId();
    const single = isValidElement<{ id?: string }>(children) ? children : null;
    const id = single ? (single.props.id ?? generated) : undefined;
    return (
        <div className="grid gap-1.5">
            <Label className={FIELD_LABEL} htmlFor={id}>
                {label}
            </Label>
            {single && single.props.id === undefined
                ? cloneElement(single, { id })
                : children}
        </div>
    );
}
