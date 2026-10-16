const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { randomBytes, randomUUID } = require("node:crypto");
const { normalizeReward } = require("./model.cjs");
class Store {
  constructor(root) {
    this.root = root;
    fs.mkdirSync(path.join(root, "media"), { recursive: true });
    this.db = new DatabaseSync(path.join(root, "rewards.sqlite"));
    if (this.db.prepare("PRAGMA user_version").get().user_version > 1)
      throw Error("Обновите Reward Desk: база новее приложения");
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rewards(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, reward_id TEXT NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY, stamp INTEGER NOT NULL, message TEXT NOT NULL);
      PRAGMA user_version=1;`);
    if (!this.meta("overlayToken"))
      this.setMeta("overlayToken", randomBytes(32).toString("hex"));
    for (const j of this.jobs())
      if (j.state === "playing")
        this.putJob({
          ...j,
          state: "attention",
          detail: "Приложение перезапустилось во время воспроизведения",
        });
  }
  meta(key, fallback = null) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key=?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  setMeta(key, value) {
    this.db
      .prepare("INSERT OR REPLACE INTO meta VALUES(?,?)")
      .run(key, JSON.stringify(value));
  }
  all(table) {
    return this.db
      .prepare(`SELECT body FROM ${table}`)
      .all()
      .map((r) => JSON.parse(r.body));
  }
  rewards() {
    return this.all("rewards");
  }
  reward(id) {
    return this.rewards().find((r) => r.id === id);
  }
  putReward(r) {
    this.db
      .prepare("INSERT OR REPLACE INTO rewards VALUES(?,?)")
      .run(r.id, JSON.stringify(r));
    return r;
  }
  saveReward(value) {
    const r = normalizeReward(value, this.reward(value.id));
    for (const item of r.items) {
      const m = this.media(item.id);
      if (!m || m.kind !== r.kind)
        throw Error("Файл не подходит для типа награды");
    }
    r.createdAt ||= Date.now();
    r.updatedAt = Date.now();
    return this.putReward(r);
  }
  deleteReward(id) {
    this.db.prepare("DELETE FROM rewards WHERE id=?").run(id);
  }
  media(id) {
    const row = this.db.prepare("SELECT body FROM media WHERE id=?").get(id);
    return row && JSON.parse(row.body);
  }
  putMedia(m) {
    this.db
      .prepare("INSERT OR REPLACE INTO media VALUES(?,?)")
      .run(m.id, JSON.stringify(m));
    return m;
  }
  mediaPath(id) {
    const m = this.media(id);
    if (!m) throw Error("Файл не найден");
    return path.join(this.root, "media", m.id + m.ext);
  }
  jobs() {
    return this.db
      .prepare("SELECT body FROM jobs ORDER BY created, rowid")
      .all()
      .map((r) => JSON.parse(r.body));
  }
  job(id) {
    const row = this.db.prepare("SELECT body FROM jobs WHERE id=?").get(id);
    return row && JSON.parse(row.body);
  }
  putJob(j) {
    this.db
      .prepare("INSERT OR REPLACE INTO jobs VALUES(?,?,?,?,?)")
      .run(j.id, j.rewardId, j.state, JSON.stringify(j), j.createdAt);
    return j;
  }
  insertJob(j) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,?)")
        .run(j.id, j.rewardId, j.state, JSON.stringify(j), j.createdAt)
        .changes > 0
    );
  }
  log(message) {
    this.db
      .prepare("INSERT INTO log(stamp,message) VALUES(?,?)")
      .run(Date.now(), String(message).slice(0, 1000));
    this.db.exec(
      "DELETE FROM log WHERE id NOT IN (SELECT id FROM log ORDER BY id DESC LIMIT 2000)",
    );
  }
  logs() {
    return this.db
      .prepare("SELECT * FROM log ORDER BY id DESC LIMIT 200")
      .all();
  }
  close() {
    this.db.close();
  }
}
const TYPES = {
  ".mp3": ["audio", "audio/mpeg"],
  ".wav": ["audio", "audio/wav"],
  ".ogg": ["audio", "audio/ogg"],
  ".m4a": ["audio", "audio/mp4"],
  ".flac": ["audio", "audio/flac"],
  ".mp4": ["video", "video/mp4"],
  ".webm": ["video", "video/webm"],
};
function importMedia(store, file, kind) {
  const ext = path.extname(file).toLowerCase(),
    type = TYPES[ext],
    stat = fs.statSync(file);
  if (!type || type[0] !== kind) throw Error("Неподдерживаемый формат файла");
  if (!stat.isFile() || !stat.size || stat.size > 512 * 1024 * 1024)
    throw Error("Файл должен быть от 1 байта до 512 МБ");
  const m = {
    id: randomUUID(),
    name: path.basename(file),
    ext,
    kind,
    mime: type[1],
    size: stat.size,
  };
  const dest = path.join(store.root, "media", m.id + ext),
    temp = dest + ".tmp";
  fs.copyFileSync(file, temp, fs.constants.COPYFILE_EXCL);
  fs.renameSync(temp, dest);
  return store.putMedia(m);
}
module.exports = { Store, importMedia, TYPES };
