"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
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
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const off = busy || name.trim() === "";

    async function submit() {
        if (off) return;
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
                <label className="mt-3 block text-[13.5px] font-medium">
                    Phone
                    <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={sheetInput}
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
                    {busy ? "Saving…" : "Save"}
                </button>
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
