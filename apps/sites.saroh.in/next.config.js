/** @type {import('next').NextConfig} */
const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");

const nextConfig = {
	webpack: (config, { isServer }) => {
		if (isServer) {
			config.plugins = [...config.plugins, new PrismaPlugin()];
		}

		return config;
	},
	reactStrictMode: false,
	experimental: {
		serverActions: true,
	},
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
