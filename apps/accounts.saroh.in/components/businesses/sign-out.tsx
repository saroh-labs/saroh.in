"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { authClient } from "@/lib/auth.client";

export function SignOut() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    await authClient.signOut();
                    router.push("/login");
                })
            }
        >
            {pending ? "Signing out…" : "Sign out"}
        </Button>
    );
}
