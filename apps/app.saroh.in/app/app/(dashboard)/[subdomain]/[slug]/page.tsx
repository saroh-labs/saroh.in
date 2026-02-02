import Editor from "@/components/editor";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

export default async function PostPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const session = await getSession();
    if (!session) {
        redirect("/login");
    }
    const data = await prisma.post.findUnique({
        where: {
            id: slug,
        },
        include: {
            site: {
                select: {
                    subdomain: true,
                },
            },
        },
    });
    if (!data || data.userId !== session.user.id) {
        notFound();
    }

    return (
        <>
            <Editor post={data} />
            {/* <BlockNoteEditor /> */}
        </>
    );
}
