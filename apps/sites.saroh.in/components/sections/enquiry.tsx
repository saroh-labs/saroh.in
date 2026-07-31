"use client";

import { useId, useState } from "react";

import { env } from "@/env";
import type { EnquiryContent } from "@/lib/publication";
import { cn } from "@/lib/utils";

import { ctaClasses } from "./cta";

/**
 * `enquiry` v1 — the PUBLIC enquiry form (S3-004). It renders the fields
 * snapshotted into the publication and, on submit, POSTs to the guardless
 * public endpoint:
 *
 *   POST ${NEXT_PUBLIC_API_URL}/public/forms/${formId}/submit
 *   body: { data: Record<string,string>, idempotencyKey }
 *
 * The endpoint derives the owning organization from the Form (never from this
 * client), validates `data` against the Form's fields, and creates the
 * contact + lead. The Form is kept in sync with these snapshotted fields by the
 * editor on save, so what the visitor fills in is exactly what the API expects.
 *
 * A section with no `formId` (never synced) renders nothing rather than POST to
 * a broken URL. `idempotencyKey` is stable per mount so a double-click / retry
 * can't create two leads.
 */

const API_URL =
    env.NEXT_PUBLIC_API_URL ?? env.API_URL ?? "https://api.saroh.in";

type SubmitState =
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "error"; message: string };

/** Map an enquiry field type to the native input type / control. */
function inputTypeFor(type: EnquiryContent["fields"][number]["type"]): string {
    switch (type) {
        case "email":
            return "email";
        case "tel":
            return "tel";
        default:
            return "text";
    }
}

export default function EnquirySection({
    content,
}: {
    content: EnquiryContent;
}) {
    // A stable id per mount for accessible label ids.
    const baseId = useId();
    // A stable idempotency key per mount so a double-click / retry can't create
    // two leads. Lazy `useState` initializer runs exactly once.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
    );

    const [values, setValues] = useState<Record<string, string>>({});
    const [state, setState] = useState<SubmitState>({ kind: "idle" });

    // No backing Form → nothing to submit against. Render nothing.
    if (!content.formId) return null;

    const formId = content.formId;
    const submitting = state.kind === "submitting";

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setState({ kind: "submitting" });
        try {
            const res = await fetch(
                `${API_URL}/public/forms/${encodeURIComponent(formId)}/submit`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ data: values, idempotencyKey }),
                },
            );

            if (res.ok) {
                setState({ kind: "success" });
                return;
            }

            if (res.status === 429) {
                setState({
                    kind: "error",
                    message:
                        "You've sent this a few times — please wait a moment and try again.",
                });
                return;
            }

            const body = (await res.json().catch(() => null)) as {
                message?: string;
            } | null;
            setState({
                kind: "error",
                message:
                    body?.message ??
                    "Something went wrong — please check your details and try again.",
            });
        } catch {
            setState({
                kind: "error",
                message:
                    "We couldn't reach the server — please check your connection and try again.",
            });
        }
    }

    if (state.kind === "success") {
        return (
            <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
                <div className="rounded-xl border border-site-border bg-site-surface p-8 text-center">
                    <p className="text-lg font-medium text-site-fg">
                        {content.successMessage ??
                            "Thanks — we'll be in touch soon."}
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
            {content.title ? (
                <h2 className="text-3xl font-bold tracking-tight text-site-fg">
                    {content.title}
                </h2>
            ) : null}
            {content.description ? (
                <p className="mt-3 text-site-body">{content.description}</p>
            ) : null}

            <form className="mt-8 grid gap-5" onSubmit={onSubmit} noValidate>
                {content.fields.map((field, i) => {
                    const fieldId = `${baseId}-${i}`;
                    const label = field.label || field.name;
                    const shared = {
                        id: fieldId,
                        name: field.name,
                        required: field.required ?? false,
                        value: values[field.name] ?? "",
                        disabled: submitting,
                        onChange: (
                            e: React.ChangeEvent<
                                HTMLInputElement | HTMLTextAreaElement
                            >,
                        ) =>
                            setValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                            })),
                    };
                    const controlClasses =
                        "w-full max-w-full rounded-lg border border-site-border bg-site-surface px-3 py-2 text-site-fg outline-none focus:border-site-border focus:ring-2 focus:ring-site-border ";
                    return (
                        <div key={i} className="grid gap-1.5">
                            <label
                                htmlFor={fieldId}
                                className="text-sm font-medium text-site-fg"
                            >
                                {label}
                                {field.required ? (
                                    <span
                                        aria-hidden="true"
                                        className="text-red-600"
                                    >
                                        {" *"}
                                    </span>
                                ) : null}
                            </label>
                            {field.type === "textarea" ? (
                                <textarea
                                    {...shared}
                                    rows={4}
                                    className={controlClasses}
                                />
                            ) : (
                                <input
                                    {...shared}
                                    type={inputTypeFor(field.type)}
                                    className={controlClasses}
                                />
                            )}
                        </div>
                    );
                })}

                {state.kind === "error" ? (
                    <p role="alert" className="text-sm text-red-600">
                        {state.message}
                    </p>
                ) : null}

                <button
                    type="submit"
                    disabled={submitting}
                    className={cn(
                        ctaClasses("primary"),
                        "w-fit disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {submitting ? "Sending…" : (content.submitLabel ?? "Send")}
                </button>
            </form>
        </section>
    );
}
