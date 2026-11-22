"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import {
    ArrowDownToLine,
    MoreHorizontal,
    Save,
    Search,
    Share2,
    SlidersHorizontal,
    Trash2,
} from "lucide-react";
import { useState } from "react";

import { ShareItemSheet } from "@/components/shared/share-item/share-item-sheet";

import type { PostEditorModel } from "./post-model";

/**
 * ⋯ More on the post bar (`blogdesk/WXWStates`, "Take off or delete, from
 * More"): Save now (⌘S), More formatting, Take off the site… and Delete
 * this post…, each asking first. Never beside Publish post. Share as a
 * post is on the Details tab's live card, where today's Share sits.
 */
export function PostMoreMenu({
    model,
    onMoreFormatting,
    onFind,
}: {
    model: PostEditorModel;
    onMoreFormatting: () => void;
    /** Find (⌘K, W6). */
    onFind?: () => void;
}) {
    const { draft, data } = model;
    const [ask, setAsk] = useState<"takeOff" | "delete" | null>(null);
    const [sharing, setSharing] = useState(false);
    const share = draft.live ? data.share : null;
    const writer = !data.readOnly;
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label="More: share, find, save now, more formatting, take off the site, delete"
                        icon={<MoreHorizontal className="size-5" />}
                        tooltip={false}
                        className="size-11"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {share ? (
                        <DropdownMenuItem onSelect={() => setSharing(true)}>
                            <Share2 aria-hidden />
                            Share as a post
                        </DropdownMenuItem>
                    ) : null}
                    {onFind ? (
                        <DropdownMenuItem onSelect={onFind}>
                            <Search aria-hidden />
                            Find
                            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                        </DropdownMenuItem>
                    ) : null}
                    {writer && !data.paused ? (
                        <>
                            <DropdownMenuItem
                                onSelect={() => {
                                    if (!model.needsTitle()) void draft.save();
                                }}
                            >
                                <Save aria-hidden />
                                Save now
                                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onMoreFormatting}>
                                <SlidersHorizontal aria-hidden />
                                More formatting
                            </DropdownMenuItem>
                        </>
                    ) : null}
                    {writer && draft.postId ? (
                        <>
                            {/* One gap, no rule, before the ways out (W6.3). */}
                            <DropdownMenuSeparator className="my-1.5 bg-transparent" />
                            {/* Taking it off only ever lowers the count, so
                                a paused post keeps it. */}
                            {draft.live ? (
                                <DropdownMenuItem
                                    disabled={draft.publishing}
                                    onSelect={() => setAsk("takeOff")}
                                >
                                    <ArrowDownToLine aria-hidden />
                                    Take off the site…
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setAsk("delete")}
                            >
                                <Trash2 aria-hidden />
                                Delete this post…
                            </DropdownMenuItem>
                        </>
                    ) : null}
                    {writer ? null : (
                        <DropdownMenuItem disabled>
                            Reading only: nothing here changes the post
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {share ? (
                <ShareItemSheet
                    open={sharing}
                    onClose={() => setSharing(false)}
                    setup={share.setup}
                    item={{
                        kind: "post",
                        // The saved address, which the live copy has.
                        ref: model.liveCopy?.slug ?? draft.fields.slug,
                        name: draft.fields.title,
                        price: null,
                        url: share.url,
                        offerId: null,
                        hasPhoto: Boolean(draft.fields.image.trim()),
                        summary: draft.fields.excerpt,
                    }}
                />
            ) : null}
            <ConfirmDialog
                open={ask === "takeOff"}
                onOpenChange={(open) => setAsk(open ? "takeOff" : null)}
                title="Take this post off the site?"
                description="It stays here as a draft, and you can publish it again any time. Its link stops working until you do."
                confirmLabel="Take it off"
                keepLabel="Keep it live"
                tone="neutral"
                busyLabel="Taking it off…"
                onConfirm={async () => {
                    await draft.unpublish();
                }}
            />
            <ConfirmDialog
                open={ask === "delete"}
                onOpenChange={(open) => setAsk(open ? "delete" : null)}
                title="Delete this post?"
                description={
                    draft.liveAt
                        ? "It comes off the site and out of your posts, and its link stops working for anyone who saved it. To take it down and keep it, use Take off the site instead. This cannot be undone."
                        : "It has never been published, so nobody outside your team has seen it. This cannot be undone."
                }
                confirmLabel="Delete post"
                keepLabel="Keep post"
                onConfirm={draft.remove}
            />
        </>
    );
}
