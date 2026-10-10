"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CategoryRow } from "@/components/shared/category-row";
import {
    createPostCategory,
    deletePostCategory,
    updatePostCategory,
} from "@/lib/content/actions";
import { CATEGORIES_PARAM } from "@/lib/content/categories-href";
import type { PostCategory } from "@/lib/content/service";

/**
 * Post categories, managed from the Posts tab: the header's "Categories"
 * button and the sheet it opens. A flat list (no hierarchy), read first:
 * each row with its Rename and Delete, and one "New category" button in the
 * footer that puts the name field there, so the list stays whole above it
 * whatever its length. Deleting a category detaches its posts server-side.
 * Write access is enforced by the api (owner / EDITOR+).
 *
 * Open is the component's own state. `?categories=1` only opens it on
 * arrival (the old `/posts/categories` address redirects there), and closing
 * it then drops the ask from the address, so a reload doesn't open it again.
 */
export function PostCategoriesSheet({
    siteId,
    categories,
}: {
    siteId: string;
    /** `null`: the list could not be read, which is not "none yet". */
    categories: PostCategory[] | null;
}) {
    const router = useRouter();
    const nameId = useId();
    const arriving = useSearchParams().get(CATEGORIES_PARAM) === "1";
    const [open, setOpen] = useState(arriving);
    const [wasArriving, setWasArriving] = useState(arriving);
    if (arriving !== wasArriving) {
        setWasArriving(arriving);
        if (arriving) setOpen(true);
    }
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    // When the name field goes, the keyboard goes back to the button that
    // put it there.
    const newButton = useRef<HTMLButtonElement>(null);
    const refocus = useRef(false);
    useEffect(() => {
        if (adding || !refocus.current) return;
        refocus.current = false;
        newButton.current?.focus();
    }, [adding]);

    function stopAdding() {
        refocus.current = true;
        setAdding(false);
        setName("");
    }

    function change(next: boolean) {
        if (busy) return;
        setOpen(next);
        if (next) return;
        setAdding(false);
        setName("");
        if (arriving) {
            const url = new URL(window.location.href);
            url.searchParams.delete(CATEGORIES_PARAM);
            window.history.replaceState(window.history.state, "", url);
        }
    }

    async function onAdd(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        const res = await createPostCategory(siteId, { name: name.trim() });
        setBusy(false);
        // A refusal keeps the field open with what was typed.
        if (!res.ok) {
            showError(res.error);
            return;
        }
        stopAdding();
        showSuccess("Category created");
        router.refresh();
    }

    async function onRename(c: PostCategory, next: string) {
        // The slug is kept: renaming changes what people read, not the
        // address links already point at.
        const res = await updatePostCategory(siteId, c.id, {
            name: next,
            slug: c.slug,
        });
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(`Renamed to ${next}`);
        router.refresh();
        return true;
    }

    async function onDelete(c: PostCategory) {
        const res = await deletePostCategory(siteId, c.id);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`${c.name} deleted`);
        router.refresh();
    }

    return (
        <Sheet open={open} onOpenChange={change}>
            <SheetTrigger asChild>
                <Button variant="outline">Categories</Button>
            </SheetTrigger>
            <SheetContent
                className="flex w-full flex-col sm:max-w-md"
                // Escape steps back one level: out of the name field first,
                // then out of the sheet.
                onEscapeKeyDown={(e) => {
                    if (!adding || busy) return;
                    e.preventDefault();
                    stopAdding();
                }}
            >
                <SheetHeader>
                    <SheetTitle>Post categories</SheetTitle>
                    <SheetDescription>
                        Group this site&apos;s posts. A post with no category
                        shows as Uncategorized.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-5 flex-1 overflow-y-auto">
                    {categories === null ? (
                        <FailedState
                            title="Categories could not be loaded"
                            description="Nothing has been changed. Try again in a moment."
                            action={
                                <Button
                                    variant="outline"
                                    onClick={() => router.refresh()}
                                >
                                    Try again
                                </Button>
                            }
                        />
                    ) : categories.length === 0 ? (
                        <EmptyState
                            title="No categories yet"
                            description="Add one to group posts, such as Announcements."
                        />
                    ) : (
                        <ul className="divide-y rounded-xl border">
                            {categories.map((c) => (
                                <li key={c.id}>
                                    <CategoryRow
                                        name={c.name}
                                        meta={
                                            c._count.posts === 1
                                                ? "1 post"
                                                : `${c._count.posts} posts`
                                        }
                                        renameNote="Its posts stay in it, and links to it keep working."
                                        deleteTitle={`Delete ${c.name}?`}
                                        deleteBody={
                                            c._count.posts > 0
                                                ? `Its ${c._count.posts === 1 ? "post becomes" : `${c._count.posts} posts become`} Uncategorized and stays where it is on the site. This cannot be undone.`
                                                : "No posts are in it. This cannot be undone."
                                        }
                                        onRename={(next) => onRename(c, next)}
                                        onDelete={() => onDelete(c)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {adding ? (
                    <form
                        onSubmit={onAdd}
                        className="mt-4 grid gap-3 border-t border-border pt-4"
                    >
                        <div className="grid gap-1.5">
                            <Label htmlFor={nameId}>Category name</Label>
                            <Input
                                id={nameId}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Announcements"
                                autoFocus
                                required
                                disabled={busy}
                            />
                        </div>
                        <SheetFooter className="gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={stopAdding}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? "Adding…" : "Add category"}
                            </Button>
                        </SheetFooter>
                    </form>
                ) : (
                    <SheetFooter className="mt-4 gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => change(false)}
                        >
                            Done
                        </Button>
                        {categories === null ? null : (
                            <Button
                                ref={newButton}
                                type="button"
                                onClick={() => setAdding(true)}
                            >
                                New category
                            </Button>
                        )}
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
}
