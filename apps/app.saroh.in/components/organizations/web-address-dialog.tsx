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
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type { WebAddressView } from "@/lib/organizations/web-address";
import {
    addressHost,
    consequences,
    hostOf,
    suffixOf,
    typedAddress,
    useAddressCheck,
} from "@/lib/organizations/web-address";
import {
    checkWebAddress,
    saveWebAddress,
} from "@/lib/organizations/web-address-actions";

const schema = z.object({
    address: z.string().min(1, { message: "Enter a web address" }),
});
type Values = z.infer<typeof schema>;

/**
 * Change the business's web address (DEC-069, L4). The owner types the new
 * address against the platform's suffix and it is checked as they go; a
 * taken one offers the API's free suggestion. What the change does — the
 * old address forwarding for 90 days, then released; shared links; signed-in
 * customers — is said before the button, never after.
 *
 * The API decides everything (the rules, what is free, the owner, the
 * holds): a refusal lands on the field with its suggestion, anything else
 * in a toast. On save the page is read again and the toast names the new
 * address.
 */
export function WebAddressDialog({
    open,
    onOpenChange,
    view,
    zone,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    view: WebAddressView;
    /** The business's time zone, which the release date is a day in. */
    zone: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Change your web address</DialogTitle>
                    <DialogDescription>
                        Where customers find your website, your shop and your
                        booking page.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted only while open, so each opening starts afresh. */}
                {open ? (
                    <ChangeForm
                        view={view}
                        zone={zone}
                        onDone={() => onOpenChange(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function ChangeForm({
    view,
    zone,
    onDone,
}: {
    view: WebAddressView;
    zone: string;
    onDone: () => void;
}) {
    const router = useRouter();
    const suffix = suffixOf(view);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { address: view.address },
    });
    const { isSubmitting } = form.formState;
    const address = useWatch({ control: form.control, name: "address" });
    const same = address === view.address;
    const check = useAddressCheck(address, checkWebAddress, { skip: same });
    // A suggestion from Save's refusal, for the address it was refused for.
    const [refused, setRefused] = useState<{
        address: string;
        suggestion: string;
    } | null>(null);

    const answer = check.state === "answered" ? check.answer : null;
    const problem = answer && !answer.ok ? answer.reason : null;
    const suggestion =
        (answer && !answer.ok ? answer.suggestion : null) ??
        (refused?.address === address ? refused.suggestion : null);
    const saveOff =
        same ||
        address === "" ||
        isSubmitting ||
        check.state === "checking" ||
        (answer !== null && !answer.ok);

    function use(next: string) {
        form.setValue("address", next, { shouldDirty: true });
        form.clearErrors("address");
    }

    async function onSubmit(values: Values) {
        const res = await saveWebAddress(values.address);
        if (!res.ok) {
            if (res.field === "address") {
                form.setError("address", { message: res.error });
                if (res.suggestion) {
                    setRefused({
                        address: values.address,
                        suggestion: res.suggestion,
                    });
                }
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess(
            `Your web address is now ${hostOf(res.data.platformOrigin)}`,
        );
        onDone();
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={(e) => {
                    // The dialog is portalled but still inside the page's
                    // React tree: keep its submit from reaching any form
                    // around the section.
                    e.stopPropagation();
                    void form.handleSubmit(onSubmit)(e);
                }}
                className="grid gap-4"
            >
                <FormField
                    control={form.control}
                    name="address"
                    render={({ field, fieldState }) => (
                        <FormItem>
                            <FormLabel>New web address</FormLabel>
                            <div
                                className={cn(
                                    "flex h-[38px] items-center rounded-md border border-input bg-field pr-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring",
                                    (problem !== null ||
                                        fieldState.error !== undefined) &&
                                        "border-destructive",
                                )}
                            >
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(e) => {
                                            form.clearErrors("address");
                                            field.onChange(
                                                typedAddress(e.target.value),
                                            );
                                        }}
                                        spellCheck={false}
                                        autoCapitalize="off"
                                        autoComplete="off"
                                        aria-describedby="web-address-status"
                                        // The frame is the field; the input
                                        // is borderless so the address and
                                        // its suffix read as one value.
                                        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-0 text-right font-mono shadow-none focus-visible:ring-0"
                                    />
                                </FormControl>
                                <span className="text-muted-foreground">
                                    {suffix}
                                </span>
                            </div>
                            <div
                                id="web-address-status"
                                role="status"
                                className={cn(
                                    "flex min-h-[1.2em] flex-wrap items-center gap-x-2 gap-y-1 text-[12px]",
                                    problem
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {same ? (
                                    "This is your web address now."
                                ) : check.state === "checking" ? (
                                    "Checking…"
                                ) : answer?.ok && !fieldState.error ? (
                                    <span className="inline-flex items-center gap-1 text-success">
                                        <Check
                                            aria-hidden
                                            className="size-3.5"
                                        />
                                        Free
                                    </span>
                                ) : problem ? (
                                    <span>{problem}</span>
                                ) : null}
                                {suggestion ? (
                                    <Button
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-[12px] font-medium"
                                        onClick={() => use(suggestion)}
                                    >
                                        Use {addressHost(suggestion, suffix)}
                                    </Button>
                                ) : null}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-1.5 rounded-lg border border-border bg-muted/50 px-3.5 py-3">
                    <p className="text-[12.5px] font-medium">
                        When you change it
                    </p>
                    <ul className="grid list-disc gap-1 pl-4 text-[12.5px] leading-normal text-muted-foreground">
                        {consequences(view, zone).map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onDone}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={saveOff}>
                        {isSubmitting ? "Changing…" : "Change web address"}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    );
}
