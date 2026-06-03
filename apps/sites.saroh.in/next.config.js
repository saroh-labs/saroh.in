/** @type {import('next').NextConfig} */
const nextConfig = {
	// No database here — sites renders via api.saroh.in (single backend).
	reactStrictMode: false,
	images: {
		domains: [
			"public.blob.vercel-storage.com",
			"res.cloudinary.com",
			"abs.twimg.com",
			"pbs.twimg.com",
			"avatars.githubusercontent.com",
			"www.google.com",
			"flag.vercel.app",
			"illustrations.popsy.co",
			"lh3.googleusercontent.com",
		],
	},
};

module.exports = nextConfig;
