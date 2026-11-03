const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startInTray } = require("../core/startup-mode.cjs");

test("startup mode is explicit and does not mutate arguments or preferences", () => {
  assert.equal(startInTray([]), false);
  assert.equal(startInTray([], true), true);
  assert.equal(startInTray(["--start-tray"]), true);
  assert.equal(startInTray(["--start-window"], true), false);
  const args = ["--start-tray", "--start-window"];
  assert.equal(startInTray(args, true), false);
  assert.deepEqual(args, ["--start-tray", "--start-window"]);
  assert.equal(startInTray(["--start-tray=no"]), false);
});
