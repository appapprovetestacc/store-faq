import {
  BUILD_GIT_SHA,
  BUILD_TIMESTAMP,
  BUILD_VERSION,
  DEPENDENCIES,
} from "~/lib/build-meta";

export function loader() {
  return Response.json({
    app: "shopify-app",
    version: BUILD_VERSION,
    gitSha: BUILD_GIT_SHA,
    builtAt: BUILD_TIMESTAMP,
    runtime: "cloudflare-workers",
    dependencies: DEPENDENCIES,
  });
}
