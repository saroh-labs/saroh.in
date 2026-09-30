"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LinkBox } from "@/components/sites/test-releases/link-box";
import type {
    CreatedTestReleaseLink,
    TestRelease,
} from "@/lib/sites/test-releases";
import {
    FROZEN_IN_RELEASE,
    LIVE_OUTSIDE_RELEASE,
} from "@/lib/sites/test-releases";
import { createTestRelease } from "@/lib/sites/test-releases-actions";

// The API's limits (`CreateTestReleaseDto`), said before it refuses.
const schema = z.object({
    name: z
        .string()
        .max(80, { message: "A name can be at most 80 characters" }),
    note: z
        .string()
        .max(500, { message: "A note can be at most 500 characters" }),
});
type Values = z.infer<typeof schema>;

/**
 * "Make a test release" (DEC-071, R1, R6): a name and a note, what the
 * release freezes and what stays live, then the link, once, with Copy and
 * Open. A blank name takes the API's "Test release N".
 *
 * The draft must be saved first: a release freezes what the server holds,
 * so unsaved work on screen would not be in it (the same rule as Publish).
 */
export function MakeTestReleaseSheet({
    siteId,
    open,
    onOpenChange,
    unsaved,
    nextNumber,
    onMade,
}: {
    siteId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Work on screen the server doesn't have yet. */
    unsaved: boolean;
    /** The number the API will give it, for the name's placeholder. */
    nextNumber: number;
    /** Made: the list re-reads. */
    onMade: (release: TestRelease) => void;
}) {
    const [made, setMade] = useState<{
        release: TestRelease;
        link: CreatedTestReleaseLink;
    } | null>(null);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { name: "", note: "" },
    });
    const { isSubmitting } = form.formState;

    function close(next: boolean) {
        if (next) return onOpenChange(true);
        onOpenChange(false);
        // Next time starts empty; the link was shown once, as promised.
        setMade(null);
        form.reset();
    }

    async function onSubmit(values: Values) {
        const res = await createTestRelease(siteId, {
            name: values.name.trim() || undefined,
            note: values.note.trim() || null,
        });
        if (!res.ok) {
            if (res.field === "name" || res.field === "note") {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        setMade(res.data);
        onMade(res.data.release);
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-[520px]">
                {made ? (
                    <Made made={made} onDone={() => close(false)} />
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Make a test release</DialogTitle>
                            <DialogDescription>
                                Freezes your saved draft on its own test
                                address, for you and anyone you send the link
                                to. Nothing goes live until you say so.
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form
                                onSubmit={(e) => {
                                    e.stopPropagation();
                                    void form.handleSubmit(onSubmit)(e);
                                }}
                                className="grid gap-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    autoComplete="off"
                                                    placeholder={`Test release ${nextNumber}`}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="note"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Note{" "}
                                                <span className="font-normal text-muted-foreground">
                                                    (optional)
                                                </span>
                                            </FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    {...field}
                                                    rows={2}
                                                    placeholder="What to look at, for whoever opens it"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <WhatFreezes />
                                {unsaved ? (
                                    <p
                                        role="status"
                                        className="text-[12.5px] text-muted-foreground"
                                    >
                                        Saving your changes — a test release
                                        freezes what&apos;s saved, so it waits a
                                        moment.
                                    </p>
                                ) : null}
                                <DialogFooter className="gap-2 sm:space-x-0">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isSubmitting}
                                        onClick={() => close(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || unsaved}
                                    >
                                        {isSubmitting
                                            ? "Making…"
                                            : "Make test release"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** R6: what the release freezes, and what it reads from the live business. */
function WhatFreezes() {
    return (
        <div className="grid gap-3 rounded-lg border bg-muted px-3.5 py-3 sm:grid-cols-2">
            <div className="min-w-0">
                <p className="text-[12.5px] font-medium">Frozen in it</p>
                <ul className="mt-1 grid list-disc gap-0.5 pl-4 text-[12.5px] leading-normal text-muted-foreground">
                    {FROZEN_IN_RELEASE.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
            <div className="min-w-0">
                <p className="text-[12.5px] font-medium">
                    Stays live, from your business
                </p>
                <ul className="mt-1 grid list-disc gap-0.5 pl-4 text-[12.5px] leading-normal text-muted-foreground">
                    {LIVE_OUTSIDE_RELEASE.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function Made({
    made,
    onDone,
}: {
    made: { release: TestRelease; link: CreatedTestReleaseLink };
    onDone: () => void;
}) {
    return (
        <>
            <DialogHeader>
                <DialogTitle>{made.release.name} is ready</DialogTitle>
                <DialogDescription>
                    Nothing here takes a real order, booking or payment. The
                    link works for 7 days; you can turn it off or make another
                    from Test releases.
                </DialogDescription>
            </DialogHeader>
            {made.link.url ? (
                <LinkBox
                    url={made.link.url}
                    label="Its link — shown once, so copy it now"
                />
            ) : (
                <p className="rounded-lg border px-3.5 py-3 text-[12.5px] text-muted-foreground">
                    Your web address is too long for a test address, so this
                    release has no link. You can still review it in Saroh and go
                    live with it.
                </p>
            )}
            <DialogFooter>
                <Button type="button" onClick={onDone}>
                    Done
                </Button>
            </DialogFooter>
        </>
    );
}
