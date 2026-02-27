/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent bundler from trying to process mendixplatformsdk (use eval('require') in API routes instead)
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'mendixplatformsdk']
    }
    return config
  },
  // Allow long-running API routes (model extraction: 30-120s)
  experimental: {
    serverComponentsExternalPackages: ['mendixplatformsdk']
  }
}

export default nextConfig
