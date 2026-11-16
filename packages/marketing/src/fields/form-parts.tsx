import type { FormEvent, ReactNode, Ref } from "react";

import { Button } from "../buttons/button";

/*
 * The marketing forms' frames: /contact's and the customers page's "report
 * a site". Each edition keeps its own fields and state.
 */

/**
 * /contact's form frame on both editions: the form, labelled by its title,
 * with the title and its note over the fields (`children`).
 */
export function ContactFormFrame({
    formRef,
    onSubmit,
    title,
    note,
    children,
}: {
    formRef?: Ref<HTMLFormElement>;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    title: string;
    note: string;
    children: ReactNode;
}) {
    return (
        <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="contact-form-title"
            className="grid gap-[18px]"
        >
            <div className="grid gap-1">
                <h2
                    id="contact-form-title"
                    className="m-0 font-display text-mk-kit-h3 font-bold"
                >
                    {title}
                </h2>
                <span className="text-[14px] text-muted-foreground">
                    {note}
                </span>
            </div>
            {children}
        </form>
    );
}

/**
 * The card once a message has gone: an optional mark, the thanks (focused
 * by the form, `thanksRef`), where the reply goes (`children`) and "Send
 * another message". It says the name and the email back, so it is masked in
 * a session recording (DEC-125).
 */
export function ContactSent({
    mark,
    thanksRef,
    title,
    againLabel,
    onAgain,
    children,
}: {
    mark?: ReactNode;
    thanksRef: Ref<HTMLHeadingElement>;
    title: string;
    againLabel: string;
    onAgain: () => void;
    children: ReactNode;
}) {
    return (
        <div
            role="status"
            className="grid justify-items-start gap-[14px] py-3"
            data-ph-mask=""
        >
            {mark}
            <h2
                ref={thanksRef}
                tabIndex={-1}
                className="m-0 font-display text-mk-kit-h3 font-bold focus:outline-none"
            >
                {title}
            </h2>
            <p className="m-0 max-w-[44ch] text-[16px] leading-[1.6] text-mk-copy">
                {children}
            </p>
            <Button variant="secondary" size="sm" onClick={onAgain}>
                {againLabel}
            </Button>
        </div>
    );
}

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
