"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { OptionSelect } from "@/components/shared/option-select";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import { inviteMember } from "@/lib/members/actions";
import { LOCATION_ROLES, roleLabel } from "@/lib/stores/people";

const formSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, { message: "Enter their email" })
        .email({ message: "Enter a valid email" }),
    role: z.enum(["ADMIN", "MANAGER", "EDITOR", "VIEWER"]),
});

type FormValues = z.infer<typeof formSchema>;

const ROLE_OPTIONS = LOCATION_ROLES.map((r) => ({
    value: r,
    label: roleLabel(r),
}));

/**
 * "Invite someone" on a location's People tab: an email and a role, sent
 * with one press. Whoever accepts also joins the business's team as
 * Location team unless they're on it already (DEC-048, F16), which the
 * sheet says in a line.
 *
 * A refusal keeps the sheet open with what was typed: under the email when
 * the API names it, else in a toast. Sent, it closes and the page reads the
 * roster again, so the invitation shows under Invited. It is drawn in the
 * app's one sheet frame (`components/shared/settings-sheet-frame.tsx`): it
 * can't be dismissed while it is sending, Cancel, Escape and the close
 * button drop what was typed, and a press outside does nothing once an
 * email is typed.
 */
export function InvitePersonSheet({
    storeId,
    locationName,
    open,
    onOpenChange,
}: {
    storeId: string;
    locationName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "", role: "VIEWER" },
    });
    const { isSubmitting } = form.formState;

    const close = () => {
        form.reset();
        onOpenChange(false);
    };

    async function onSubmit(values: FormValues) {
        const res = await inviteMember(storeId, values.email, values.role);
        if (!res.ok) {
            if (res.field === "email") {
                form.setError("email", { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess(
            "Invitation sent. When they accept, they're also added to your team, as Location team.",
        );
        close();
        router.refresh();
    }

    return (
        <Form {...form}>
            <SettingsSheetFrame
                id="invite-person"
                // Back to the button that opened it.
                returnFocusTo="invite-someone"
                title="Invite someone"
                description={`They can work on ${locationName}'s catalogue, orders and customers once they accept.`}
                open={open}
                pending={isSubmitting}
                saveLabel="Send invite"
                savingLabel="Sending…"
                fieldsClassName="gap-4"
                onClose={close}
                onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    autoComplete="email"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role</FormLabel>
                            <FormControl>
                                <OptionSelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={isSubmitting}
                                    options={ROLE_OPTIONS}
                                    className="w-full"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    They also join your team as Location team, unless they are
                    on it already.
                </p>
            </SettingsSheetFrame>
        </Form>
    );
}
