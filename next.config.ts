/** @type {import('next').NextConfig} */
const nextConfig = {
  // Add this exact block:
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "canvas"],
};

export default nextConfig;