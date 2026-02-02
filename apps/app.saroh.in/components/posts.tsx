import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PostCard from "./post-card";
import Image from "next/image";

export default async function Posts({
	// siteId,
	limit,
	subdomain,
}: {
	// siteId?: string;
	limit?: number;
	subdomain?: string;
}) {
	const session = await getSession();
	if (!session?.user) {
		redirect("/login");
	}
	const site = await prisma.site.findUnique({
		where: {
			subdomain: subdomain,
		},
	});
	const siteId = site && site.id;
	const posts = await prisma.post.findMany({
		where: {
			userId: session.user.id as string,
			...(siteId ? { siteId } : {}),
			// siteId: siteId,
		},
		orderBy: {
			updatedAt: "desc",
		},
		include: {
			site: true,
		},
		...(limit ? { take: limit } : {}),
	});

	return posts.length > 0 ? (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{posts.map((post) => (
				<PostCard
					key={post.id}
					data={post}
					subdomain={subdomain as string}
				/>
			))}
		</div>
	) : (
		<div className="flex flex-col items-center space-x-4">
			<h1 className="font-cal text-4xl">No Posts Yet</h1>
			<Image
				alt="missing post"
				src="https://illustrations.popsy.co/gray/graphic-design.svg"
				width={400}
				height={400}
			/>
			<p className="text-lg text-stone-500">
				You do not have any posts yet. Create one to get started.
			</p>
		</div>
	);
}
