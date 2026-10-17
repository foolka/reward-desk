const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  initialReward,
  normalizeReward,
  normalizeCaption,
  normalizeDuration,
} = require("../core/model.cjs");
const {
  defaults,
  durationDefaults,
  formatDuration,
} = require("../overlay/caption.js");
test("legacy video has no text and duration stays opt-in", () => {
  const r = initialReward("video");
  delete r.video.caption;
  delete r.video.duration;
  const saved = normalizeReward(r);
  assert.deepEqual(saved.video.caption, defaults);
  assert.deepEqual(saved.video.duration, durationDefaults);
});
test("caption and duration styles validate separately and survive settings round trips", () => {
  const r = initialReward("video");
  r.video.caption = {
    ...defaults,
    text: "Текст\nна видео",
    x: -30,
    y: -100,
    size: 64,
    color: "#fedcba",
    font: "Impact",
  };
  r.video.duration = {
    ...durationDefaults,
    enabled: true,
    color: "#123456",
    size: 28,
  };
  assert.deepEqual(normalizeReward(r).video, r.video);
  for (const patch of [
    { text: "a".repeat(301) },
    { size: 0 },
    { color: "red" },
    { font: "Arial; background:url(test)" },
    { x: Infinity },
    { y: -1081 },
  ])
    assert.throws(() => normalizeCaption({ ...defaults, ...patch }));
  assert.throws(() =>
    normalizeDuration({ ...durationDefaults, enabled: "true" }),
  );
});
test("duration uses metadata minutes and seconds, not elapsed or viewer text", () => {
  assert.equal(formatDuration(24.9), "0:24");
  assert.equal(formatDuration(60), "1:00");
  assert.equal(formatDuration(600), "10:00");
  assert.equal(formatDuration(Infinity), "");
  assert.equal(formatDuration(NaN), "");
});
