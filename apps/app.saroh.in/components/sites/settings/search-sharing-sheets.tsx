"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { ShareCards } from "@saroh/ui/share-cards";
import { Textarea } from "@saroh/ui/textarea";
import { useState } from "react";

import { MediaPicker } from "@/components/sites/media-picker";
import type { updateSiteSettings } from "@/lib/sites/actions";
import { settingsEditId } from "@/lib/sites/settings-edit";

import { NOTE, SettingsSheetFrame } from "./settings-sheet";
import { ShareImageThumb } from "./share-image-thumb";
import type { ShareImage } from "./use-share-image";
import { useShareImage } from "./use-share-image";

/** Search engines truncate around here. Guidance, never enforcement. */
const TITLE_GUIDE = 60;
const DESCRIPTION_GUIDE = 155;

/** "12 of about 60 characters", or the aim once past it. */
function lengthLine(length: number, guide: number): string {
    return length > guide
        ? `Aim for ${guide} characters or fewer. Currently ${length}.`
        : `${length} of about ${guide} characters.`;
}

/** What Search and sharing has saved, as its rows say it. */
export interface SearchSharingSaved {
    seoTitle: string;
    seoDescription: string;
    image: ShareImage;
}

interface SheetProps {
    saved: SearchSharingSaved;
    /** The site's name, as its header says it. */
    siteName: string;
    /** The host the link is shared as; null before the site has one. */
    domain: string | null;
    open: boolean;
    pending: boolean;
    onClose: () => void;
}

/**
 * How the link will look with what is typed, in the sheet: WhatsApp first,
 * the other apps folded, as the "When shared" row draws what is saved.
 */
function Preview({
    saved,
    siteName,
    domain,
    draft,
}: Pick<SheetProps, "saved" | "siteName" | "domain"> & {
    draft: Partial<SearchSharingSaved>;
}) {
    const now = { ...saved, ...draft };
    return (
        <div className="mt-3 grid gap-2 border-t border-border pt-3">
            <p className="text-sm font-medium">When shared</p>
            <ShareCards
                fold
                title={now.seoTitle || siteName}
                description={now.seoDescription}
                siteName={siteName}
                domain={domain}
                image={
                    now.image.url
                        ? { url: now.image.url, ...now.image.facts }
                        : null
                }
                // What is typed isn't live yet: nothing to inspect.
                liveUrl={null}
            />
        </div>
    );
}

/** The search title, with its length as it is typed. */
export function TitleSheet({
    name,
    onSave,
    ...props
}: SheetProps & {
    /** What stands in for an empty title: the site's name. */
    name: string;
    onSave: (seoTitle: string) => void;
}) {
    const { saved, open, pending, onClose } = props;
    const [title, setTitle] = useState(saved.seoTitle);
    return (
        <SettingsSheetFrame
            editId={settingsEditId("title")}
            title="Title"
            description="What search results and shared links call your site."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (title === saved.seoTitle) onClose();
                else onSave(title);
            }}
        >
            <Label htmlFor="settings-title-field">Search title</Label>
            <Input
                id="settings-title-field"
                value={title}
                placeholder={name}
                aria-describedby="settings-title-note"
                onChange={(e) => setTitle(e.target.value)}
            />
            <p id="settings-title-note" className={NOTE}>
                {title
                    ? lengthLine(title.length, TITLE_GUIDE)
                    : `Left empty, your site's name is used: ${name}.`}
            </p>
            <Preview {...props} draft={{ seoTitle: title }} />
        </SettingsSheetFrame>
    );
}

/** The search description, with its length as it is typed. */
export function DescriptionSheet({
    onSave,
    ...props
}: SheetProps & { onSave: (seoDescription: string) => void }) {
    const { saved, open, pending, onClose } = props;
    const [description, setDescription] = useState(saved.seoDescription);
    return (
        <SettingsSheetFrame
            editId={settingsEditId("description")}
            title="Description"
            description="A line or two under the title in search results and shared links."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (description === saved.seoDescription) onClose();
                else onSave(description);
            }}
        >
            <Label htmlFor="settings-description-field">
                Search description
            </Label>
            <Textarea
                id="settings-description-field"
                value={description}
                rows={4}
                aria-describedby="settings-description-note"
                onChange={(e) => setDescription(e.target.value)}
            />
            <p id="settings-description-note" className={NOTE}>
                {lengthLine(description.length, DESCRIPTION_GUIDE)}
            </p>
            <Preview {...props} draft={{ seoDescription: description }} />
        </SettingsSheetFrame>
    );
}

/**
 * The share image: uploaded here or given by its address, shown as it is
 * chosen, and removed here too. Nothing leaves the sheet for another page.
 */
export function ShareImageSheet({
    onSave,
    ...props
}: SheetProps & {
    onSave: (
        input: Parameters<typeof updateSiteSettings>[1],
        image: ShareImage,
    ) => void;
}) {
    const { saved, open, pending, onClose } = props;
    const image = useShareImage(saved.image);
    return (
        <SettingsSheetFrame
            editId={settingsEditId("image")}
            title="Share image"
            description="The picture apps show beside your link when it is shared."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (image.url === saved.image.url) onClose();
                else
                    onSave(image.input, { url: image.url, facts: image.facts });
            }}
        >
            <div className="flex items-center gap-3">
                <ShareImageThumb url={image.url} />
                <div className="min-w-0 text-xs">
                    {image.url ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => image.choose("")}
                        >
                            Remove image
                        </Button>
                    ) : (
                        <p className="text-muted-foreground">
                            None yet. 1200×630 works everywhere.
                        </p>
                    )}
                </div>
            </div>
            <MediaPicker onPick={(img) => image.choose(img.src, img)} />
            <Label htmlFor="settings-image-field" className="mt-2">
                Or paste an image address
            </Label>
            <Input
                id="settings-image-field"
                value={image.url}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => image.choose(e.target.value)}
            />
            <Preview
                {...props}
                draft={{ image: { url: image.url, facts: image.facts } }}
            />
        </SettingsSheetFrame>
    );
}
