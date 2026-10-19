const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createHash } = require("node:crypto");
const {
  Updates,
  newer,
  releaseInfo,
  checksumText,
  allowedUrl,
} = require("../core/updates.cjs");
const payload = Buffer.from("synthetic installer; never executed");
const hash = createHash("sha256").update(payload).digest("hex");
const name = "reward-desk-0.6.0-windows-x64-setup.exe";
const release = {
  tag_name: "v0.6.0",
  draft: false,
  prerelease: false,
  body: "Release notes",
  assets: [name, name + ".sha256"].map((name) => ({
    name,
    state: "uploaded",
    size: payload.length,
    browser_download_url:
      "https://github.com/foolka/reward-desk/releases/download/v0.6.0/" + name,
  })),
};

test("default updater requests release JSON with GitHub JSON Accept header", async (t) => {
  let requested;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requested = { url, options };
    return new Response("", { status: 404 });
  });
  const u = new Updates({ current: "0.5.2" });
  assert.equal((await u.check()).status, "unavailable");
  assert.equal(requested.options.headers.Accept, "application/vnd.github+json");
});
test("strict semantic version checks reject downgrade and malformed versions", () => {
  assert.equal(newer("0.10.0", "0.9.9"), true);
  assert.equal(newer("0.5.0", "0.5.0"), false);
  assert.equal(newer("0.4.9", "0.5.0"), false);
  assert.throws(() => newer("0.6.0-beta", "0.5.0"));
  assert.equal(releaseInfo(release, "1.0.0"), null);
  assert.throws(() => releaseInfo({ ...release, prerelease: true }, "0.5.0"));
});

test("OBS updates are isolated from app releases and require plugin assets", async () => {
  const obs = structuredClone(release);
  obs.tag_name = "obs-v0.9.0";
  obs.assets = ["reward-desk-obs-0.9.0-windows-x64-setup.exe", "reward-desk-obs-0.9.0-windows-x64-setup.exe.sha256"].map((name) => ({
    name, state: "uploaded", size: 100,
    browser_download_url: "https://github.com/foolka/reward-desk/releases/download/obs-v0.9.0/" + name,
  }));
  assert.throws(() => releaseInfo(release, "0.1.0", "obs"));
  assert.throws(() => releaseInfo(obs, "0.1.0"));
  const u = new Updates({ current: "0.8.0", kind: "obs", get: async () => new Response(JSON.stringify([release, obs])) });
  assert.equal((await u.check()).release.name, "reward-desk-obs-0.9.0-windows-x64-setup.exe");
  u.get = async () => new Response(JSON.stringify([release]));
  assert.equal((await u.check()).status, "unavailable");
});
test("only exact repository assets and trusted HTTPS redirects accepted", () => {
  assert.ok(releaseInfo(release, "0.5.0"));
  const bad = structuredClone(release);
  bad.assets[0].browser_download_url = "https://github.com/other/repo/test.exe";
  assert.throws(() => releaseInfo(bad, "0.5.0"));
  for (const url of [
    "http://github.com/x",
    "https://github.com.evil.test/x",
    "https://user:pass@github.com/x",
    "https://github.com:8080/x",
  ])
    assert.equal(allowedUrl(url), false);
  assert.equal(
    allowedUrl("https://release-assets.githubusercontent.com/x"),
    true,
  );
  assert.throws(() => checksumText(hash + "  other.exe", name));
});
test("private/missing releases and network failure never claim up to date", async () => {
  const u = new Updates({
    current: "0.5.0",
    get: async () => new Response("", { status: 404 }),
  });
  assert.equal((await u.check()).status, "unavailable");
  u.get = async () => {
    throw Error("offline");
  };
  assert.equal((await u.check()).status, "error");
});
test("verified download is complete and exact; mismatched hash cannot become installer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reward-update-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let corrupt = false;
  const u = new Updates({
    current: "0.5.0",
    get: async (url) =>
      new Response(
        url.endsWith("/latest")
          ? JSON.stringify(release)
          : url.endsWith(".sha256")
            ? `${corrupt ? "0".repeat(64) : hash}  ${name}\n`
            : payload,
      ),
  });
  assert.equal((await u.check()).status, "available");
  const result = await u.download(root);
  assert.deepEqual(fs.readFileSync(result.file), payload);
  assert.equal(result.hash, hash);
  u.state.status = "available";
  corrupt = true;
  await assert.rejects(u.download(root), /сумма/);
  assert.equal(u.state.status, "available");
  assert.equal(
    fs
      .readdirSync(root)
      .filter((dir) => fs.existsSync(path.join(root, dir, name))).length,
    1,
  );
});
