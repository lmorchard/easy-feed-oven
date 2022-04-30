// Snowpack Configuration File
// See all supported options: https://www.snowpack.dev/reference/configuration

/** @type {import("snowpack").SnowpackUserConfig } */
export default {
  mount: {
    web: { url: "/" },
    data: { url: "/data" }
  },
  plugins: [
    /* ... */
  ],
  packageOptions: {
    /* ... */
  },
  devOptions: {
    port: 8882,
    open: "none",
  },
  buildOptions: {
    out: "build",
    metaUrlPath: "vendor",
  },
};
