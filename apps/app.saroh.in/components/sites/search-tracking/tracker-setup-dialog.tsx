"use client";

import { FormDialog } from "@/components/shared/form-dialog";
import type { PosthogRegion, TrackerKind } from "@saroh/block-contract";
import { POSTHOG_REGIONS } from "@saroh/block-contract";
import { Label } from "@saroh/ui/label";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { Textarea } from "@saroh/ui/textarea";
import { useId, useState, useTransition } from "react";

import type { TrackerSave, TrackerView } from "@/lib/sites/search-tracking";
import {
    POSTHOG_REGION_WORDS,
    readTrackerPaste,
    TRACKER_WORDS,
    trackerHelpHref,
} from "@/lib/sites/search-tracking";

import { TextLink } from "@saroh/ui/text-link";
import type { SaveOutcome } from "./parts";

/**
 * Connect a tracker, or change its id (DEC-108, U7). It takes the id or the
 * whole snippet the tool gave; the id is found here and shown before
 * saving, and only that id (with PostHog's region) is sent. A paste that
 * looks secret is refused on the spot, and nothing is sent.
 *
 * Mounted per open (`key`), so each opening starts from the saved id.
 */
export function TrackerSetupDialog({
    kind,
    existing,
    onClose,
    onSave,
}: {
    kind: TrackerKind;
    existing: TrackerView | null;
    onClose: () => void;
    onSave: (kind: TrackerKind, tracker: TrackerSave) => Promise<SaveOutcome>;
}) {
    const id = useId();
    const words = TRACKER_WORDS[kind];
    const [draft, setDraft] = useState(existing?.trackerId ?? "");
    const [chosenRegion, setChosenRegion] = useState<PosthogRegion | null>(
        existing?.region ?? null,
    );
    const [serverError, setServerError] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    const [pending, startTransition] = useTransition();

    const read = readTrackerPaste(kind, draft);
    const region =
        kind === "posthog"
            ? (chosenRegion ??
              (read.state === "ok" ? read.region : null) ??
              null)
            : null;
    const said = read.state === "bad" ? read.message : serverError;
    const value = read.state === "ok" ? read.value : null;
    const ready = value !== null && (kind !== "posthog" || region !== null);
    const unchanged =
        existing !== null &&
        value === existing.trackerId &&
        (kind !== "posthog" || region === existing.region);
    // Said once the button is pressed on something that can't be saved.
    const problem =
        said ??
        (tried && !ready
            ? value === null
                ? "Paste the ID or the snippet first."
                : "Choose where your project is hosted."
            : null);

    function submit() {
        setTried(true);
        if (!value || !ready || pending) return;
        startTransition(async () => {
            const res = await onSave(kind, {
                id: value,
                ...(kind === "posthog" && region ? { region } : {}),
            });
            if (res.ok) {
                onClose();
                return;
            }
            if (res.field?.startsWith(`trackers.${kind}`)) {
                setServerError(res.error);
            }
        });
    }

    return (
        <FormDialog
            open
            size="lg"
            title={existing ? `Change ${words.name}` : `Connect ${words.name}`}
            description={
                <>
                    {words.where}{" "}
                    <TextLink href={trackerHelpHref(kind)} external>
                        Help
                        <span className="sr-only">
                            {" "}
                            with finding your {words.name} ID (opens in a new
                            tab)
                        </span>
                    </TextLink>
                </>
            }
            pending={pending}
            dirty={existing ? !unchanged : draft !== ""}
            saveLabel={existing ? "Save" : "Add to your site"}
            savingLabel={existing ? "Saving…" : "Adding…"}
            onClose={onClose}
            onSubmit={submit}
        >
            <div className="space-y-2">
                <Label htmlFor={`${id}-paste`}>ID or snippet</Label>
                <Textarea
                    id={`${id}-paste`}
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        setServerError(null);
                    }}
                    rows={4}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={words.placeholder}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${id}-said`}
                    className="font-mono"
                />
                <div id={`${id}-said`} aria-live="polite">
                    {problem ? (
                        <p
                            role="alert"
                            className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            {problem}
                        </p>
                    ) : value ? (
                        <p className="text-sm">
                            ID to save:{" "}
                            <span
                                className="font-mono [overflow-wrap:anywhere]"
                                data-extracted
                            >
                                {value}
                            </span>
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Only the ID is kept. The rest of a pasted snippet
                            stays on your device.
                        </p>
                    )}
                </div>
            </div>
            {kind === "posthog" ? (
                <fieldset className="space-y-2">
                    <legend id={`${id}-region`} className="text-sm font-medium">
                        Where your project is hosted
                    </legend>
                    <RadioGroup
                        aria-labelledby={`${id}-region`}
                        value={region ?? ""}
                        onValueChange={(v) =>
                            setChosenRegion(v as PosthogRegion)
                        }
                        className="grid gap-2 sm:grid-cols-2"
                    >
                        {POSTHOG_REGIONS.map((r) => (
                            <label
                                key={r}
                                htmlFor={`${id}-${r}`}
                                className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-border px-3 py-2 text-sm transition-colors duration-fast hover:bg-muted active:bg-accent-active coarse:min-h-11"
                            >
                                <RadioGroupItem id={`${id}-${r}`} value={r} />
                                {POSTHOG_REGION_WORDS[r]}
                            </label>
                        ))}
                    </RadioGroup>
                </fieldset>
            ) : null}
        </FormDialog>
    );
}
