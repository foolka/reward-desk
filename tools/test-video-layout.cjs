const { _electron: electron, chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Store, importMedia } = require("../core/store.cjs");
const { initialReward } = require("../core/model.cjs");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "test-results");
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, "video-fit-"));
const seed = new Store(profile),
  rewards = [];
for (const [name, width, height] of [
  ["wide", 960, 400],
  ["portrait", 360, 640],
  ["square", 400, 400],
]) {
  const file = path.join(profile, name + ".webm");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x22cc77:s=${width}x${height}:r=20`,
      "-t",
      "3",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "100k",
      file,
    ],
    { windowsHide: true },
  );
  const media = importMedia(seed, file, "video"),
    reward = initialReward("video");
  rewards.push(
    seed.saveReward({
      ...reward,
      title: name,
      items: [{ id: media.id, weight: 1, volume: 50 }],
      video: {
        ...reward.video,
        border: 16,
        color: "#e23399",
        radius: 0,
        width: 600,
        height: 340,
        angle: 0,
      },
    }),
  );
}
seed.close();
let app, browser;
(async () => {
  const env = { ...process.env, REWARD_DESK_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv[2];
  app = await electron.launch({
    ...(packaged ? { executablePath: path.resolve(packaged) } : {}),
    args: packaged
      ? ["--test-mode", "--mute-audio"]
      : [root, "--test-mode", "--mute-audio"],
    env,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".reward-item").first().waitFor();
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const player = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  player.on("pageerror", (error) => errors.push(error.message));
  const snapshot = await page.evaluate(() => desk.command("state"));
  await player.goto(snapshot.overlay.url);
  await page.waitForFunction(
    async () => (await desk.command("state")).overlay.clients === 1,
  );
  for (const reward of rewards) {
    await page.locator(`[data-id="${reward.id}"]`).click();
    await page.waitForFunction(
      () => document.querySelector("#placement video")?.readyState >= 2,
    );
    for (const [width, height] of [
      [1440, 1000],
      [1040, 900],
      [760, 850],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setContentSize(...size),
        [width, height],
      );
      await page.waitForTimeout(100);
      await page.locator("#placement").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const v = document.querySelector("#placement video");
        return v?.readyState >= 2 && !v.seeking;
      });
      const fit = await page.locator("#placement").evaluate((frame) => {
        const video = frame.querySelector("video"),
          style = getComputedStyle(frame);
        const contentWidth =
          frame.getBoundingClientRect().width -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth);
        const contentHeight =
          frame.getBoundingClientRect().height -
          parseFloat(style.borderTopWidth) -
          parseFloat(style.borderBottomWidth);
        return {
          gap: Math.abs(
            contentWidth / (video.videoWidth / video.videoHeight) -
              contentHeight,
          ),
          outerWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
        };
      });
      assert.ok(
        fit.gap < 3,
        `${reward.title} preview letterbox at ${width}: ${fit.gap}`,
      );
      assert.ok(
        fit.outerWidth <= fit.viewport,
        `Preview page overflow at ${width}`,
      );
      assert.ok(
        await page
          .locator(".media-row")
          .evaluate((row) => row.getBoundingClientRect().height <= 52),
        "Compact media row",
      );
      await page.screenshot({
        path: path.join(out, `fit-${reward.title}-${width}.png`),
        fullPage: true,
      });
    }
    const job = await page.evaluate(
      (id) => desk.command("test", { id }),
      reward.id,
    );
    await player.locator("video.clip").waitFor();
    await player.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.3,
    );
    const gap = await player.locator("video").evaluate((video) => {
      const style = getComputedStyle(video);
      const width =
        parseFloat(style.width) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth);
      const height =
        parseFloat(style.height) -
        parseFloat(style.borderTopWidth) -
        parseFloat(style.borderBottomWidth);
      return Math.abs(width / (video.videoWidth / video.videoHeight) - height);
    });
    assert.ok(gap < 1, `${reward.title} OBS letterbox: ${gap}`);
    const picture = await player.locator("video").screenshot({
      path: path.join(out, `obs-fit-${reward.title}.png`),
      omitBackground: true,
    });
    const pixels = await app.evaluate(
      ({ nativeImage }, data) => {
        const image = nativeImage.createFromDataURL(data),
          { width, height } = image.getSize(),
          bytes = image.getBitmap();
        return [
          [width / 2, 19],
          [width / 2, height - 20],
          [19, height / 2],
          [width - 20, height / 2],
        ].map(([x, y]) => {
          const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
          return [...bytes.subarray(offset, offset + 4)];
        });
      },
      "data:image/png;base64," + picture.toString("base64"),
    );
    assert.ok(
      pixels.every(([b, g, r, a]) => g > 150 && r < 90 && b < 170 && a === 255),
      `${reward.title}: colored video pixels reach all four inner edges`,
    );
    await page.waitForFunction(
      async (id) =>
        (await desk.command("state")).jobs.some(
          (j) => j.rewardId === id && j.state === "done",
        ),
      reward.id,
    );
  }
  const checkbox = page.locator("#allow-repeats"),
    help = page.locator('.option-help[data-help="repeats"]');
  await checkbox.scrollIntoViewIfNeeded();
  assert.equal(await checkbox.isChecked(), false);
  await help.hover();
  await page.locator("#option-tooltip").waitFor();
  assert.match(
    await page.locator("#option-tooltip").textContent(),
    /сохраняется после перезапуска/,
  );
  await help.click();
  assert.equal(
    await checkbox.isChecked(),
    false,
    "Help must not toggle the option",
  );
  const tip = await page.locator("#option-tooltip").boundingBox();
  assert.ok(
    tip.x >= 0 &&
      tip.x + tip.width <=
        (await page.evaluate(() => document.documentElement.clientWidth)) &&
      tip.y >= 0 &&
      tip.y + tip.height <= 850,
  );
  await page.screenshot({ path: path.join(out, "option-help-760.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#option-tooltip").isVisible(), false);
  await checkbox.focus();
  await help.focus();
  assert.equal(await page.locator("#option-tooltip").isVisible(), true);
  assert.ok((await page.locator("#editor .option-help").count()) >= 25);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      formats: ["wide", "portrait", "square"],
      previewWidths: [1440, 1040, 760],
      obsInnerEdgePixels: true,
      compactRows: true,
      tooltipsMouseAndKeyboard: true,
    }),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    await app?.close();
  });
