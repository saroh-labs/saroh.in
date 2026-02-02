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
            .then((res) => res.json())
            .then((json) => {
                if (json.status === "success") {
                    toast({
                        description:
                            "Thanks for joining the waitlist! We'll be in touch soon.",
                    });

                    form.reset();
                }
                if (json.status === "failure") {
                    if (json.reason.code === "P2002") {
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
            .catch((error) => {
                toast({
                    title: "An error occurred. Please try again later.",
                    variant: "destructive",
                    description: error.message,
                });
            });
    }

    return (
        <div className="relative flex h-[40rem] w-full flex-col items-center justify-center rounded-md bg-neutral-950 antialiased">
            <div className="mx-auto max-w-2xl p-4">
                <h1 className="relative z-10 bg-gradient-to-b from-neutral-200  to-neutral-600 bg-clip-text text-center font-sans text-lg  font-bold text-transparent md:text-7xl">
                    Join the waitlist
                </h1>
                <p></p>
                <p className="relative z-10 mx-auto my-2 max-w-lg text-center text-sm text-neutral-500">
                    Welcome to saroh.in, a full stack platform for building your
                    personal portfolios, blogs or storefronts with ease.
                </p>
                {/* <Input
					type="text"
					placeholder="Enter your email address"
					className="rounded-lg border border-neutral-800 focus:ring-2 focus:ring-teal-500  w-full relative z-10 mt-4  bg-neutral-950 placeholder:text-neutral-700"
				/> */}
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className=" space-y-6"
                    >
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            placeholder="Enter your email address"
                                            className="relative z-10 mt-4 w-full rounded-lg  border border-neutral-800 bg-neutral-950 placeholder:text-neutral-700  focus:ring-2 focus:ring-teal-500"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button
                            type="submit"
                            disabled={Boolean(!form.getValues("email"))}
                        >
                            Submit
                        </Button>
                    </form>
                </Form>
            </div>
        </div>
    );
}
