import { Suspense } from "react";
import Sites from "@/components/sites";
// import OverviewStats from "@/components/overview-stats";
// import Posts from "@/components/posts";
import Link from "next/link";
import PlaceholderCard from "@/components/placeholder-card";
import OverviewSitesCTA from "@/components/overview-sites-cta";
import CreateSiteButton from "@/components/create-site-button";
import CreateSiteModal from "@/components/modal/create-site";
// import OverviewSitesCTA from "@/components/overview-sites-cta";

export default function Overview() {
	return (
		<div className="flex max-w-screen-xl flex-col space-y-12 p-8">
			<div className="flex flex-col space-y-6">
				<h1 className="font-cal text-3xl font-bold dark:text-white">
					Overview
				</h1>
				{/* <OverviewStats /> */}
			</div>

			<div className="flex flex-col space-y-6">
				<div className="flex items-center justify-between">
					<h1 className="font-cal text-3xl font-bold dark:text-white">
						Sites
					</h1>
					<Suspense fallback={null}>
						<div className="flex gap-4">
							<CreateSiteButton>
								<CreateSiteModal />
							</CreateSiteButton>{" "}
							{/* <OverviewSitesCTA /> */}
						</div>
					</Suspense>
				</div>
				<Suspense
					fallback={
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{Array.from({ length: 4 }).map((_, i) => (
								<PlaceholderCard key={i} />
							))}
						</div>
					}
				>
					<Sites limit={12} />
				</Suspense>
			</div>

			{/* <div className="flex flex-col space-y-6">
				<h1 className="font-cal text-3xl font-bold dark:text-white">
					Recent Posts
				</h1>
				<Suspense
					fallback={
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{Array.from({ length: 8 }).map((_, i) => (
								<PlacholderCard key={i} />
							))}
						</div>
					}
				>
					<Posts limit={8} />
				</Suspense>
			</div> */}
		</div>
	);
}
