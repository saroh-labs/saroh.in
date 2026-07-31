"use client";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
const formSchema = z.object({
    email: z.string().email({
        message: "Please enter a valid email address!",
    }),
});

interface WaitlistResponse {
    status?: "success" | "failure";
    reason?: { code?: string };
}

export default function JoinWaitlist() {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
        },
    });
    function onSubmit(data: z.infer<typeof formSchema>) {
        console.log({ data });
        fetch("/api/waitlist", {
            method: "POST",
            body: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json",
            },
        })
            .then((res) => res.json() as Promise<WaitlistResponse>)
            .then((json) => {
                if (json.status === "success") {
                    toast({
                        description:
                            "Thanks for joining the waitlist! We'll be in touch soon.",
                    });

                    form.reset();
                }
                if (json.status === "failure") {
                    if (json.reason?.code === "P2002") {
                        return toast({
                            title: "Email already exists in the waitlist.",
                            variant: "destructive",
                        });
                    }
                    toast({
                        title: "An error occurred. Please try again later.",
                        variant: "destructive",
                        // description: json.reason.,
                    });
                    console.error(json.reason);
                }
            })
            .catch((error: unknown) => {
                toast({
                    title: "An error occurred. Please try again later.",
                    variant: "destructive",
                    description:
                        error instanceof Error ? error.message : undefined,
                });
            });
    }

    // `watch`, not `getValues`: getValues does not subscribe to changes, so the
    // submit button stayed disabled while the user typed and only enabled on an
    // unrelated re-render.
    const email = form.watch("email");
    const submitting = form.formState.isSubmitting;

    return (
        <section
            id="waitlist"
            className="relative isolate scroll-mt-16 overflow-hidden bg-brand-surface px-6 py-24 sm:py-28"
        >
            <div
                aria-hidden
                className="absolute -bottom-48 left-[-10%] h-[30rem] w-[30rem] rounded-full bg-highlight/15 blur-3xl"
            />
            <div className="relative mx-auto max-w-xl text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Be there when it opens
                </h2>
                <p className="mx-auto mt-4 max-w-[46ch] text-base text-white/70">
                    We are onboarding businesses in small batches so each one
                    gets set up properly. Leave your email and we will get in
                    touch when it is your turn.
                </p>

                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:flex-row"
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
                                            className="h-11 w-full rounded-lg border-white/20 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-highlight focus-visible:ring-offset-0"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage className="text-highlight" />
                                </FormItem>
                            )}
                        />
                        <Button
                            type="submit"
                            disabled={!email || submitting}
                            className="h-11 shrink-0 rounded-lg bg-highlight px-6 font-semibold text-highlight-foreground hover:bg-highlight hover:opacity-90 disabled:opacity-40"
                        >
                            {submitting ? "Joining…" : "Join the waitlist"}
                        </Button>
                    </form>
                </Form>

                <p className="mt-5 text-xs text-white/45">
                    One email when we open your batch. No newsletter.
                </p>
            </div>
        </section>
    );
}
