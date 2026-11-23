"use client";

import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    avatarInitials,
} from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRef, useState } from "react";

import { useImageUpload } from "@/components/shared/fields/media-picker";
import { uploadWords } from "@/components/shared/fields/picked-image";
import { runAction } from "@/lib/api/run-action";
import { saveStaffProfile } from "@/lib/staff/actions";

/** The photo's limits, said before anything uploads (ERVStaffPhoto). */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** The most "About them" holds (the API holds the same). */
export const ABOUT_MAX = 600;

/** What is wrong with a chosen file, in words, or null. */
export function photoProblem(file: { type: string; size: number }) {
    if (!PHOTO_TYPES.includes(file.type)) {
        return "That is not a photo. Choose a JPG, PNG or WebP.";
    }
    if (file.size > PHOTO_MAX_BYTES) {
        return "That photo is too large to use. Choose one under 10 MB.";
    }
    return null;
}

/**
 * A team member's photo and "About them" (ERVStaffPhoto, 23 Nov 2026):
 * the person's own, in Your profile, or an owner or admin's for them in
 * Settings › Team. Each saves on its own, at once: a photo the moment it
 * is uploaded (made smaller in the browser first, stored with the
 * `staff-photo` purpose), the words with their Save. Initials stand in
 * while there is no photo. The API holds who may.
 */
export function StaffProfileFields({
    staffId,
    name,
    photo,
    about,
    byOther = false,
    onSaved,
}: {
    staffId: string;
    name: string;
    photo: string | null;
    about: string | null;
    /** An owner or admin is setting it for someone else: no one is told when it is their own. */
    byOther?: boolean;
    onSaved?: () => void;
}) {
    return (
        <div className="grid gap-4" data-staff-profile="">
            <PhotoRow
                staffId={staffId}
                name={name}
                photo={photo}
                byOther={byOther}
                onSaved={onSaved}
            />
            <AboutRow staffId={staffId} about={about} onSaved={onSaved} />
        </div>
    );
}

function PhotoRow({
    staffId,
    name,
    photo,
    byOther,
    onSaved,
}: {
    staffId: string;
    name: string;
    photo: string | null;
    byOther: boolean;
    onSaved?: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [url, setUrl] = useState(photo);
    const [problem, setProblem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const up = useImageUpload({ purpose: "staff-photo" });
    const working = up.busy || saving;

    async function save(photoMediaId: string | null, src: string | null) {
        const res = await runAction(
            () => saveStaffProfile(staffId, { photoMediaId }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) return setProblem(res.error);
        setUrl(src);
        showSuccess(photoMediaId ? "Photo saved." : "Photo removed.");
        onSaved?.();
    }

    async function onFile(file: File) {
        const wrong = photoProblem(file);
        setProblem(wrong);
        if (wrong) return;
        const picked = await up.upload(file);
        if (picked?.mediaId) await save(picked.mediaId, picked.src);
    }

    const said = problem ?? up.error;
    return (
        <div className="grid gap-1.5">
            <span className="text-[0.8125rem] font-semibold">
                Photo{" "}
                <span
                    data-ph-unmask=""
                    className="font-normal text-muted-foreground"
                >
                    (optional)
                </span>
            </span>
            <div className="flex flex-wrap items-center gap-3.5">
                <Avatar aria-hidden className="size-14 text-[15px]">
                    {url ? <AvatarImage src={url} alt="" /> : null}
                    <AvatarFallback>{avatarInitials(name)}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-[1_1_200px] gap-1.5">
                    <input
                        ref={input}
                        type="file"
                        accept={PHOTO_TYPES.join(",")}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            // The same file again must still fire.
                            e.target.value = "";
                            if (file) void onFile(file);
                        }}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            busy={working}
                            disabled={working}
                            onClick={() => input.current?.click()}
                        >
                            {up.busy
                                ? uploadWords(up)
                                : saving
                                  ? "Saving…"
                                  : url
                                    ? "Change"
                                    : "Add a photo"}
                        </Button>
                        {url && !working ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void save(null, null)}
                            >
                                Remove
                            </Button>
                        ) : null}
                    </div>
                    {said ? (
                        <p role="alert" className="text-xs text-destructive">
                            {said}
                        </p>
                    ) : up.busy ? (
                        <p
                            data-ph-unmask=""
                            className="text-xs text-muted-foreground"
                        >
                            You can leave this page. It keeps going.
                        </p>
                    ) : (
                        <p
                            data-ph-unmask=""
                            className="text-xs text-muted-foreground"
                        >
                            {url
                                ? "Shows on the website's Our team and the calendar."
                                : "JPG, PNG or WebP. We make it smaller before it uploads."}
                            {byOther && url
                                ? " They can change or remove it in their own profile too, and are told when you change it."
                                : ""}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function AboutRow({
    staffId,
    about,
    onSaved,
}: {
    staffId: string;
    about: string | null;
    onSaved?: () => void;
}) {
    const [saved, setSaved] = useState(about ?? "");
    const [text, setText] = useState(about ?? "");
    const [saving, setSaving] = useState(false);
    const dirty = text.trim() !== saved.trim();

    async function save() {
        const res = await runAction(
            () => saveStaffProfile(staffId, { about: text.trim() || null }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        setSaved(text.trim());
        setText(text.trim());
        showSuccess("Saved.");
        onSaved?.();
    }

    return (
        <Field
            optional
            label="About them"
            hint="A few lines in their own words. Shows on the website's Our team."
        >
            <Textarea
                value={text}
                rows={3}
                maxLength={ABOUT_MAX}
                onChange={(e) => setText(e.target.value)}
            />
            {dirty ? (
                <Button
                    type="button"
                    size="sm"
                    className="mt-2 justify-self-start"
                    busy={saving}
                    disabled={saving}
                    onClick={() => void save()}
                >
                    Save
                </Button>
            ) : null}
        </Field>
    );
}
