"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Label } from "./label";

/**
 * One field: its label above, its control, and one line under it.
 *
 * ```tsx
 * <Field label="Name" error={errors.name}>
 *     <Input value={name} onChange={…} />
 * </Field>
 * ```
 *
 * - The label sits above the control at the one label size.
 * - `hint` is one quiet line under the control.
 * - `error` replaces the hint, in the same place, so the form does not grow
 *   twice. It is an alert, so a screen reader hears it when it appears.
 * - `optional` writes "(optional)" in the label. Nothing else is marked: a
 *   field with no mark is one the form needs. Never the word "Required", an
 *   "Optional" chip, a hint or a placeholder that says it.
 * - The control gets its `id`, `aria-describedby` and `aria-invalid` here.
 *   A single control is passed as the child and is given them. Where the
 *   control is not the direct child (a box with a button beside it), pass
 *   a function and spread what it receives onto the control. The line under
 *   the field has the id `${id}-note`, for a control wired by hand.
 *
 * It needs no form library: `error` is a string from anywhere (a `useState`
 * draft, a Server Action's field error, react-hook-form's `fieldState`).
 * `FormMessage` in `form.tsx` draws the same `FieldError`.
 *
 * When to check: on leaving the field and on submit, with the first field in
 * error focused (`focusFirstError`). A sheet checks when its Save is
 * pressed.
 */
export interface FieldControlProps {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
}

export interface FieldProps extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    "children"
> {
    label: React.ReactNode;
    /** One line under the control. An error takes its place. */
    hint?: React.ReactNode;
    /** What is wrong, in a sentence. Falsy means nothing is. */
    error?: React.ReactNode;
    /** Writes "(optional)" after the label. */
    optional?: boolean;
    /**
     * The id of a control the caller wires by hand (one inside a wrapper,
     * say). The label points at it and nothing is added to the child: the
     * caller gives the control this `id`, `aria-invalid`, and
     * `aria-describedby={`${id}-note`}`. Without it the child is wired
     * here (a child's own `id` wins).
     */
    htmlFor?: string;
    /**
     * Several controls under one label (a set of ticks, a choice of two).
     * The label names the group instead of pointing at one control.
     */
    group?: boolean;
    /** The label is for screen readers only (a cell in a table of fields). */
    labelHidden?: boolean;
    /**
     * Say so when the label or the hint names a record (a customer, a
     * courier, a product's own option): the whole field is then masked in a
     * session recording. Left out, the label, the hint and the error are
     * read as Saroh's own words. The control never is.
     */
    holdsData?: boolean;
    /**
     * One control (it is given the wiring), a function that places the
     * wiring itself, or several controls, which the label then names as a
     * group.
     */
    children:
        React.ReactNode | ((control: FieldControlProps) => React.ReactNode);
}

const hasText = (node: React.ReactNode) =>
    node !== undefined && node !== null && node !== false && node !== "";

function Field({
    label,
    hint,
    error,
    optional = false,
    htmlFor,
    group: asGroup = false,
    labelHidden = false,
    holdsData = false,
    className,
    children,
    ...props
}: FieldProps) {
    const made = React.useId();
    const single =
        typeof children !== "function" &&
        React.isValidElement<Record<string, unknown>>(children)
            ? children
            : null;
    // Several controls under one label are a group, asked for or not.
    const group = asGroup || (typeof children !== "function" && !single);
    const childId = single?.props.id as string | undefined;
    const id = htmlFor ?? childId ?? `${made}-control`;
    // Named after the control, so a caller that knows the control's id
    // knows the note's (`${id}-note`) without asking.
    const labelId = `${id}-label`;
    const noteId = `${id}-note`;
    const invalid = hasText(error);
    const noted = invalid || hasText(hint);

    const control: FieldControlProps = {
        id,
        ...(noted ? { "aria-describedby": noteId } : {}),
        ...(invalid ? { "aria-invalid": true as const } : {}),
    };

    let body: React.ReactNode;
    if (typeof children === "function") {
        body = children(control);
    } else if (group || !single || htmlFor !== undefined) {
        body = children;
    } else {
        const own = single.props["aria-describedby"] as string | undefined;
        body = React.cloneElement(single, {
            ...control,
            ...(noted && own && !own.split(" ").includes(noteId)
                ? { "aria-describedby": `${own} ${noteId}` }
                : {}),
            // A control that already says it is invalid keeps saying so.
            ...(single.props["aria-invalid"] !== undefined && !invalid
                ? { "aria-invalid": single.props["aria-invalid"] }
                : {}),
        });
    }

    const labelText = (
        <>
            {label}
            {optional ? (
                <span className="font-normal text-muted-foreground">
                    {" "}
                    (optional)
                </span>
            ) : null}
        </>
    );

    return (
        <div
            className={cn("min-w-0 space-y-1.5", className)}
            data-slot="field"
            data-invalid={invalid ? "" : undefined}
            {...(holdsData ? { "data-ph-mask": "" } : {})}
            {...(group
                ? {
                      role: "group",
                      "aria-labelledby": labelId,
                      "aria-describedby": noted ? noteId : undefined,
                  }
                : {})}
            {...props}
        >
            {group ? (
                <div
                    id={labelId}
                    // A group's name, read as `Label`'s is.
                    data-ph-unmask=""
                    className={cn(
                        "text-[0.78125rem] font-medium leading-none",
                        labelHidden && "sr-only",
                    )}
                >
                    {labelText}
                </div>
            ) : (
                <Label
                    id={labelId}
                    htmlFor={id}
                    className={labelHidden ? "sr-only" : undefined}
                >
                    {labelText}
                </Label>
            )}
            {body}
            {invalid ? (
                <FieldError id={noteId}>{error}</FieldError>
            ) : hasText(hint) ? (
                <FieldHint id={noteId}>{hint}</FieldHint>
            ) : null}
        </div>
    );
}

/**
 * What is wrong with a field, under it. The one error line: 12.5px, the
 * destructive colour, said as an alert. Renders nothing with nothing to say.
 */
const FieldError = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
    if (!hasText(children)) return null;
    return (
        <p
            ref={ref}
            role="alert"
            data-slot="field-error"
            // What was wrong, in the form's own words: a session recording
            // may read it. Digits and emails are hidden even here.
            data-ph-unmask=""
            className={cn(
                "text-[0.78125rem] font-medium leading-snug text-destructive",
                className,
            )}
            {...props}
        >
            {children}
        </p>
    );
});
FieldError.displayName = "FieldError";

/** The quiet line under a field. */
const FieldHint = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        data-slot="field-hint"
        // Help text is Saroh's own words: a recording may read it. One that
        // names a record says `data-ph-mask` (or the field `holdsData`).
        data-ph-unmask=""
        className={cn(
            "text-[0.78125rem] leading-snug text-muted-foreground",
            className,
        )}
        {...props}
    />
));
FieldHint.displayName = "FieldHint";

/**
 * Put the keyboard on the first field in error, in the order the form
 * draws them, and bring it into view. Call it after a submit (or a leave)
 * has set the errors: it waits a frame for them to be drawn.
 */
function focusFirstError(root?: ParentNode | null) {
    const run = () => {
        const scope = root ?? document;
        const first = scope.querySelector<HTMLElement>(
            '[aria-invalid="true"]:not([disabled])',
        );
        if (!first) return;
        first.focus({ preventScroll: true });
        first.scrollIntoView({ block: "center", behavior: "auto" });
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
    } else {
        run();
    }
}

export { Field, FieldError, FieldHint, focusFirstError };
