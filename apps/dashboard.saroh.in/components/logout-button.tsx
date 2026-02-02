"use client";
import { Button } from "@saroh/ui/button";
import { signOut } from "next-auth/react";
export default function LogoutButton() {
    return <Button onClick={() => signOut()}>Log out</Button>;
}
