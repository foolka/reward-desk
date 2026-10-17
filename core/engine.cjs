const { randomUUID } = require("node:crypto");
const { choose, chooseCycle } = require("./model.cjs");
const { forItem } = require("../overlay/caption.js");
const TERMINAL = ["done", "refunded", "failed", "external"];
class Engine {
  constructor(store, changed = () => {}, rng) {
    this.store = store;
    this.changed = changed;
    this.rng = rng;
  }
  enqueue(reward, event = null, itemId = null) {
    const id = event
      ? `${event.source === "chat" ? "chat:" : ""}${event.account}:${event.id}`
      : `test:${randomUUID()}`;
    const job = this.store.transaction(() =>
      this.createJob(id, reward, event, itemId),
    );
    this.changed();
    return job;
  }
  createJob(id, reward, event, itemId) {
    if (this.store.job(id)) return this.store.job(id);
    let selected,
      cycle,
      detail = "";
    const cycleKey =
      "roulette:" +
      JSON.stringify([
        reward.account || reward.chatAccount || event?.account || "",
        reward.clientId || reward.chatClientId || "",
        reward.id,
      ]);
    try {
      if (itemId) selected = reward.items.find((i) => i.id === itemId);
      else if (reward.allowRepeats === true) {
        selected = choose(reward.items, this.rng);
        cycle = { used: [], last: selected.id };
      } else {
        ({ selected, cycle } = chooseCycle(
          reward.items,
          this.store.meta(cycleKey, {}),
          this.rng,
        ));
      }
      if (!selected || !this.store.media(selected.id))
        throw Error("Медиа не найдено");
    } catch (e) {
      detail = e.message;
    }
    const pending = this.store
      .jobs()
      .filter((j) => !TERMINAL.includes(j.state)).length;
    if (pending >= 500) detail = "Очередь заполнена";
    const job = {
      id,
      rewardId: reward.id,
      rewardTitle: reward.title,
      account: event?.account || "",
      clientId: reward.clientId || reward.chatClientId,
      remoteId: reward.remoteId,
      redemptionId: event?.source === "chat" ? "" : event?.id || "",
      source: event?.source === "chat" ? "chat" : event ? "redemption" : "test",
      command: event?.source === "chat" ? event.command : "",
      userId: event?.userId || "",
      user: event?.user || "Тест",
      createdAt: Date.now(),
      state: detail
        ? event?.status === "unfulfilled"
          ? "settling"
          : "failed"
        : "queued",
      desired: detail ? "CANCELED" : "",
      refundable:
        !!event && event.source !== "chat" && event.status === "unfulfilled",
      detail,
      item: selected ? { ...selected, ...this.store.media(selected.id) } : null,
      video: structuredClone(forItem(reward.video, selected)),
      kind: reward.kind,
    };
    // Reserve the draw and queue entry together; retries reuse the stored item.
    if (this.store.insertJob(job) && !detail && cycle)
      this.store.setMeta(cycleKey, cycle);
    return job;
  }
  next(account) {
    return this.store
      .jobs()
      .find(
        (j) => j.state === "queued" && (!j.account || j.account === account),
      );
  }
  playing() {
    return this.store.jobs().find((j) => j.state === "playing");
  }
  start(job, client) {
    if (this.playing() || this.store.job(job.id)?.state !== "queued")
      return null;
    const j = this.store.putJob({
      ...job,
      state: "playing",
      client,
      startedAt: Date.now(),
    });
    this.changed();
    return j;
  }
  finish(id, ok, detail = "") {
    const j = this.store.job(id);
    if (!j || j.state !== "playing") return;
    j.state = j.refundable ? "settling" : ok ? "done" : "failed";
    j.desired = ok ? "FULFILLED" : "CANCELED";
    j.detail = detail;
    j.finishedAt = Date.now();
    this.store.putJob(j);
    this.changed();
  }
  interrupt(id, detail) {
    const j = this.store.job(id);
    if (!j || j.state !== "playing") return;
    this.store.putJob({ ...j, state: "attention", detail });
    this.changed();
  }
  retry(id) {
    const j = this.store.job(id);
    if (!j || j.state !== "attention")
      throw Error("Повтор доступен только для прерванного воспроизведения");
    this.store.putJob({ ...j, state: "queued", detail: "", client: "" });
    this.changed();
  }
  cancel(id) {
    const j = this.store.job(id);
    if (!j || !["queued", "attention"].includes(j.state))
      throw Error("Эту запись нельзя отменить");
    this.store.putJob({
      ...j,
      state: j.refundable ? "settling" : "failed",
      desired: "CANCELED",
      detail: "Отменено вручную",
    });
    this.changed();
  }
  external(account, id, status) {
    const j = this.store.job(`${account}:${id}`);
    if (!j || TERMINAL.includes(j.state) || status === "unfulfilled") return;
    if (j.state === "settling" && j.desired.toLowerCase() === status)
      j.state = status === "fulfilled" ? "done" : "refunded";
    else {
      j.state = "external";
      j.detail = "Статус изменён в Twitch: " + status;
    }
    j.refundable = false;
    this.store.putJob(j);
    this.changed();
  }
}
module.exports = { Engine, TERMINAL };
