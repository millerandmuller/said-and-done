/** @type {import('next').NextConfig} */
const nextConfig = {
  // The toolkit pulls in node-only dependencies; keep it out of the client bundle.
  serverExternalPackages: ["@paypal/agent-toolkit"],
};
export default nextConfig;
