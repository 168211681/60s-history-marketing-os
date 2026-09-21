import assert from "node:assert/strict";
import test from "node:test";
import { videoProvider } from "../src/lib/video";

test("public-domain provider is available without paid credentials", () => {
  const previous = process.env.VIDEO_PROVIDER;
  process.env.VIDEO_PROVIDER = "public-domain";
  try {
    const provider = videoProvider();
    assert.equal(provider.name, "public-domain");
    assert.equal(provider.configured, true);
  } finally {
    if (previous === undefined) delete process.env.VIDEO_PROVIDER;
    else process.env.VIDEO_PROVIDER = previous;
  }
});
