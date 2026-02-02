import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
export default async function Home() {
    const session = await auth();
    if (session) {
        redirect("/products");
    }
    redirect(`/login`);
    return (
        <main>
            hi
            {/* <Button>Login</Button>
            <Avatar>
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <div>{session?.user?.email}</div>
            <LogoutButton /> */}
        </main>
    );
}
