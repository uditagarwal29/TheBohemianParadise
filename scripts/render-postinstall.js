// On Render the service's build command is plain `yarn`/`npm install`; build the
// storefront from here so no dashboard change is required. Locally this is a no-op
// (run `npm run build` yourself).
if (process.env.RENDER) {
  const { execSync } = require("child_process");
  execSync("npm run build", { stdio: "inherit" });
}
