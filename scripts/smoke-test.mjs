import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
const origin = "http://localhost:5173";
const publicGet = await fetch(origin);
assert.equal(publicGet.status, 200, "Workspace renders");
const anonymous = await fetch(origin + "/api/workspace");
assert.equal(anonymous.status, 401, "Anonymous workspace access denied");
const signin = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = signin.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
assert.ok(cookie, "Local sign-in cookie issued");
async function call(path, method = "GET", body, expected = 200) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      cookie,
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  assert.equal(r.status, expected, `${method} ${path}: ${text.slice(0, 350)}`);
  return text ? JSON.parse(text) : null;
}
const workspace = await call("/api/workspace");
assert.ok(Array.isArray(workspace.products));
const initialProviders = await call("/api/providers");
assert.ok(
  !Object.values(initialProviders.connected).some(Boolean),
  "Run smoke tests only with an isolated local account that has no real API keys",
);
const brief = {
  title: "FiveGen QA product",
  description:
    "A local-only product used to verify secure publishing and delivery.",
  audience: "Quality assurance",
  format: "Guide",
  price: 49,
  color: "orange",
};
const created = await call("/api/products", "POST", brief);
const p = created.product;
assert.ok(p.id);
assert.equal(created.mode, "starter");
const marker = "PRIVATE-CONTENT-" + crypto.randomUUID();
p.content.sections[0].body = marker + " <script>alert(1)</script>";
p.status = "published";
await call(`/api/products/${p.id}`, "PATCH", p);
const publicPage = await fetch(origin + "/p/" + p.slug);
assert.equal(publicPage.status, 200);
assert.ok(
  !(await publicPage.text()).includes(marker),
  "Paid content must never leak in public HTML/RSC",
);
const blocked = await fetch(origin + "/api/download/" + p.slug);
assert.equal(blocked.status, 403, "Paid download requires verified order");
const denied = await fetch(origin + `/api/products/${p.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(p),
});
assert.equal(denied.status, 401, "Anonymous product mutation denied");
const csrf = await fetch(origin + "/api/workspace", {
  method: "PATCH",
  headers: {
    cookie,
    origin: "https://evil.example",
    "content-type": "application/json",
  },
  body: JSON.stringify({ name: "Attack" }),
});
assert.equal(csrf.status, 403, "Cross-origin writes denied");
await call(
  `/api/products/${p.id}`,
  "PATCH",
  { ...p, whopUrl: "https://evil.example/checkout" },
  400,
);
const generated = await call(`/api/products/${p.id}/generate`, "POST", {}, 409);
assert.ok(generated.error.includes("Unpublish"));
await call(`/api/products/${p.id}`, "PATCH", { ...p, status: "draft" });
const missingProvider = await call(`/api/products/${p.id}/generate`, "POST", {}, 409);
assert.ok(missingProvider.error.includes("Connect"));
await call(`/api/products/${p.id}/generate`, "DELETE");
p.price = 0;
await call(`/api/products/${p.id}`, "PATCH", p);
const zipResponse = await fetch(origin + "/api/download/" + p.slug);
assert.equal(zipResponse.status, 200);
assert.equal(zipResponse.headers.get("content-type"), "application/zip");
const files = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
assert.ok(files["01-product/guide.html"]);
assert.ok(
  !strFromU8(files["01-product/guide.html"]).includes(
    "<script>alert(1)</script>",
  ),
  "Guide export escapes user content",
);
assert.ok(
  !files["03-marketing/launch-campaign.txt"],
  "Customer bundle excludes seller marketing",
);
const provider = await call("/api/providers");
assert.equal(provider.secure, true, "Encrypted key storage configured");
const testKey = "test-placeholder-key-for-encryption-only-12345678";
await call("/api/providers", "PUT", {
  config: provider.config,
  openai: testKey,
});
const secretCheck = await call("/api/providers");
assert.equal(secretCheck.connected.openai, true);
assert.ok(
  !JSON.stringify(secretCheck).includes(testKey),
  "Provider GET never returns secrets",
);
await call("/api/providers", "PUT", {
  config: provider.config,
  remove: "openai",
});
await call(`/api/products/${p.id}`, "PATCH", { ...p, status: "draft" });
const unpublished = await fetch(origin + "/p/" + p.slug);
assert.equal(unpublished.status, 404, "Unpublished storefront not accessible");
console.log(
  "PASS: render, auth, create, publish, paid-content isolation, checkout gating, CSRF, Whop URL validation, resumable generation failure, ZIP delivery, HTML escaping, encrypted provider keys, unpublish.",
);
