"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { NameDialog } from "@/components/shared/forms/name-dialog";
import {
    createPostCategory,
    deletePostCategory,
    updatePostCategory,
} from "@/lib/content/actions";
import { CATEGORIES_PARAM } from "@/lib/content/categories-href";
import type { PostCategory } from "@/lib/content/service";
import type { ConfirmResult } from "@saroh/ui/confirm-dialog";
import { FormSheet } from "@saroh/ui/form-sheet";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { CategoryRow } from "./category-row";

/**
 * Post categories, managed from the Posts tab: the header's "Categories"
 * button and the sheet it opens. A flat list (no hierarchy), read first:
 * each row with its Rename and Delete, and one "New category" button at
 * the foot that opens the one-field dialog, so the list stays whole
 * whatever its length. The sheet itself has nothing to save, so its foot
 * ends in Done. Deleting a category detaches its posts server-side.
 * Write access is enforced by the api (owner / EDITOR+).
 *
 * Open is the component's own state. `?categories=1` only opens it on
 * arrival (the old `/posts/categories` address redirects there), and closing
 * it then drops the ask from the address, so a reload doesn't open it again.
 */
export function PostCategoriesSheet({
    siteId,
    categories,
    trigger = <Button variant="outline">Categories</Button>,
    save,
    onRetry,
}: {
    siteId: string;
    /** `null`: the list could not be read, which is not "none yet". */
    categories: PostCategory[] | null;
    /** The button that opens it; the post editor's left panel has its own. */
    trigger?: React.ReactElement;
    /**
     * What a landed write does: on a React Query screen (the Website area)
     * each write takes the tab's business last and the list is read again;
     * the post editor and the area-off header draw their page again.
     */
    save: { orgId?: string; saved: () => Promise<void> };
    /** Read the list again, after it couldn't be read. */
    onRetry: () => void;
}) {
    const orgId = save.orgId;
    const after = () => void save.saved();
    const arriving = useSearchParams().get(CATEGORIES_PARAM) === "1";
    const [open, setOpen] = useState(arriving);
    const [wasArriving, setWasArriving] = useState(arriving);
    if (arriving !== wasArriving) {
        setWasArriving(arriving);
        if (arriving) setOpen(true);
    }

    function close() {
        setOpen(false);
        if (arriving) {
            const url = new URL(window.location.href);
            url.searchParams.delete(CATEGORIES_PARAM);
            window.history.replaceState(null, "", url);
        }
    }

    async function onAdd(name: string) {
        const res = await createPostCategory(siteId, { name }, orgId);
        // A refusal keeps the dialog open with what was typed.
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess("Category added.");
        after();
        return true;
    }

    async function onRename(c: PostCategory, next: string) {
        // The slug is kept: renaming changes what people read, not the
        // address links already point at.
        const res = await updatePostCategory(
            siteId,
            c.id,
            { name: next, slug: c.slug },
            orgId,
        );
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess("Category saved.");
        after();
        return true;
    }

    async function onDelete(c: PostCategory): Promise<ConfirmResult> {
        const res = await deletePostCategory(siteId, c.id, orgId);
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess("Category deleted.");
        after();
    }

    return (
        <FormSheet
            open={open}
            trigger={trigger}
            title="Post categories"
            description="Group this site's posts. A post with no category shows as Uncategorized."
            doneOnly
            extra={
                categories === null ? null : (
                    <NameDialog
                        trigger={
                            <Button type="button" variant="outline">
                                New category
                            </Button>
                        }
                        title="New category"
                        note="Posts can be put in it as soon as it is added."
                        label="Category name"
                        placeholder="Announcements"
                        submitLabel="Add category"
                        busyLabel="Adding…"
                        problem={(name) =>
                            name ? "" : "A category needs a name."
                        }
                        onSubmit={onAdd}
                    />
                )
            }
            onOpen={() => setOpen(true)}
            onClose={close}
        >
            {categories === null ? (
                <FailedState
                    size="panel"
                    title={couldntLoad("categories")}
                    onRetry={onRetry}
                />
            ) : categories.length === 0 ? (
                <EmptyState
                    size="panel"
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
        </FormSheet>
    );
}
