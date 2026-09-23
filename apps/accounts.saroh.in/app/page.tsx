import { redirect } from "next/navigation";

/** The accounts app's front door is the list of your businesses. */
export default function Home(): never {
    redirect("/businesses");
}
