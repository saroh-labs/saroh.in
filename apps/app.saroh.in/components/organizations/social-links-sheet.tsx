"use client";

import { Refusal } from "@/components/shared/refusal";
import type { SocialLinks, SocialNetwork } from "@saroh/block-contract";
import {
    SOCIAL_INPUT_MAX,
    SOCIAL_LABELS,
    SOCIAL_NETWORKS,
    SOCIAL_PLACEHOLDERS,
} from "@saroh/block-contract";
import { SocialIcon } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { phoneLabel } from "@/lib/organizations/business-phone";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type { SocialDraft } from "@/lib/organizations/social-links";
import {
    readSocialField,
    socialDraftOf,
    socialNetworkOfField,
    socialPatch,
    socialProblems,
    socialSavedWords,
} from "@/lib/organizations/social-links";

/** What each field takes, said once under the sheet's title. */
const HOW =
    "Type your name on each one, or paste the link to your page. Leave one empty to show none.";

/**
 * The business's social links, edited in one sheet (DEC-125): a field per
 * network, each with its mark, what it accepts as its placeholder, and
 * under it where the link will open as it is typed ("Opens
 * instagram.com/rye") or what is wrong with it. WhatsApp takes a phone
 * number, and offers the business phone when one is set.
 *
 * Save sends only the networks that changed. A refusal keeps the sheet
 * open with what was typed, under its field when the API names one and at
 * the foot of the fields otherwise. Nothing but a network's own address is
 * ever kept, so there is no free link to type.
 *
 * It reads only the saved links and the business phone, so Website
 * settings opens the same sheet in place.
 */
export function SocialLinksSheet({
    links,
    phone,
    kind,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    /** What is saved: the draft starts from it. */
    links: SocialLinks | null | undefined;
    /** The business phone, E.164, for "Use the business phone". */
    phone: string | null | undefined;
    /** What is being set up (DEC-070), for the sheet's words. */
    kind?: unknown;
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo: string;
    onClose: () => void;
    /** Saved: the settings now, and what to say. */
    onSaved: (next: OrganizationSettings, said: string) => void;
}) {
    const [draft, setDraft] = useState<SocialDraft>(() => socialDraftOf(links));
    // A field says what is wrong once it has been left, or Save was tried.
    const [touched, setTouched] = useState<Set<SocialNetwork>>(new Set());
    // What the API refused, until its field is typed in again.
    const [refused, setRefused] = useState<
        Partial<Record<SocialNetwork, string>>
    >({});
    const [refusal, setRefusal] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const words = sheetWords("social", { kind, registered: false });
    const formId = `${BUSINESS_ROW_ID.social}-panel`;

    const set = (network: SocialNetwork, value: string) => {
        setDraft((d) => ({ ...d, [network]: value }));
        setRefused((r) => ({ ...r, [network]: undefined }));
        setRefusal(null);
    };
    const touch = (network: SocialNetwork) =>
        setTouched((t) => new Set(t).add(network));

    async function save() {
        const problems = socialProblems(draft);
        const wrong = SOCIAL_NETWORKS.filter((n) => problems[n]);
        if (wrong.length > 0) {
            // Said on each field, and the first one takes the keyboard.
            setTouched(new Set(SOCIAL_NETWORKS));
            document.getElementById(`${formId}-${wrong[0]}`)?.focus();
            return;
        }
        const patch = socialPatch(draft, links);
        if (Object.keys(patch).length === 0) {
            onClose();
            return;
        }
        setRefusal(null);
        const result = await runAction(
            () => saveOrganizationSettings({ socialLinks: patch }),
            { setBusy: setSaving },
        );
        if (!result) return;
        if (!result.ok) {
            const network = socialNetworkOfField(result.field);
            if (network) {
                setRefused((r) => ({ ...r, [network]: result.error }));
                touch(network);
                document.getElementById(`${formId}-${network}`)?.focus();
            } else {
                setRefusal(result.error);
            }
            return;
        }
        onSaved(result.data, socialSavedWords(result.data.socialLinks ?? {}));
        onClose();
    }

    const phoneShown = phone ? phoneLabel(phone) : "";

    return (
        <FormSheet
            id={formId}
            returnFocusTo={returnTo}
            title={words.title}
            description={words.description}
            open={open}
            pending={saving}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <p className="text-pretty text-[12.5px] leading-normal text-muted-foreground">
                {HOW}
            </p>
            <div className="mt-2 grid gap-4">
                {SOCIAL_NETWORKS.map((network) => {
                    const id = `${formId}-${network}`;
                    const read = readSocialField(network, draft[network]);
                    const problem =
                        refused[network] ??
                        (touched.has(network) && read.kind === "problem"
                            ? read.problem
                            : null);
                    const offerPhone =
                        network === "whatsapp" &&
                        phoneShown !== "" &&
                        draft.whatsapp.trim() !== phoneShown;
                    return (
                        <div key={network} className="grid gap-1.5">
                            <Label
                                htmlFor={id}
                                className="flex items-center gap-2 text-[12.5px] font-medium"
                            >
                                <SocialIcon
                                    network={network}
                                    className="size-4 flex-none text-muted-foreground"
                                />
                                {SOCIAL_LABELS[network]}
                            </Label>
                            <Input
                                id={id}
                                name={network}
                                value={draft[network]}
                                onChange={(e) => set(network, e.target.value)}
                                onBlur={() => touch(network)}
                                placeholder={SOCIAL_PLACEHOLDERS[network]}
                                maxLength={SOCIAL_INPUT_MAX}
                                type={network === "whatsapp" ? "tel" : "text"}
                                inputMode={
                                    network === "whatsapp" ? "tel" : "url"
                                }
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                disabled={saving}
                                aria-invalid={problem ? true : undefined}
                                aria-describedby={`${id}-note`}
                            />
                            <div id={`${id}-note`} className="min-h-[18px]">
                                {problem ? (
                                    <p
                                        role="alert"
                                        className="text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground"
                                    >
                                        {problem}
                                    </p>
                                ) : read.kind === "opens" ? (
                                    <p
                                        data-opens={network}
                                        className="text-[12.5px] leading-[1.5] text-muted-foreground [overflow-wrap:anywhere]"
                                    >
                                        Opens{" "}
                                        <span className="font-mono text-foreground">
                                            {read.shown}
                                        </span>
                                    </p>
                                ) : null}
                            </div>
                            {offerPhone ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="justify-self-start"
                                    disabled={saving}
                                    onClick={() => set("whatsapp", phoneShown)}
                                >
                                    Use the business phone
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            <Refusal>{refusal}</Refusal>
        </FormSheet>
    );
}
