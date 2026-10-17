const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { Store, importMedia } = require("../core/store.cjs");
const { initialReward } = require("../core/model.cjs");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "test-results");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "recovery-ui-"));
const file = path.join(profile, "fixture.mp4");
fs.writeFileSync(file, "test fixture");
const store = new Store(profile);
const reward = store.saveReward({
  ...initialReward("video"),
  title: "MPause - рулетка",
  items: Array.from({ length: 7 }, () => ({
    id: importMedia(store, file, "video").id,
    volume: 80,
    weight: 1,
  })),
});
const token = store.meta("overlayToken");
store.close();
let app;
const errors = [];
async function launch() {
  const packaged = process.argv[2];
  const env = { ...process.env, REWARD_DESK_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(packaged) } : {}),
    args: [...(packaged ? [] : [root]), "--test-mode", "--mute-audio"],
    env,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("[data-field=prompt]").waitFor();
  return page;
}
(async () => {
  let page = await launch();
  await page
    .locator("[data-field=prompt]")
    .fill("Локальный черновик без публикации");
  await page.locator("[data-tab=settings]").click();
  let snapshot = await page.evaluate(() => desk.command("state"));
  assert.equal(snapshot.rewards[0].prompt, "");
  assert.equal(
    snapshot.drafts[reward.id].value.prompt,
    "Локальный черновик без публикации",
  );
  await page.locator("[data-tab=rewards]").click();
  assert.equal(
    await page.locator("[data-field=prompt]").inputValue(),
    "Локальный черновик без публикации",
  );
  await page
    .locator("[data-field=prompt]")
    .fill("Сразу закрываю, без Сохранить");
  await app.close();
  app = null;
  page = await launch();
  assert.equal(
    await page.locator("[data-field=prompt]").inputValue(),
    "Сразу закрываю, без Сохранить",
  );
  assert.equal(await page.locator(".media-row").count(), 7);
  await page.locator("#save").click();
  await page.waitForFunction(
    () => !document.querySelector("#save").textContent.includes("*"),
  );
  snapshot = await page.evaluate(() => desk.command("state"));
  assert.equal(snapshot.rewards[0].prompt, "Сразу закрываю, без Сохранить");
  assert.equal(snapshot.drafts[reward.id], undefined);
  await page.locator("#reward-history").click();
  await page.locator("[data-version]").first().click();
  assert.equal(await page.locator("[data-field=prompt]").inputValue(), "");
  snapshot = await page.evaluate(() => desk.command("state"));
  assert.equal(
    snapshot.rewards[0].prompt,
    "Сразу закрываю, без Сохранить",
    "restoring a draft must not apply active settings",
  );
  await page.locator("[data-tab=settings]").click();
  await page.evaluate(() => {
    state.updates = {
      status: "available",
      enabled: true,
      installable: true,
      release: {
        version: "0.6.0",
        notes: "Проверка окна обновления\nНовые функции и исправления",
      },
      message: "Доступна версия 0.6.0",
    };
    renderUpdates();
  });
  assert.equal(await page.locator("#update-dialog").isVisible(), true);
  await page.screenshot({ path: path.join(out, "update-dialog.png") });
  await page.locator("#update-later").click();
  await page.evaluate(() => renderUpdates());
  assert.equal(
    await page.locator("#update-dialog").isVisible(),
    false,
    "later must suppress repeated popup this session",
  );
  await app.close();
  app = null;
  const verify = new Store(profile);
  assert.equal(verify.meta("overlayToken"), token);
  assert.equal(verify.reward(reward.id).items.length, 7);
  assert.equal(verify.reward(reward.id).remoteId, "");
  verify.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      sevenUnpublishedVideosPreserved: true,
      draftSurvivesExit: true,
      switchTabsPreservesDraft: true,
      historyRestoresDraftOnly: true,
      updateDialog: true,
      obsKeyUnchanged: true,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
  });
