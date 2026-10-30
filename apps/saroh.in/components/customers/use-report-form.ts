import type { FormEvent } from "react";
import { useRef, useState } from "react";

import { CUSTOMERS } from "@/content/customers";
import type { ReportField, ReportResult } from "@/lib/business-report";
import { prefilledSite, reportProblem } from "@/lib/business-report";
import { readAddress } from "@/lib/page-address";
import { useBrowserValue } from "@/lib/use-browser-value";

const copy = CUSTOMERS.form;

type Field = ReportField;

type State =
    | { at: "idle" | "sending" | "done" }
    | { at: "error"; message: string; field: Field | null };

const FIELD_MESSAGE: Record<Field, string> = {
    site: copy.badSite,
    message: copy.shortMessage,
    email: copy.badEmail,
    phone: copy.badPhone,
};

const isField = (failure: string): failure is Field => failure in FIELD_MESSAGE;

async function postReport(body: Record<Field, string>): Promise<ReportResult> {
    const res = await fetch("/api/business-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return (await res.json()) as ReportResult;
}

/**
 * The report form's state and send (DEC-183: the rules stay out of the
 * drawing). See `ReportForm` for what it does on screen.
 */
export function useReportForm() {
    const given = useBrowserValue(() => prefilledSite(readAddress()), "");
    const [typed, setSite] = useState<string | null>(null);
    const site = typed ?? given;
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [state, setState] = useState<State>({ at: "idle" });
    const fields = useRef<
        Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>
    >({});

    /** Says what a field needs and puts the keyboard on it. */
    const fault = (field: Field) => {
        setState({ at: "error", message: FIELD_MESSAGE[field], field });
        fields.current[field]?.focus();
    };

    const clear = () => {
        if (state.at === "error") setState({ at: "idle" });
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const problem = reportProblem({ site, message, email, phone });
        if (problem) {
            fault(problem);
            return;
        }
        setState({ at: "sending" });
        try {
            const body = await postReport({
                site: site.trim(),
                message: message.trim(),
                email: email.trim(),
                phone: phone.trim(),
            });
            if (body.sent) {
                setState({ at: "done" });
                return;
            }
            const failure = body.failure;
            if (isField(failure)) {
                fault(failure);
                return;
            }
            setState({
                at: "error",
                message:
                    failure === "rate-limited" ? copy.rateLimited : copy.failed,
                field: null,
            });
        } catch {
            setState({ at: "error", message: copy.failed, field: null });
        }
    };

    const wrong = (field: Field) =>
        state.at === "error" && state.field === field;
    const describedBy = (field: Field, hint?: string) =>
        [wrong(field) ? "report-error" : null, hint]
            .filter(Boolean)
            .join(" ") || undefined;

    const fieldRef =
        (field: Field) =>
        (el: HTMLInputElement | HTMLTextAreaElement | null) => {
            fields.current[field] = el;
        };

    return {
        site,
        setSite,
        message,
        setMessage,
        email,
        setEmail,
        phone,
        setPhone,
        state,
        clear,
        onSubmit,
        fieldRef,
        wrong,
        describedBy,
    };
}
