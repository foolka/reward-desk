const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path"),
  fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { initialReward, normalizeSettings } = require("../core/model.cjs");
const root = path.resolve(__dirname, "..");
const local = {
  ...initialReward(),
  id: "local",
  remoteId: "ours",
  account: "owner",
  clientId: "client",
  sync: "synced",
  title: "Видео-сюрприз",
  cost: 750,
  background: "#f59c35",
};
const catalog = {
  account: "owner",
  clientId: "client",
  updatedAt: Date.now(),
  items: [
    {
      id: "ours",
      manageable: true,
      settings: normalizeSettings(local),
      inStock: true,
    },
    {
      id: "old",
      manageable: false,
      settings: normalizeSettings({
        ...initialReward(),
        title: "Награда из панели Twitch",
        cost: 2500,
        background: "#ac477b",
        userLimit: 2,
        cooldown: 90,
      }),
      inStock: true,
    },
    {
      id: "extra",
      manageable: true,
      settings: normalizeSettings({
        ...initialReward(),
        title: "Рулетка звуков",
        cost: 300,
        background: "#259b88",
        paused: true,
      }),
      inStock: false,
    },
  ],
};
const snapshot = {
  version: "0.2.0",
  rewards: [local],
  media: [],
  jobs: [],
  logs: [],
  auth: { user: { id: "owner", login: "test_channel" }, status: "ready" },
  authClientId: "client",
  clientId: "client",
  twitch: "Twitch подключён",
  overlay: {
    url: "http://127.0.0.1:18874/o/test/",
    clients: 0,
    port: 18874,
    error: "",
  },
  paused: false,
};
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1080 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ snapshot, catalog }) => {
        const clone = (x) => structuredClone(x);
        window.mock = {
          snapshot,
          catalog,
          saves: [],
          fail: false,
          dashboard: 0,
        };
        window.desk = {
          filePath: () => "",
          onState: (fn) => (window.emitState = fn),
          command: async (name, arg) => {
            if (name === "state") return clone(mock.snapshot);
            if (name === "channel-list") return clone(mock.catalog);
            if (name === "channel-dashboard") {
              mock.dashboard++;
              return;
            }
            if (name === "channel-save") {
              mock.saves.push(clone(arg));
              if (mock.fail)
                throw Error(
                  "Настройки уже изменены в Twitch. Обновите список.",
                );
              const r = mock.catalog.items.find((r) => r.id === arg.id);
              if (!r.manageable) throw Error("Readonly");
              r.settings = clone(arg.settings);
              const local = mock.snapshot.rewards.find(
                (r) => r.remoteId === arg.id,
              );
              if (local) Object.assign(local, clone(arg.settings));
              return clone(mock.catalog);
            }
            if (name === "save") {
              mock.snapshot.rewards[
                mock.snapshot.rewards.findIndex((r) => r.id === arg.id)
              ] = clone(arg);
              return clone(mock.snapshot);
            }
            throw Error("Unexpected test command: " + name);
          },
        };
      },
      { snapshot, catalog },
    );
    await page.goto(pathToFileURL(path.join(root, "ui/index.html")).href);
    await page.locator("#editor [data-field=title]").waitFor();
    // A periodic state update must not detach the editor's draft from its inputs.
    await page.evaluate(() => emitState(structuredClone(mock.snapshot)));
    await page.locator("#editor [data-field=cost]").fill("1200");
    await page.locator("#editor [data-field=background]").fill("#bb6611");
    await page.locator("#editor [data-limit=userLimit]").check();
    await page.locator("#editor [data-field=userLimit]").fill("4");
    await page.locator("#save").click();
    assert.equal(
      await page.evaluate(() => mock.snapshot.rewards[0].cost),
      1200,
    );
    assert.equal(
      await page.evaluate(() => mock.snapshot.rewards[0].background),
      "#bb6611",
    );
    assert.equal(
      await page.evaluate(() => mock.snapshot.rewards[0].userLimit),
      4,
    );
    await page.locator("#editor [data-field=cost]").fill("1250");
    await page.locator("#save").click();
    assert.equal(
      await page.evaluate(() => mock.snapshot.rewards[0].cost),
      1250,
    );
    await page.locator("[data-tab=channel]").click();
    await page.locator("[data-channel-id=old]").waitFor();
    assert.equal(await page.locator("#channel-list tr").count(), 3);
    assert.equal(
      await page
        .locator(".reward-swatch")
        .nth(1)
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(172, 71, 123)",
    );
    await page.locator("[data-channel-id=old]").click();
    assert.equal(
      await page.locator("#channel-form [data-field=cost]").inputValue(),
      "2500",
    );
    assert.equal(
      await page.locator("#channel-form [data-field=cost]").isDisabled(),
      true,
    );
    await page.locator("#channel-open-twitch").click();
    assert.equal(await page.evaluate(() => mock.dashboard), 1);
    await page.locator("#channel-filter").selectOption("editable");
    assert.equal(await page.locator("#channel-list tr").count(), 2);
    await page.locator("#channel-search").fill("рулетка");
    assert.equal(await page.locator("#channel-list tr").count(), 1);
    await page.locator("#channel-search").fill("");
    await page.locator("#channel-filter").selectOption("all");
    await page.locator("[data-channel-id=ours]").click();
    await page.locator("#channel-form [data-field=cost]").fill("950");
    await page.locator("#channel-form [data-field=background]").fill("#ee8844");
    await page.locator("#channel-form [data-field=input]").check();
    await page.locator("#channel-form [data-limit=cooldown]").check();
    await page.locator("#channel-form [data-field=cooldown]").fill("45");
    await page.evaluate(() => emitState(structuredClone(mock.snapshot)));
    assert.equal(
      await page.locator("#channel-form [data-field=cost]").inputValue(),
      "950",
    );
    await page.locator("#channel-save").click();
    await page.waitForFunction(() => mock.saves.length === 1);
    const saved = await page.evaluate(() => mock.saves[0]);
    assert.equal(saved.settings.cost, 950);
    assert.equal(saved.settings.background, "#ee8844");
    assert.equal(saved.settings.cooldown, 45);
    assert.equal(saved.settings.input, true);
    await page.locator("#channel-form [data-field=cost]").fill("999");
    await page.evaluate(() => (mock.fail = true));
    await page.locator("#channel-save").click();
    await page.locator("#toast").filter({ hasText: "уже изменены" }).waitFor();
    assert.equal(
      await page.locator("#channel-form [data-field=cost]").inputValue(),
      "999",
    );
    assert.equal(
      await page
        .locator("#channel-save")
        .textContent()
        .then((t) => t.includes("*")),
      true,
    );
    page.once("dialog", (d) => d.dismiss());
    await page.locator("[data-tab=rewards]").click();
    assert.equal(await page.locator("#tab-channel").isVisible(), true);
    page.once("dialog", (d) => d.accept());
    await page.locator("#channel-refresh").click();
    await page.waitForFunction(() => !channelDirty && !channelBusy);
    await page.locator("#toast").waitFor({ state: "hidden" });
    for (const width of [1440, 1040, 760]) {
      await page.setViewportSize({ width, height: 1080 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Overflow at ${width}`,
      );
      await page.screenshot({
        path: path.join(root, "test-results", `channel-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.screenshot({
      path: path.join(root, "docs/screenshots/channel-rewards.png"),
      fullPage: true,
    });
    await page.locator("[data-tab=rewards]").click();
    assert.equal(
      await page.locator("#editor [data-field=cost]").inputValue(),
      "950",
    );
    await page.locator("[data-tab=channel]").click();
    await page.evaluate(() => {
      mock.snapshot.auth = { user: null, status: "signed-out" };
      mock.snapshot.authClientId = "";
      emitState(structuredClone(mock.snapshot));
    });
    assert.equal(await page.locator("#channel-list tr").count(), 0);
    assert.equal(await page.locator("#channel-form").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        allRewards: true,
        foreignReadOnly: true,
        colors: true,
        settingsSaved: true,
        dirtyStatePreserved: true,
        accountCleared: true,
        responsiveWidths: [1440, 1040, 760],
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
