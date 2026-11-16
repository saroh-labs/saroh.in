import type { FormEvent, ReactNode, Ref } from "react";

import { Button } from "../buttons/button";

/** The report form's thanks, in place of the form once it has gone. */
export function ReportDone({ children }: { children: ReactNode }) {
    return (
        <p
            role="status"
            className="m-0 max-w-[600px] rounded-mk-crop border border-border bg-card px-4 py-3 text-[15px] leading-[1.55] text-foreground"
        >
            {children}
        </p>
    );
}

/**
 * The "report a site" form on both editions' customers page: its fields
 * (`children`), the one line a failed send says (`error`) and Send, which
 * says it is sending and can't be pressed twice.
 */
export function ReportFormFrame({
    formRef,
    onSubmit,
    label,
    error,
    errorId,
    sending,
    sendLabel,
    sendingLabel,
    children,
}: {
    formRef?: Ref<HTMLFormElement>;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    label: string;
    /** The failed send's line, or null. */
    error: string | null;
    errorId?: string;
    sending: boolean;
    sendLabel: string;
    sendingLabel: string;
    children: ReactNode;
}) {
    return (
        <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            aria-label={label}
            className="grid max-w-[600px] gap-4"
        >
            {children}
            {error !== null ? (
                <p
                    id={errorId}
                    role="alert"
                    className="m-0 text-[14px] font-medium text-destructive"
                >
                    {error}
                </p>
            ) : null}
            <div>
                <Button type="submit" size="kit" disabled={sending}>
                    {sending ? sendingLabel : sendLabel}
                </Button>
            </div>
        </form>
    );
}
