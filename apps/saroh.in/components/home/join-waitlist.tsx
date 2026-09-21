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
import { showError, showSuccess } from "@saroh/ui/toast";
import { useForm } from "react-hook-form";
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
                showSuccess(
                    json.created === false
                        ? "You're already on the list — we'll be in touch."
                        : "You're on the list. We'll email you when we open your batch.",
                );
                form.reset();
                return;
            }

            showError(
                json.reason?.code === "RATE_LIMITED"
                    ? "Too many attempts. Try again in a minute."
                    : "Something went wrong. Please try again.",
            );
            console.error("[waitlist]", json.reason);
        } catch (error: unknown) {
            showError(
                "Something went wrong. Please try again.",
                error instanceof Error ? error.message : undefined,
            );
        }
    }

    // `watch`, not `getValues`: getValues does not subscribe to changes, so the
    // submit button stayed disabled while the user typed and only enabled on an
    // unrelated re-render.
    const email = form.watch("email");
    const submitting = form.formState.isSubmitting;

    // Just the form: the card around it is the page's closing section
    // (components/site/closing-cta.tsx), which says what the list is for.
    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="mx-auto flex max-w-md flex-col gap-2.5 sm:flex-row"
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
                                    className="h-12 w-full rounded-[10px] bg-background text-[16px]"
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
                    className="h-12 shrink-0 rounded-[10px] px-6 text-[16px] font-semibold"
                >
                    {submitting ? "Joining…" : "Join the waitlist"}
                </Button>
            </form>
        </Form>
    );
}
