/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
