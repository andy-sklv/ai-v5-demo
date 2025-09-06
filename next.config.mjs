import path from 'path';

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Жёстко мапим alias "@/..." -> корень проекта
    config.resolve.alias['@'] = path.resolve(process.cwd());
    return config;
  },
};

export default nextConfig;
