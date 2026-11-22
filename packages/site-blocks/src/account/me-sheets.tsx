"use client";

import { phoneHomeCountry, phoneNumberProblem } from "@saroh/block-contract";
import { useId, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { SitePhoneInput } from "../phone-input";
import { useSiteBusiness } from "../site-business";
import type { DetailsResult, MeApi, NoteResult } from "./me-api";
import type { AccountNote, AccountView } from "./model";
import { Sheet, sheetButton, sheetInput } from "./sheet";

/**
 * Me's two sheets (round-2 plan A, A5): the customer's name and phone, and
 * a note for the team. Each says why a save was refused, in the words the
 * site's server passed on.
 */

export function DetailsSheet({
    open,
    account,
    onClose,
    save,
    onSaved,
}: {
    open: boolean;
    account: AccountView;
    onClose: () => void;
    save: MeApi["updateDetails"];
    onSaved: (account: AccountView) => void;
}) {
    const [name, setName] = useState(account.name ?? "");
    const [phone, setPhone] = useState(account.phone ?? "");
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const ids = useId();
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const off = busy || name.trim() === "";
    const { phoneNumbers, country } = useSiteBusiness();
    const indian = phoneNumbers === "indian";

    async function submit() {
        if (off) return;
        // A number saved before numbers were checked is kept as it is.
        const wrong =
            phone !== (account.phone ?? "")
                ? phoneNumberProblem(
                      phone,
                      phoneHomeCountry(phoneNumbers, country),
                  )
                : null;
        setPhoneError(wrong);
        if (wrong) return;
        setBusy(true);
        setProblem(null);
        const result = await save({
            name: name.trim(),
            phone: phone.trim(),
        }).catch((): DetailsResult => ({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        }));
        setBusy(false);
        if (result.ok) onSaved(result.account);
        else setProblem(result.message);
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="My details"
            lead="Your phone is for the team to reach you. You sign in with your email."
        >
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <label className="mt-3.5 block text-[13.5px] font-medium">
                    Name
                    <input
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={sheetInput}
                    />
                </label>
                <label
                    htmlFor={`${ids}-phone`}
                    className="mt-3 block text-[13.5px] font-medium"
                >
                    Phone
                </label>
                <SitePhoneInput
                    id={`${ids}-phone`}
                    className="mt-1.5"
                    box={sheetInput}
                    value={phone}
                    onValueChange={(v) => {
                        setPhone(v);
                        setPhoneError(null);
                    }}
                    placeholder={indian ? "98765 43210" : undefined}
                    invalid={Boolean(phoneError)}
                    describedBy={phoneError ? `${ids}-phone-error` : undefined}
                />
                {phoneError ? (
                    <p
                        id={`${ids}-phone-error`}
                        className="text-site-fg mt-1.5 text-[12.5px] font-medium"
                    >
                        {phoneError}
                    </p>
                ) : null}
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
                <button
                    type="submit"
                    disabled={off}
                    className={sheetButton(off)}
                >
                    {busy ? "Saving…" : "Save"}
                </button>
            </form>
        </Sheet>
    );
}

/**
 * Their GSTIN (R16): printed on invoices made from now on; issued ones keep
 * what they had. The business's server checks it and says why it can't.
 */
export function GstinSheet({
    open,
    account,
    onClose,
    save,
    onSaved,
}: {
    open: boolean;
    account: AccountView;
    onClose: () => void;
    save: NonNullable<MeApi["saveGstin"]>;
    onSaved: (account: AccountView) => void;
}) {
    const [gstin, setGstin] = useState(account.gstin ?? "");
    const [busy, setBusy] = useState<"save" | "remove" | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const ids = useId();
    const off = busy !== null || gstin.trim() === "";

    async function send(value: string, kind: "save" | "remove") {
        setBusy(kind);
        setProblem(null);
        const result = await save(value).catch((): DetailsResult => ({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        }));
        setBusy(null);
        if (result.ok) onSaved(result.account);
        else setProblem(result.message);
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Business details for GST"
            lead="Your GSTIN prints on invoices from now on. Invoices already issued stay as they are."
        >
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!off) void send(gstin.trim(), "save");
                }}
            >
                <label
                    htmlFor={`${ids}-gstin`}
                    className="mt-3.5 block text-[13.5px] font-medium"
                >
                    GSTIN
                </label>
                <input
                    id={`${ids}-gstin`}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={15}
                    placeholder="29AAAAA0000A1ZY"
                    value={gstin}
                    onChange={(e) => {
                        setGstin(e.target.value.toUpperCase());
                        setProblem(null);
                    }}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${ids}-problem` : undefined}
                    className={cn(sheetInput, "uppercase tabular-nums")}
                />
                {problem ? (
                    <p
                        id={`${ids}-problem`}
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
                <button
                    type="submit"
                    disabled={off}
                    className={sheetButton(off)}
                >
                    {busy === "save" ? "Saving…" : "Save"}
                </button>
                {account.gstin ? (
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void send("", "remove")}
                        className={cn(
                            "text-site-fg mt-2 h-11 w-full cursor-pointer text-[14px] font-semibold underline underline-offset-4 disabled:opacity-60",
                            focusRing,
                        )}
                    >
                        {busy === "remove" ? "Removing…" : "Remove GSTIN"}
                    </button>
                ) : null}
            </form>
        </Sheet>
    );
}

export function NoteSheet({
    open,
    title,
    placeholder,
    onClose,
    send,
    onSent,
}: {
    open: boolean;
    title: string;
    placeholder: string;
    onClose: () => void;
    send: MeApi["addNote"];
    onSent: (note: AccountNote) => void;
}) {
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const off = busy || text.trim() === "";

    async function submit() {
        if (off) return;
        setBusy(true);
        setProblem(null);
        const result = await send(text.trim()).catch((): NoteResult => ({
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        }));
        setBusy(false);
        if (result.ok) {
            setText("");
            onSent(result.note);
        } else {
            setProblem(result.message);
        }
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={title}
            lead="Only the team sees this. They'll confirm it before your next visit."
        >
            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                }}
            >
                <label className="mt-3.5 block text-[13.5px] font-medium">
                    Note
                    <textarea
                        rows={4}
                        maxLength={500}
                        placeholder={placeholder}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className={cn(sheetInput, "h-auto py-2.5 text-base")}
                    />
                </label>
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
                <button
                    type="submit"
                    disabled={off}
                    className={sheetButton(off)}
                >
                    {busy ? "Sending…" : "Send to the team"}
                </button>
            </form>
        </Sheet>
    );
}
