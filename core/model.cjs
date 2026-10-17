const { randomInt, randomUUID } = require("node:crypto");
function number(value, min, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max)
    throw Error(`${label}: от ${min} до ${max}`);
  return n;
}
function integer(value, min, max, label) {
  const n = number(value, min, max, label);
  if (!Number.isSafeInteger(n)) throw Error(`${label}: целое число`);
  return n;
}
function text(value, max, label, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw Error(`${label}: ${required ? "1–" : "до "}${max} символов`);
  return value.trim();
}
function color(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw Error("Неверный цвет");
  return value;
}
function initialReward(kind = "audio") {
  return {
    id: randomUUID(),
    kind,
    title: kind === "video" ? "Видео-награда" : "Звуковая награда",
    prompt: "",
    cost: 100,
    enabled: true,
    paused: false,
    input: false,
    background: "#239d89",
    streamLimit: 0,
    userLimit: 0,
    cooldown: 0,
    skipQueue: false,
    items: [],
    video: {
      mode: "fixed",
      x: 660,
      y: 370,
      width: 600,
      height: 340,
      border: 4,
      borderStyle: "solid",
      color: "#ffffff",
      radius: 16,
      angle: 0,
    },
    remoteId: "",
    account: "",
    clientId: "",
    sync: "draft",
  };
}
function normalizeSettings(input) {
  const r = {
    title: text(input.title, 45, "Название", true),
    prompt: text(input.prompt || "", 200, "Описание"),
    cost: integer(input.cost, 1, 1000000000, "Стоимость"),
    background: color(input.background),
    streamLimit: integer(input.streamLimit, 0, 1000000000, "Лимит за эфир"),
    userLimit: integer(input.userLimit, 0, 1000000000, "Лимит на зрителя"),
    cooldown: integer(input.cooldown, 0, 604800, "Перезарядка"),
  };
  for (const key of ["enabled", "paused", "input", "skipQueue"]) {
    if (typeof input[key] !== "boolean")
      throw Error("Неверный переключатель: " + key);
    r[key] = input[key];
  }
  return r;
}
function fromTwitch(r) {
  return normalizeSettings({
    title: r.title,
    prompt: r.prompt,
    cost: r.cost,
    background: r.background_color,
    enabled: r.is_enabled,
    paused: r.is_paused,
    input: r.is_user_input_required,
    skipQueue: r.should_redemptions_skip_request_queue,
    streamLimit: r.max_per_stream_setting?.is_enabled
      ? r.max_per_stream_setting.max_per_stream
      : 0,
    userLimit: r.max_per_user_per_stream_setting?.is_enabled
      ? r.max_per_user_per_stream_setting.max_per_user_per_stream
      : 0,
    cooldown: r.global_cooldown_setting?.is_enabled
      ? r.global_cooldown_setting.global_cooldown_seconds
      : 0,
  });
}
function normalizeReward(input, prior) {
  if (!input || !["audio", "video"].includes(input.kind))
    throw Error("Выберите звук или видео");
  const r = { ...initialReward(input.kind), ...normalizeSettings(input) },
    v = input.video || r.video;
  if (
    !["fixed", "random"].includes(v.mode) ||
    !["solid", "dashed", "dotted", "double", "none"].includes(v.borderStyle)
  )
    throw Error("Неверный стиль видео");
  r.video = {
    mode: v.mode,
    x: number(v.x, 0, 1920, "X"),
    y: number(v.y, 0, 1080, "Y"),
    width: number(v.width, 40, 1920, "Ширина"),
    height: number(v.height, 40, 1080, "Высота"),
    border: number(v.border, 0, 40, "Рамка"),
    radius: number(v.radius, 0, 200, "Скругление"),
    angle: number(v.angle, 0, 45, "Наклон"),
    color: color(v.color),
    borderStyle: v.borderStyle,
  };
  r.video.x = Math.min(r.video.x, 1920 - r.video.width);
  r.video.y = Math.min(r.video.y, 1080 - r.video.height);
  if (!Array.isArray(input.items) || input.items.length > 200)
    throw Error("Не больше 200 файлов в награде");
  const seen = new Set();
  r.items = input.items.map((item) => {
    if (typeof item.id !== "string" || seen.has(item.id))
      throw Error("Повтор файла");
    seen.add(item.id);
    return {
      id: item.id,
      volume: number(item.volume, 0, 100, "Громкость"),
      weight: integer(item.weight, 0, 10000, "Вес"),
    };
  });
  if (prior)
    for (const key of [
      "id",
      "remoteId",
      "account",
      "clientId",
      "sync",
      "createdAt",
    ])
      r[key] = prior[key];
  return r;
}
function twitchFields(r, create = false) {
  const fields = {
    title: r.title,
    prompt: r.prompt,
    cost: r.cost,
    background_color: r.background,
    is_enabled: r.enabled,
    is_user_input_required: r.input,
    is_max_per_stream_enabled: r.streamLimit > 0,
    max_per_stream: r.streamLimit || 1,
    is_max_per_user_per_stream_enabled: r.userLimit > 0,
    max_per_user_per_stream: r.userLimit || 1,
    is_global_cooldown_enabled: r.cooldown > 0,
    global_cooldown_seconds: r.cooldown || 1,
    should_redemptions_skip_request_queue: r.skipQueue,
  };
  if (!create) fields.is_paused = r.paused;
  return fields;
}
function choose(items, rng = randomInt) {
  const total = items.reduce((n, i) => n + i.weight, 0);
  if (!total) throw Error("Добавьте файл с весом больше нуля");
  let n = rng(total);
  for (const item of items) {
    n -= item.weight;
    if (n < 0) return item;
  }
  throw Error("Некорректный генератор случайных чисел");
}
module.exports = {
  initialReward,
  normalizeReward,
  normalizeSettings,
  fromTwitch,
  twitchFields,
  choose,
  integer,
};
