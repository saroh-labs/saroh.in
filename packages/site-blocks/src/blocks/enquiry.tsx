"use client";

import { useEffect, useId, useState } from "react";

import type { RenderedEnquiry } from "@saroh/block-contract";
import { cn } from "../lib/utils";

import type { SignedInCustomer } from "../account/api";
import type { SendResult } from "../account/messages";
import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { useTestRelease } from "../test-release/context";
import { TestReleaseStop } from "../test-release/test-release-stop";
import { isTestReleaseRefusal } from "../test-release/words";
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
 *
 * On a test release (DEC-071, T6) Send posts nothing: the form says what the
 * live site would do with it instead. The API refuses a post from a test
 * host on its own too (409 `TEST_RELEASE`), and that answer reads the same.
 */

type SubmitState =
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "error"; message: string }
    /** A test release: nothing was sent, and the form says why. */
    | { kind: "test-release" };

/** What the live site does with an enquiry, for a test release's stop. */
const ENQUIRY_LIVE = "this form sends your message to the business";
/** And with a message to the customer's thread. */
const THREAD_LIVE = "this sends your message to the business's inbox";

/**
 * The message a link asked for: `?about=` names a product "Ask about
 * ordering" sent (G13), `?join=` a plan "Ask about joining" sent (G9),
 * `?pack=` a class pack "Ask about this pack" sent (G20).
 */
export function askedFromSearch(search: string): string | null {
    const read = (key: string) => {
        const value = new URLSearchParams(search).get(key)?.trim() ?? "";
        return value.length > 0 ? value.slice(0, 200) : null;
    };
    const plan = read("join");
    if (plan) return `I'd like to join ${plan}. `;
    const pack = read("pack");
    if (pack) return `I'd like to buy ${pack}. `;
    const product = read("about");
    return product ? `I'd like to order ${product}. ` : null;
}

function askedFromUrl(): string | null {
    try {
        return askedFromSearch(window.location.search);
    } catch {
        return null;
    }
}

/** The site's words when the form couldn't be read. */
export const ENQUIRY_FALLBACK_ERROR =
    "Something went wrong — please check your details and try again.";

/**
 * What a refused enquiry says to the visitor (UX-066), from the API's error
 * envelope `{ error: { message, details: { field, reason } } }`. A bad email
 * and a missing answer are named in words, by the field's label; anything
 * else is the general line. The API's own message is never shown: it is
 * written for developers ("Field \"email\" must be a valid email").
 */
export function enquiryErrorMessage(
    body: unknown,
    fields: RenderedEnquiry["fields"],
): string {
    const envelope = body as {
        error?: { details?: { field?: unknown; reason?: unknown } };
    } | null;
    const details = envelope?.error?.details;
    const field = fields.find((f) => f.name === details?.field);
    const label = (
        field?.label.trim() ? field.label : (field?.name ?? "")
    ).trim();
    if (details?.reason === "invalid_email") {
        return "That email doesn't look right — check for a missing @ or a typo.";
    }
    if (details?.reason === "required") {
        return label
            ? `Please fill in ${label.toLowerCase()}.`
            : "Please fill in every box marked required.";
    }
    return ENQUIRY_FALLBACK_ERROR;
}

/** Map an enquiry field type to the native input type / control. */
function inputTypeFor(type: RenderedEnquiry["fields"][number]["type"]): string {
    switch (type) {
        case "email":
            return "email";
        case "tel":
            return "tel";
        default:
            return "text";
    }
}

/**
 * A signed-in customer's message thread (round-2 A13), handed in by the live
 * site while the account area is on and someone is signed in. With it, the
 * Contact page's form writes to the business in the customer's thread —
 * the reply comes to their Messages — instead of starting an enquiry.
 */
export interface EnquiryThread {
    businessName: string;
    customer: SignedInCustomer;
    send: (text: string) => Promise<SendResult>;
    /** The account's Messages tab, where the reply shows. */
    messagesHref: string;
}

