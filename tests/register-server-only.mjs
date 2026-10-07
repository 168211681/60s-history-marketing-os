import { registerHooks } from "node:module";

const stub = new URL("./server-only-stub.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { shortCircuit: true, url: stub };
    return nextResolve(specifier, context);
  },
});
