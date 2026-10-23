"use client";

import { Button } from "@saroh/ui/button";
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { SetupValues } from "@/lib/organizations/setup-steps";

/**
 * "Is someone from Saroh helping you?" (DEC-169): the optional code of the
 * Saroh teammate who is, so the business is put down to them. Most people
 * have none, so it stays one quiet line until asked for, and opens by
 * itself when the tab's draft already holds a code.
 *
 * Whether the code names anyone is the API's to say, and it never tells:
 * a code that names nobody makes the business all the same. The form only
 * points out a code that can't be one (`managerCodeProblem`).
 */
export function SetupManagerCode() {
    const form = useFormContext<SetupValues>();
    const value = useWatch({ control: form.control, name: "managerCode" });
    const [open, setOpen] = useState(() => Boolean(value?.trim()));

    if (!open) {
        return (
            <div>
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    className="text-muted-foreground"
                    onClick={() => {
                        setOpen(true);
                        // The field the line opened, ready to type in.
                        requestAnimationFrame(() =>
                            form.setFocus("managerCode"),
                        );
                    }}
                >
                    Is someone from Saroh helping you?
                </Button>
            </div>
        );
    }

    return (
        <FormField
            control={form.control}
            name="managerCode"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Code from your Saroh contact</FormLabel>
                    <FormControl>
                        <Input
                            {...field}
                            value={field.value ?? ""}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={20}
                            className="font-mono coarse:text-base"
                        />
                    </FormControl>
                    <FormDescription>
                        Optional. It tells us who is helping you, so they can
                        follow up.
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
