"use client";

import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { FormSheet } from "@saroh/ui/form-sheet";
import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { authFailureCopy } from "@/lib/auth-error-copy";
import { removePhone } from "@/lib/phone-sign-in";

import type { Saved } from "./phone-section";
import { PHONE_WORDS, PhoneChange } from "./phone-section";

/**
 * Account › Phone (DEC-196, DEC-199): add or change the phone that signs
 * this account in, in a sheet. Adding and changing both need a fresh code
 * to the new number, which the API checks before saving. Remove sits in
 * the sheet's foot and asks first; it needs no code, since the email still
 * signs the person in.
 */
export function PhoneSheet({
    open,
    hasPhone,
    canAdd,
    whatsapp,
    sms,
    turnstileSiteKey,
    onClose,
    onSaved,
    onRemoved,
}: {
    open: boolean;
    hasPhone: boolean;
    /** False while phones can't be verified here: only Remove stays. */
    canAdd: boolean;
    whatsapp: boolean;
    sms: boolean;
    turnstileSiteKey: string | null;
    onClose: () => void;
    onSaved: (saved: Saved) => void;
    onRemoved: () => void;
}) {
    const [asking, setAsking] = useState(false);
    // Each opening starts at the number.
    const [opening, setOpening] = useState(0);

    return (
        <>
            <FormSheet
                open={open}
                title={hasPhone ? "Change your phone" : "Add a phone"}
                description={PHONE_WORDS.blurb}
                onClose={() => {
                    setOpening((n) => n + 1);
                    onClose();
                }}
                doneOnly
                doneLabel="Cancel"
                extra={
                    hasPhone ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setAsking(true)}
                        >
                            {PHONE_WORDS.remove}
                        </Button>
                    ) : undefined
                }
            >
                {canAdd ? (
                    <PhoneChange
                        key={opening}
                        bare
                        whatsapp={whatsapp}
                        sms={sms}
                        turnstileSiteKey={turnstileSiteKey}
                        onSaved={(saved) => {
                            showSuccess(PHONE_WORDS.added);
                            setOpening((n) => n + 1);
                            onSaved(saved);
                        }}
                    />
                ) : (
                    <p className="text-muted-foreground text-sm">
                        Codes can&apos;t be sent just now, so a new number
                        can&apos;t be checked. Try again later.
                    </p>
                )}
            </FormSheet>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                title={PHONE_WORDS.removeTitle}
                description={PHONE_WORDS.removeAsk}
                confirmLabel={PHONE_WORDS.remove}
                keepLabel={PHONE_WORDS.keep}
                onConfirm={async () => {
                    const answer = await removePhone();
                    if (answer.error) {
                        return {
                            ok: false,
                            error: authFailureCopy(
                                answer.error,
                                PHONE_WORDS.removeFailed,
                            ),
                        };
                    }
                    showSuccess(PHONE_WORDS.removed);
                    onRemoved();
                    return true;
                }}
            />
        </>
    );
}
