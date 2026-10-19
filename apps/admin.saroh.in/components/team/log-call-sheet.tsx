"use client";

import { Button } from "@saroh/ui/button";
import { DateInput } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Segmented } from "@saroh/ui/segmented";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { todayIso } from "@/lib/format";
import { logLeadContactAction } from "@/lib/saroh-lead-actions";
import type { ContactKind, LeadContact } from "@/lib/saroh-lead-words";
import { CONTACT_KINDS, CONTACT_LABEL } from "@/lib/saroh-lead-words";
import { logBusinessContactAction } from "@/lib/team-member-actions";

/** Who the call was with: one of Saroh's leads, or a business (U22). */
type Target =
    | {
          leadId: string;
          /** The lead's follow-up now, so the field starts from it. */
          followUpOn: string | null;
          business?: undefined;
      }
    | {
          /** A business the teammate looks after; it keeps no follow-up. */
          business: { organizationId: string; platformAdminId: string };
          leadId?: undefined;
          followUpOn?: undefined;
      };

/**
 * Log a call, visit or message on one of Saroh's own leads (DEC-169, U20):
 * what was said, what they said about Saroh itself, how long, and the next
 * follow-up. Or, from a teammate's own page (U22), with one of the
 * businesses they look after, which keeps no follow-up. Mounted only while
 * open, so each opening is one attempt with its own idempotency key.
 */
export function LogCallSheet({
    leadId,
    leadName,
    followUpOn,
    business,
    onOpenChange,
    onLogged,
}: Target & {
    /** Who it was with, by name: the lead's or the business's. */
    leadName: string;
    onOpenChange: (open: boolean) => void;
    onLogged: (entry: LeadContact) => void;
}) {
    const [key] = useState(() => crypto.randomUUID());
    const [kind, setKind] = useState<ContactKind>("CALL");
    const [summary, setSummary] = useState("");
    const [feedback, setFeedback] = useState("");
    const [minutes, setMinutes] = useState("");
    const [next, setNext] = useState(followUpOn ?? "");
    const [errors, setErrors] = useState<{
        summary?: string;
        minutes?: string;
        form?: string;
    }>({});
    const [pending, startTransition] = useTransition();

    function submit(event: React.FormEvent) {
        event.preventDefault();
        const found: typeof errors = {};
        if (!summary.trim()) found.summary = "Say what was said.";
        const mins = minutes.trim() === "" ? null : Number(minutes);
        if (
            mins !== null &&
            (!Number.isInteger(mins) || mins < 1 || mins > 600)
        ) {
            found.minutes = "Minutes, from 1 to 600.";
        }
        setErrors(found);
        if (found.summary || found.minutes) return;
        startTransition(async () => {
            const said = {
                kind,
                summary: summary.trim(),
                feedback: feedback.trim() || null,
                minutes: mins,
                idempotencyKey: key,
            };
            const result = business
                ? await logBusinessContactAction({ ...business, ...said })
                : await logLeadContactAction({
                      id: leadId,
                      ...said,
                      // Only sent when changed: an untouched field keeps the lead's.
                      ...(next !== (followUpOn ?? "")
                          ? { followUpOn: next || null }
                          : {}),
                  });
            if (!result.ok) {
                setErrors({ form: result.error });
                return;
            }
            onLogged(result.data);
            onOpenChange(false);
        });
    }

    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
                <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
                    <SheetHeader>
                        <SheetTitle>Log a call</SheetTitle>
                        <SheetDescription>
                            {business
                                ? `With ${leadName}. Kept on your page and on the business's history, with your name.`
                                : `With ${leadName}. Kept on the lead, with your name.`}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="grid gap-1.5">
                        <Label id={`${key}-kind`}>What it was</Label>
                        <Segmented
                            label="What it was"
                            aria-labelledby={`${key}-kind`}
                            options={CONTACT_KINDS.map((value) => ({
                                value,
                                label: CONTACT_LABEL[value],
                            }))}
                            value={kind}
                            onValueChange={setKind}
                        />
                    </div>
                    <Field label="What was said" error={errors.summary}>
                        <Textarea
                            name="summary"
                            rows={4}
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                        />
                    </Field>
                    <Field
                        label="What they said about Saroh"
                        hint="A feature they asked for, or what put them off."
                        optional
                    >
                        <Textarea
                            name="feedback"
                            rows={3}
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                        />
                    </Field>
                    <div
                        className={
                            business
                                ? "grid gap-4"
                                : "grid gap-4 sm:grid-cols-2"
                        }
                    >
                        <Field label="Minutes" optional error={errors.minutes}>
                            <Input
                                name="minutes"
                                inputMode="numeric"
                                value={minutes}
                                onChange={(e) => setMinutes(e.target.value)}
                            />
                        </Field>
                        {business ? null : (
                            <Field label="Next follow-up" optional>
                                <DateInput
                                    name="followUpOn"
                                    min={todayIso()}
                                    className="w-full"
                                    value={next}
                                    onValueChange={setNext}
                                    clearable
                                    placeholder="No follow-up"
                                />
                            </Field>
                        )}
                    </div>
                    {errors.form ? (
                        <p role="alert" className="text-sm text-destructive">
                            {errors.form}
                        </p>
                    ) : null}
                    <SheetFooter className="mt-auto gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            busy={pending}
                            busyLabel="Saving…"
                        >
                            Log it
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
