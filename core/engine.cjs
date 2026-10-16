const { randomUUID } = require("node:crypto");
const { choose } = require("./model.cjs");
const TERMINAL = ["done", "refunded", "failed", "external"];
class Engine {
  constructor(store, changed = () => {}) {
    this.store = store;
    this.changed = changed;
  }
  enqueue(reward, event = null, itemId = null) {
    const id = event ? `${event.account}:${event.id}` : `test:${randomUUID()}`;
    if (this.store.job(id)) return this.store.job(id);
    let selected,
      detail = "";
    try {
      selected = itemId
        ? reward.items.find((i) => i.id === itemId)
        : choose(reward.items);
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
      clientId: reward.clientId,
      remoteId: reward.remoteId,
      redemptionId: event?.id || "",
      user: event?.user || "Тест",
      createdAt: Date.now(),
      state: detail
        ? event?.status === "unfulfilled"
          ? "settling"
          : "failed"
        : "queued",
      desired: detail ? "CANCELED" : "",
      refundable: !!event && event.status === "unfulfilled",
      detail,
      item: selected ? { ...selected, ...this.store.media(selected.id) } : null,
      video: { ...reward.video },
      kind: reward.kind,
    };
    this.store.insertJob(job);
    this.changed();
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
