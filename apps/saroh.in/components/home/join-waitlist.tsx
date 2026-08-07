"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
const formSchema = z.object({
    email: z.string().email({
        message: "Please enter a valid email address!",
    }),
});

interface WaitlistResponse {
    status?: "success" | "failure";
    /** False when the address was already on the list. */
    created?: boolean;
    reason?: { code?: string };
}

export default function JoinWaitlist() {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
        },
    });

    /**
     * `async` so react-hook-form's `formState.isSubmitting` actually tracks the
     * request — with the previous non-awaited promise chain it flipped back to
     * false immediately and the button never showed a pending state.
     */
    async function onSubmit(data: z.infer<typeof formSchema>) {
        try {
            const res = await fetch("/api/waitlist", {
                method: "POST",
                body: JSON.stringify(data),
                headers: { "Content-Type": "application/json" },
            });
            const json = (await res.json()) as WaitlistResponse;

            if (json.status === "success") {
                // A repeat signup is not an error — the address is on the list
                // either way, which is what the visitor wanted. Saying so is
                // friendlier than the previous destructive "Email already
                // exists" toast.
                toast.success(
                    json.created === false
                        ? "You're already on the list — we'll be in touch."
                        : "You're on the list. We'll email you when we open your batch.",
                );
                form.reset();
                return;
            }

            toast.error(
                json.reason?.code === "RATE_LIMITED"
                    ? "Too many attempts. Try again in a minute."
                    : "Something went wrong. Please try again.",
            );
            console.error("[waitlist]", json.reason);
        } catch (error: unknown) {
            toast.error("Something went wrong. Please try again.", {
                description: error instanceof Error ? error.message : undefined,
            });
        }
    }

    // `watch`, not `getValues`: getValues does not subscribe to changes, so the
    // submit button stayed disabled while the user typed and only enabled on an
    // unrelated re-render.
    const email = form.watch("email");
    const submitting = form.formState.isSubmitting;

    return (
        // No coloured panel. This is the page's SECONDARY ask, sitting under
        // the primary one, so it is a bordered card in the same register as
        // everything else — the old `bg-brand-surface` block with a lime blur
        // belonged to a palette that no longer exists, and its hardcoded
        // `text-white` was unreadable in the light theme.
        <section
            id="waitlist-form"
            className="scroll-mt-16 rounded-xl border border-border bg-card px-6 py-10 sm:px-10"
        >
            <div className="mx-auto max-w-xl text-center">
                <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">
                    Not ready yet? Be there when it opens.
                </h2>
                <p className="mx-auto mt-3 max-w-[46ch] text-[14.5px] leading-relaxed text-muted-foreground">
                    We are onboarding businesses in small batches so each one
                    gets set up properly. Leave your email and we will get in
                    touch when it is your turn.
                </p>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="mx-auto mt-7 flex max-w-md flex-col gap-2.5 sm:flex-row"
                    >
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem className="flex-1 text-left">
                                    <FormControl>
                                        <Input
                                            type="email"
                                            autoComplete="email"
                                            placeholder="you@yourbusiness.in"
                                            aria-label="Email address"
                                            className="h-10 w-full rounded-md border-input bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button
                            type="submit"
                            disabled={!email || submitting}
                            className="h-10 shrink-0 rounded-md bg-primary px-5 text-[13.5px] font-medium text-primary-foreground hover:opacity-90"
                        >
                            {submitting ? "Joining…" : "Join the waitlist"}
                        </Button>
                    </form>
                </Form>

                <p className="mt-4 text-[12px] text-muted-foreground/70">
                    One email when we open your batch. No newsletter.
                </p>
            </div>
        </section>
    );
}
