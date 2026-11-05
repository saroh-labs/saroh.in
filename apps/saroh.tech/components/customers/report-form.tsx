"use client";

import { Button } from "@saroh/marketing/button";
import type { FormEvent } from "react";
import { useRef, useState, useSyncExternalStore } from "react";

import { Field, TextArea } from "@/components/shared/field";
import { CUSTOMERS, REPORT_FIELDS } from "@/content/customers";
import type { ReportBody, ReportField } from "@/lib/business-report";
import {
    prefilledSite,
    REPORT_LIMITS,
    reportProblems,
    sendReport,
} from "@/lib/business-report";

const copy = CUSTOMERS.form;
const noChange = () => () => undefined;
const faultOf = (name: ReportField) =>
    REPORT_FIELDS.find((f) => f.name === name)?.fault ?? "";

type State =
    | { at: "idle" | "sending" | "done" }
    | { at: "fields"; fields: ReportField[] }
    | { at: "error"; message: string };

/**
 * Report a business: the site's address, what happened, and the reporter's
 * own email and phone, as saroh.in's form asks. Send checks every field, as the
 * contact form does: each at fault says what it needs under itself, and the
 * keyboard goes to the first. A send that fails keeps everything typed.
 */
export function ReportForm({ apiUrl }: { apiUrl: string }) {
    const given = useSyncExternalStore(
        noChange,
        () => prefilledSite(window.location.search),
        () => "",
    );
    const [typed, setTyped] = useState<Partial<ReportBody>>({});
    const [state, setState] = useState<State>({ at: "idle" });
    const form = useRef<HTMLFormElement>(null);

    const value = (name: ReportField) =>
        typed[name] ?? (name === "site" ? given : "");

    const fault = (fields: ReportField[]) => {
        setState({ at: "fields", fields });
        form.current
            ?.querySelector<HTMLElement>(`[name="${fields[0]}"]`)
            ?.focus();
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const body: ReportBody = {
            site: value("site").trim(),
            message: value("message").trim(),
            email: value("email").trim(),
            phone: value("phone").trim(),
        };
        const problems = reportProblems(body);
        if (problems.length > 0) {
            fault(problems);
            return;
        }
        setState({ at: "sending" });
        const result = await sendReport(apiUrl, body);
        if (result === "sent") setState({ at: "done" });
        else if (result === "site") fault(["site"]);
        else {
            setState({
                at: "error",
                message:
                    result === "rate-limited" ? copy.rateLimited : copy.failed,
            });
        }
    };

    if (state.at === "done") {
        return (
            <p
                role="status"
                className="m-0 max-w-[600px] rounded-[10px] border border-border bg-card px-4 py-3 text-[15px] leading-[1.55] text-foreground"
            >
                {copy.done}
            </p>
        );
    }

    return (
        <form
            ref={form}
            noValidate
            onSubmit={onSubmit}
            aria-label={copy.title}
            className="grid max-w-[600px] gap-4"
        >
            {REPORT_FIELDS.map((field) => {
                const shared = {
                    id: `report-${field.name}`,
                    name: field.name,
                    label: field.label,
                    hint: field.hint,
                    error:
                        state.at === "fields" &&
                        state.fields.includes(field.name)
                            ? faultOf(field.name)
                            : undefined,
                    "aria-required": true,
                    maxLength: REPORT_LIMITS[field.name],
                    value: value(field.name),
                    onChange: (e: { target: { value: string } }) => {
                        setTyped({ ...typed, [field.name]: e.target.value });
                        if (state.at === "fields") {
                            // Mending one field leaves the others' words up.
                            setState({
                                at: "fields",
                                fields: state.fields.filter(
                                    (f) => f !== field.name,
                                ),
                            });
                        } else if (state.at === "error") {
                            setState({ at: "idle" });
                        }
                    },
                };
                return field.name === "message" ? (
                    <TextArea key={field.name} {...shared} rows={5} />
                ) : (
                    <Field
                        key={field.name}
                        {...shared}
                        type={
                            field.name === "email"
                                ? "email"
                                : field.name === "phone"
                                  ? "tel"
                                  : "text"
                        }
                        autoComplete={
                            field.name === "email"
                                ? "email"
                                : field.name === "phone"
                                  ? "tel"
                                  : "off"
                        }
                        placeholder={field.placeholder}
                    />
                );
            })}
            {state.at === "error" ? (
                <p
                    role="alert"
                    className="m-0 text-[14px] font-medium text-destructive"
                >
                    {state.message}
                </p>
            ) : null}
            <div>
                <Button
                    type="submit"
                    size="md"
                    className="w-auto px-[18px]"
                    disabled={state.at === "sending"}
                >
                    {state.at === "sending" ? copy.sending : copy.submit}
                </Button>
            </div>
        </form>
    );
}