export default function EnquirySection({
    content,
    apiUrl = DEFAULT_API_URL,
    thread = null,
}: {
    content: RenderedEnquiry;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** Signed in on the live site: the form writes to their thread. */
    thread?: EnquiryThread | null;
}) {
    return thread && content.formId ? (
        <ThreadForm content={content} thread={thread} />
    ) : (
        <EnquiryForm content={content} apiUrl={apiUrl} />
    );
}

function EnquiryForm({
    content,
    apiUrl,
}: {
    content: RenderedEnquiry;
    apiUrl: string;
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
    const testRelease = useTestRelease() !== null;

    // "Ask about ordering" on a product page (G13) links here with
    // `?about=<product>`, and "Ask about joining" on a Plans block (G9) with
    // `?join=<plan>`: the message starts with it, and the visitor finishes
    // it. Read after mount, so the server's markup stays the same for
    // everyone.
    const messageField =
        content.fields.find((f) => f.type === "textarea")?.name ?? null;
    useEffect(() => {
        if (!messageField) return;
        const asked = askedFromUrl();
        if (!asked) return;
        // After this render, as an answer from the address bar.
        const timer = setTimeout(() => {
            setValues((prev) =>
                prev[messageField] ? prev : { ...prev, [messageField]: asked },
            );
        }, 0);
        return () => clearTimeout(timer);
    }, [messageField]);

    // No backing Form → nothing to submit against. Render nothing.
    if (!content.formId) return null;

    const formId = content.formId;
    const submitting = state.kind === "submitting";

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (testRelease) {
            setState({ kind: "test-release" });
            return;
        }
        setState({ kind: "submitting" });
        try {
            const res = await fetch(
                `${apiUrl}/public/forms/${encodeURIComponent(formId)}/submit`,
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
            if (isTestReleaseRefusal(res.status, body)) {
                setState({ kind: "test-release" });
                return;
            }
            setState({
                kind: "error",
                message: enquiryErrorMessage(body, content.fields),
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
            <section className="mx-auto w-full max-w-2xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="border-site-border bg-site-surface rounded-[var(--site-radius)] border p-8 text-center">
                    <p className="text-site-fg text-lg font-medium">
                        {content.successMessage ??
                            "Thanks — we'll be in touch soon."}
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section
            id="enquiry"
            className="mx-auto w-full max-w-2xl scroll-mt-20 px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
        >
            {content.title ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-3xl font-bold tracking-tight"
                >
                    {content.title}
                </h2>
            ) : null}
            {content.description ? (
                <p className="text-site-body mt-3">{content.description}</p>
            ) : null}

            <form
                className="mt-8 grid gap-[var(--site-grid-gap)]"
                onSubmit={onSubmit}
                noValidate
            >
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
                        "w-full max-w-full rounded-[var(--site-radius)] border border-site-border bg-site-surface px-3 py-2 text-site-fg outline-none focus:border-site-border focus:ring-2 focus:ring-site-border ";
                    return (
                        <div key={i} className="grid gap-1.5">
                            <label
                                htmlFor={fieldId}
                                className="text-site-fg text-sm font-medium"
                            >
                                {label}
                                {field.required ? (
                                    // The label's own colour, not a red: the
                                    // glyph is the signal, and --site-fg is
                                    // the one colour measured against the
                                    // merchant's ground (#263). aria-hidden
                                    // because the control's `required` already
                                    // tells a screen reader.
                                    <span aria-hidden="true">{" *"}</span>
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
                    <p role="alert" className={destructiveAlertClasses}>
                        {state.message}
                    </p>
                ) : null}
                {state.kind === "test-release" ? (
                    <TestReleaseStop live={ENQUIRY_LIVE} nothing="sent" />
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

/** The thread's cap (`MESSAGE_MAX` in site-accounts/thread-store.ts). */
export const THREAD_MESSAGE_MAX = 2_000;

/** A value with something in it, else null: an empty string says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/**
 * The Contact page's form for a signed-in customer (A13): who they are is
 * known, so it asks only for the message, and sends it to their thread with
 * the business. The reply comes to their Messages, which the thanks links
 * to. A message a link asked for (`?about=`, `?join=`, `?pack=`) starts it,
 * as it starts an enquiry.
 */
function ThreadForm({
    content,
    thread,
}: {
    content: RenderedEnquiry;
    thread: EnquiryThread;
}) {
    const fieldId = useId();
    const [text, setText] = useState("");
    const [state, setState] = useState<SubmitState>({ kind: "idle" });
    const testRelease = useTestRelease() !== null;
    const areaLabel = content.fields.find((f) => f.type === "textarea")?.label;
    const label = said(areaLabel) ?? "Message";

    useEffect(() => {
        const asked = askedFromUrl();
        if (!asked) return;
        const timer = setTimeout(() => {
            setText((prev) => prev || asked);
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const submitting = state.kind === "submitting";
    const named = thread.customer.name;
    const who = said(named) ?? thread.customer.email;

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submitting) return;
        const body = text.trim();
        if (!body) {
            setState({ kind: "error", message: "Write your message" });
            return;
        }
        if (body.length > THREAD_MESSAGE_MAX) {
            setState({
                kind: "error",
                message: "Keep it to 2,000 characters",
            });
            return;
        }
        if (testRelease) {
            setState({ kind: "test-release" });
            return;
        }
        setState({ kind: "submitting" });
        const result = await thread.send(body).catch((): SendResult => ({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        }));
        if (result.ok) {
            setText("");
            setState({ kind: "success" });
        } else if ("reason" in result) {
            // The only refusal with a reason: a test release (DEC-071).
            setState({ kind: "test-release" });
        } else {
            setState({ kind: "error", message: result.message });
        }
    }

    if (state.kind === "success") {
        return (
            <section
                id="enquiry"
                className="mx-auto w-full max-w-2xl scroll-mt-20 px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
            >
                <div
                    role="status"
                    className="border-site-border bg-site-surface grid justify-items-center gap-4 rounded-[var(--site-radius)] border p-8 text-center"
                >
                    <p className="text-site-fg text-lg font-medium">
                        Sent. {thread.businessName} will reply in your Messages.
                    </p>
                    <a
                        href={thread.messagesHref}
                        className={cn(ctaClasses("secondary"), "w-fit")}
                    >
                        Open Messages
                    </a>
                </div>
            </section>
        );
    }

    return (
        <section
            id="enquiry"
            className="mx-auto w-full max-w-2xl scroll-mt-20 px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
        >
            {content.title ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-3xl font-bold tracking-tight"
                >
                    {content.title}
                </h2>
            ) : null}
            {content.description ? (
                <p className="text-site-body mt-3">{content.description}</p>
            ) : null}

            <form
                className="mt-8 grid gap-[var(--site-grid-gap)]"
                onSubmit={(e) => void onSubmit(e)}
                noValidate
            >
                <p className="text-site-body text-sm">
                    Signed in as {who}. The reply comes to your Messages.
                </p>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={fieldId}
                        className="text-site-fg text-sm font-medium"
                    >
                        {label}
                    </label>
                    <textarea
                        id={fieldId}
                        name="message"
                        required
                        rows={4}
                        maxLength={THREAD_MESSAGE_MAX}
                        value={text}
                        disabled={submitting}
                        onChange={(e) => {
                            setText(e.target.value);
                            if (state.kind === "error") {
                                setState({ kind: "idle" });
                            }
                        }}
                        className="border-site-border bg-site-surface text-site-fg focus:border-site-border focus:ring-site-border w-full max-w-full rounded-[var(--site-radius)] border px-3 py-2 outline-none focus:ring-2"
                    />
                </div>

                {state.kind === "error" ? (
                    <p role="alert" className={destructiveAlertClasses}>
                        {state.message}
                    </p>
                ) : null}
                {state.kind === "test-release" ? (
                    <TestReleaseStop live={THREAD_LIVE} nothing="sent" />
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
