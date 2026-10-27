"use client";

import { CUSTOMERS } from "@/content/customers";
import { REPORT_LIMITS } from "@/lib/business-report";
import { PhoneInput } from "@saroh/ui/phone-input";

import { Button } from "../shared/buttons/button";
import { fieldClasses } from "../shared/fields/field-classes";
import { useReportForm } from "./use-report-form";

const copy = CUSTOMERS.form;

/**
 * Report a business (/customers, Terms rev 46): the site's address, what
 * happened, and the reporter's own email and mobile number, all four asked
 * for (DEC-138). Posts to `/api/business-reports`. A Free merchant site's
 * "Report" link fills the address in from `?site=`, read in the browser so
 * the page stays static. The answer is the same whether or not the address
 * is a Saroh site.
 *
 * Send checks the fields in the form's order: the first at fault has the
 * red border, the one line says what it needs, and the keyboard goes to it.
 * A send that fails keeps everything typed. What is typed is masked in a
 * session recording by the recorder's own rule for every input (DEC-125),
 * and the thanks says none of it back.
 */
export function ReportForm() {
    // The link's address until they type their own: read in the browser
    // (the server draws the field empty), so the page stays static.
    const form = useReportForm();
    const { site, setSite, message, setMessage, email, setEmail } = form;
    const { phone, setPhone, state, clear, onSubmit } = form;
    const { fieldRef, wrong, describedBy } = form;

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
            noValidate
            onSubmit={onSubmit}
            aria-labelledby="report-title"
            className="grid max-w-[600px] gap-4"
        >
            <h2
                id="report-title"
                className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em]"
            >
                {copy.title}
            </h2>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-site"
                    className="text-[14px] font-medium"
                >
                    {copy.siteLabel}
                </label>
                <input
                    ref={fieldRef("site")}
                    id="report-site"
                    name="site"
                    type="text"
                    inputMode="url"
                    aria-required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={REPORT_LIMITS.site}
                    placeholder={copy.sitePlaceholder}
                    value={site}
                    onChange={(e) => {
                        setSite(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("site") || undefined}
                    aria-describedby={describedBy("site")}
                    className={fieldClasses({
                        invalid: wrong("site"),
                        className: "h-[46px] w-full",
                    })}
                />
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-message"
                    className="text-[14px] font-medium"
                >
                    {copy.messageLabel}
                </label>
                <textarea
                    ref={fieldRef("message")}
                    id="report-message"
                    name="message"
                    rows={5}
                    aria-required
                    maxLength={REPORT_LIMITS.message}
                    value={message}
                    onChange={(e) => {
                        setMessage(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("message") || undefined}
                    aria-describedby={describedBy(
                        "message",
                        "report-message-hint",
                    )}
                    className={fieldClasses({
                        invalid: wrong("message"),
                        className: "w-full py-2.5 leading-[1.5]",
                    })}
                />
                <p
                    id="report-message-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.messageHint}
                </p>
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-email"
                    className="text-[14px] font-medium"
                >
                    {copy.emailLabel}
                </label>
                <input
                    ref={fieldRef("email")}
                    id="report-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-required
                    maxLength={REPORT_LIMITS.email}
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        clear();
                    }}
                    aria-invalid={wrong("email") || undefined}
                    aria-describedby={describedBy("email", "report-email-hint")}
                    className={fieldClasses({
                        invalid: wrong("email"),
                        className: "h-[46px] w-full",
                    })}
                />
                <p
                    id="report-email-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.emailHint}
                </p>
            </div>
            <div className="grid gap-1.5">
                <label
                    htmlFor="report-phone"
                    className="text-[14px] font-medium"
                >
                    {copy.phoneLabel}
                </label>
                <PhoneInput
                    ref={fieldRef("phone")}
                    id="report-phone"
                    name="phone"
                    autoComplete="tel-national"
                    aria-required
                    maxLength={REPORT_LIMITS.phone}
                    value={phone}
                    onValueChange={(v) => {
                        setPhone(v);
                        clear();
                    }}
                    aria-invalid={wrong("phone") || undefined}
                    aria-describedby={describedBy("phone", "report-phone-hint")}
                    boxClassName={fieldClasses({
                        invalid: wrong("phone"),
                        // The page's own focus outline, not the app's ring.
                        className:
                            "h-[46px] focus-visible:ring-0 focus-visible:ring-offset-0",
                    })}
                />
                <p
                    id="report-phone-hint"
                    className="m-0 text-mk-note leading-[1.5] text-muted-foreground"
                >
                    {copy.phoneHint}
                </p>
            </div>
            {state.at === "error" ? (
                <p
                    id="report-error"
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
