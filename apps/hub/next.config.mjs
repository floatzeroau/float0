/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@float0/shared', '@float0/ui', '@float0/events'],
  webpack: (config) => {
    // Resolve .js → .ts/.tsx for workspace packages that use ESM .js extensions in source
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
