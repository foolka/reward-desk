const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) => `<i data-lucide="${name}"></i>`;
const icons = () => lucide.createIcons();
let state,
  selected = "",
  draft,
  dirty = false,
  toastTimer,
  saving = false;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
async function command(name, arg) {
  try {
    const result = await desk.command(name, arg);
    if (result?.rewards) accept(result);
    return result;
  } catch (e) {
    toast(
      e.message.replace(/^Error invoking remote method 'command': Error: /, ""),
    );
    throw e;
  }
}
function act(el, fn) {
  if (el)
    el.addEventListener("click", () =>
      Promise.resolve()
        .then(fn)
        .catch(() => {}),
    );
}
function accept(value) {
  state = value;
  renderList();
  renderStatus();
  renderJobs();
  renderSettings();
  if (selected && !dirty && !saving) {
    draft = structuredClone(state.rewards.find((r) => r.id === selected));
    if (!draft) {
      selected = "";
      renderEditor();
    }
  }
}
function renderList() {
  $("#reward-count").textContent = state.rewards.length;
  const term = $("#search").value.toLowerCase();
  $("#reward-list").innerHTML = state.rewards
    .filter((r) => r.title.toLowerCase().includes(term))
    .map(
      (r) =>
        `<button class="reward-item ${r.id === selected ? "active" : ""}" data-id="${r.id}">${icon(r.kind === "video" ? "film" : "audio-lines")}<div><strong>${esc(r.title)}</strong><small>${r.cost.toLocaleString("ru")} баллов · ${r.items.length} файлов · ${r.remoteId ? "Twitch" : "Черновик"}</small></div></button>`,
    )
    .join("");
  $$(".reward-item").forEach((el) => act(el, () => select(el.dataset.id)));
  icons();
}
function select(id) {
  if (
    dirty &&
    !confirm("Есть несохранённые изменения. Перейти без сохранения?")
  )
    return;
  selected = id;
  dirty = false;
  draft = structuredClone(state.rewards.find((r) => r.id === id));
  renderEditor();
  renderList();
}
function num(key, label, min, max, step = 1) {
  return `<label>${label}<input data-field="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(draft[key])}"></label>`;
}
function vnum(key, label, min, max) {
  return `<label>${label}<input data-video="${key}" type="number" min="${min}" max="${max}" value="${esc(draft.video[key])}"></label>`;
}
function check(key, label) {
  return `<label class="check"><input data-field="${key}" type="checkbox" ${draft[key] ? "checked" : ""}>${label}</label>`;
}
function limit(key, label, max) {
  return `<label>${label}<div class="limit-line"><input type="checkbox" data-limit="${key}" ${draft[key] ? "checked" : ""} aria-label="Включить ${label}"><input data-field="${key}" type="number" min="1" max="${max}" value="${draft[key] || 1}" ${draft[key] ? "" : "disabled"} aria-label="${label}"></div></label>`;
}
function renderEditor() {
  if (!draft) {
    $("#editor").innerHTML =
      `<div class="empty">${icon("gift")}<h2>Выберите или создайте награду</h2></div>`;
    icons();
    return;
  }
  const video = draft.kind === "video";
  $("#editor").innerHTML =
    `<div class="editor-head"><div class="title"><h2>${esc(draft.title)}</h2><small>${draft.remoteId ? "Связана с Twitch" : "Локальный черновик"}${draft.sync === "pending" ? " · изменения не отправлены" : ""}</small></div><div class="button-row"><button id="test-reward">${icon("play")}Тест</button><button id="remove-reward" class="danger" title="Удалить награду">${icon("trash-2")}</button></div></div>
  <div class="form-grid"><label>Название<input data-field="title" maxlength="45" value="${esc(draft.title)}"></label>${num("cost", "Баллы", 1, 1000000000)}<label>Цвет<input data-field="background" type="color" value="${draft.background}"></label><label class="wide">Описание<textarea data-field="prompt" maxlength="200">${esc(draft.prompt)}</textarea></label></div>
  <div class="switches">${check("enabled", "Доступна в Twitch")}${check("paused", "На паузе")}${check("input", "Сообщение зрителя")}</div>
  <div class="limits">${limit("streamLimit", "Лимит за эфир", 1000000000)}${limit("userLimit", "На одного зрителя", 1000000000)}${limit("cooldown", "Перезарядка, сек.", 604800)}</div>
  <div class="switches">${check("skipQueue", "Сразу завершать покупку в Twitch")}</div><div id="skip-warning" class="notice" ${draft.skipQueue ? "" : "hidden"}>При мгновенном завершении Twitch не позволяет вернуть баллы. Покупки во время отключения приложения могут быть пропущены.</div>
  <section class="editor-section"><div class="section-head"><h3>${video ? "Видео" : "Звуки"} <span class="muted" id="media-count"></span></h3><span class="muted">${draft.items.length > 1 ? "Рулетка" : "Один файл"}</span></div><div id="media-list" class="media-list"></div><div id="drop-zone" class="drop-zone"><button id="add-files">${icon("upload")}Добавить файлы</button><span class="formats">${video ? "MP4 · WebM" : "MP3 · WAV · OGG · M4A · FLAC"}</span></div></section>
  ${video ? `<section class="editor-section"><div class="section-head"><h3>Размещение видео</h3><select id="position-mode" aria-label="Размещение" style="width:190px"><option value="fixed">Фиксированная область</option><option value="random">Случайное место</option></select></div><div class="preview-layout"><div><div id="stage" class="stage"><div id="placement" class="placement">${icon("move")}</div></div><div class="stage-caption"><span>1920 × 1080</span><span id="coordinates"></span></div></div><div class="video-controls">${vnum("width", "Макс. ширина", 40, 1920)}${vnum("height", "Макс. высота", 40, 1080)}${vnum("x", "X", 0, 1920)}${vnum("y", "Y", 0, 1080)}${vnum("border", "Толщина рамки", 0, 40)}<label>Стиль рамки<select id="border-style"><option value="solid">Сплошная</option><option value="dashed">Пунктир</option><option value="dotted">Точки</option><option value="double">Двойная</option><option value="none">Без рамки</option></select></label>${vnum("radius", "Скругление", 0, 200)}<label>Цвет рамки<input type="color" id="border-color" value="${draft.video.color}"></label><label class="check wide"><input type="checkbox" id="tilt" ${draft.video.angle ? "checked" : ""}>Случайный наклон</label><label class="wide">Максимальный угол, ±°<input id="angle" type="range" min="0" max="45" value="${draft.video.angle}"><output id="angle-value">${draft.video.angle}°</output></label></div></div></section>` : ""}
  <div class="save-footer"><button id="save" class="primary">${icon("save")}Сохранить</button><button id="publish">${icon("cloud-upload")}${draft.remoteId ? "Синхронизировать" : "Создать в Twitch"}</button></div>`;
  $$("[data-field]").forEach((el) =>
    el.addEventListener("input", () => {
      draft[el.dataset.field] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      markDirty();
      if (el.dataset.field === "skipQueue")
        $("#skip-warning").hidden = !el.checked;
    }),
  );
  $$("[data-limit]").forEach((el) =>
    el.addEventListener("change", () => {
      const field = $(`[data-field="${el.dataset.limit}"]`);
      field.disabled = !el.checked;
      draft[el.dataset.limit] = el.checked ? Number(field.value) : 0;
      markDirty();
    }),
  );
  act($("#save"), save);
  act($("#publish"), async () => {
    await save();
    await command("publish", selected);
    select(selected);
    toast("Награда синхронизирована");
  });
  act($("#remove-reward"), async () => {
    await command("remove", selected);
    if (!state.rewards.some((r) => r.id === selected)) {
      selected = "";
      draft = null;
      dirty = false;
      renderEditor();
    }
  });
  act($("#test-reward"), async () => {
    await save();
    await command("test", { id: selected });
    toast("Добавлено в очередь OBS");
  });
  act($("#add-files"), () => addFiles());
  const drop = $("#drop-zone");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    void addFiles([...e.dataTransfer.files].map((f) => desk.filePath(f))).catch(
      () => {},
    );
  });
  if (video) bindVideo();
  renderMedia();
  icons();
}
function markDirty() {
  dirty = true;
  if ($("#save")) $("#save").innerHTML = icon("save") + "Сохранить *";
  icons();
}
async function save() {
  if (!draft || saving) return;
  saving = true;
  try {
    const result = await command("save", draft);
    dirty = false;
    draft = structuredClone(result.rewards.find((r) => r.id === selected));
    $(".editor-head h2").textContent = draft.title;
    $("#save").innerHTML = icon("save") + "Сохранить";
    icons();
  } finally {
    saving = false;
  }
}
async function addFiles(paths) {
  const added = await command("import", { id: selected, paths });
  for (const m of added) draft.items.push({ id: m.id, volume: 80, weight: 1 });
  markDirty();
  renderMedia();
  updatePlacement();
}
function renderMedia() {
  $("#media-count").textContent = draft.items.length
    ? "· " + draft.items.length
    : "";
  $("#media-list").innerHTML = draft.items
    .map((i) => {
      const m = state.media.find((m) => m.id === i.id);
      return `<div class="media-row" data-item="${i.id}"><div class="media-name">${esc(m?.name || "Файл отсутствует")}<small>${((m?.size || 0) / 1024 / 1024).toFixed(1)} МБ</small></div><label>Громкость <span class="volume-value">${i.volume}%</span><input data-volume type="range" min="0" max="100" value="${i.volume}" aria-label="Громкость ${esc(m?.name)}"></label><label>Вес<input data-weight type="number" min="0" max="10000" step="1" value="${i.weight}"></label><span class="chance"></span><button data-play title="Тест файла в OBS">${icon("play")}</button><button data-remove class="danger" title="Убрать файл">${icon("x")}</button></div>`;
    })
    .join("");
  $$(".media-row").forEach((row) => {
    const i = draft.items.find((i) => i.id === row.dataset.item);
    row.querySelector("[data-volume]").addEventListener("input", (e) => {
      i.volume = Number(e.target.value);
      row.querySelector(".volume-value").textContent = i.volume + "%";
      markDirty();
    });
    row.querySelector("[data-weight]").addEventListener("input", (e) => {
      i.weight = Number(e.target.value);
      markDirty();
      percentages();
    });
    act(row.querySelector("[data-play]"), async () => {
      await save();
      await command("test", { id: selected, itemId: i.id });
      toast("Файл добавлен в очередь OBS");
    });
    act(row.querySelector("[data-remove]"), () => {
      draft.items = draft.items.filter((x) => x.id !== i.id);
      markDirty();
      renderMedia();
      updatePlacement();
    });
  });
  percentages();
  icons();
}
function percentages() {
  const total = draft.items.reduce((n, i) => n + i.weight, 0);
  $$(".media-row").forEach((row) => {
    const i = draft.items.find((i) => i.id === row.dataset.item);
    row.querySelector(".chance").textContent =
      (total > 0 ? (i.weight / total) * 100 : 0).toFixed(1) + "%";
  });
}
function bindVideo() {
  $("#position-mode").value = draft.video.mode;
  $("#border-style").value = draft.video.borderStyle;
  $$("[data-video]").forEach((el) =>
    el.addEventListener("input", () => {
      draft.video[el.dataset.video] = Number(el.value);
      constrain();
      markDirty();
      updatePlacement();
    }),
  );
  $("#position-mode").addEventListener("change", (e) => {
    draft.video.mode = e.target.value;
    markDirty();
    updatePlacement();
  });
  $("#border-style").addEventListener("change", (e) => {
    draft.video.borderStyle = e.target.value;
    markDirty();
    updatePlacement();
  });
  $("#border-color").addEventListener("input", (e) => {
    draft.video.color = e.target.value;
    markDirty();
    updatePlacement();
  });
  $("#tilt").addEventListener("change", (e) => {
    draft.video.angle = e.target.checked ? 12 : 0;
    $("#angle").value = draft.video.angle;
    $("#angle-value").value = draft.video.angle + "°";
    markDirty();
  });
  $("#angle").addEventListener("input", (e) => {
    draft.video.angle = Number(e.target.value);
    $("#tilt").checked = draft.video.angle > 0;
    $("#angle-value").value = draft.video.angle + "°";
    markDirty();
  });
  const el = $("#placement");
  let drag;
  el.addEventListener("pointerdown", (e) => {
    if (draft.video.mode === "random") return;
    drag = { x: e.clientX, y: e.clientY, px: draft.video.x, py: draft.video.y };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const scale = $("#stage").getBoundingClientRect().width / 1920;
    draft.video.x = Math.round(drag.px + (e.clientX - drag.x) / scale);
    draft.video.y = Math.round(drag.py + (e.clientY - drag.y) / scale);
    constrain();
    updatePlacement();
    markDirty();
  });
  el.addEventListener("pointerup", () => (drag = null));
  el.addEventListener("pointercancel", () => (drag = null));
  updatePlacement();
}
function constrain() {
  const v = draft.video;
  v.x = Math.max(0, Math.min(1920 - v.width, v.x));
  v.y = Math.max(0, Math.min(1080 - v.height, v.y));
}
function updatePlacement() {
  if (!draft || draft.kind !== "video" || !$("#placement")) return;
  const v = draft.video,
    p = $("#placement"),
    scale = $("#stage").getBoundingClientRect().width / 1920;
  Object.assign(p.style, {
    left: v.x / 19.2 + "%",
    top: v.y / 10.8 + "%",
    width: v.width / 19.2 + "%",
    height: v.height / 10.8 + "%",
    border: `${v.border * scale}px ${v.borderStyle} ${v.color}`,
    borderRadius: v.radius * scale + "px",
    opacity: v.mode === "random" ? ".5" : "1",
  });
  $("#coordinates").textContent =
    `${Math.round(v.x)}, ${Math.round(v.y)} · ${v.width} × ${v.height}`;
  for (const key of ["x", "y"])
    if (document.activeElement !== $(`[data-video="${key}"]`))
      $(`[data-video="${key}"]`).value = v[key];
  const first = draft.items[0]?.id;
  if (p.dataset.media !== first) {
    p.querySelector("video")?.remove();
    if (first) {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.src = state.overlay.url + "media/" + first;
      p.prepend(video);
    }
    p.dataset.media = first || "";
  }
}
function renderStatus() {
  $("#connection-text").textContent = state.auth.user
    ? `${state.auth.user.login} · ${state.twitch}`
    : "Twitch не подключён";
  $("#connection-dot").classList.toggle("ready", state.auth.status === "ready");
  $("#pause").classList.toggle("active", state.paused);
  $("#pause").title = state.paused ? "Продолжить очередь" : "Пауза очереди";
  $("#pause").innerHTML = icon(state.paused ? "play" : "pause");
  const pending = state.jobs.filter((j) =>
    ["queued", "playing", "attention", "settling"].includes(j.state),
  ).length;
  $("#queue-count").textContent = pending;
  $("#queue-status").textContent = state.overlay.clients
    ? `OBS подключён · ${pending} в обработке`
    : "OBS не подключён";
  icons();
}
const states = {
  queued: "В очереди",
  playing: "Проигрывается",
  attention: "Требует решения",
  settling: "Подтверждение Twitch",
  done: "Готово",
  refunded: "Баллы возвращены",
  failed: "Ошибка / отмена",
  external: "Изменено в Twitch",
};
function renderJobs() {
  $("#jobs").innerHTML = state.jobs
    .map(
      (j) =>
        `<tr><td>${new Date(j.createdAt).toLocaleString("ru")}</td><td>${esc(j.user)}<small>${esc(j.rewardTitle)}</small></td><td>${esc(j.item?.name || "")}</td><td><span class="status ${j.state}">${states[j.state] || j.state}</span>${j.detail ? `<small>${esc(j.detail)}</small>` : ""}</td><td><div class="button-row">${j.state === "attention" ? `<button data-retry="${esc(j.id)}" title="Повторить тот же файл">${icon("rotate-ccw")}</button>` : ""}${["attention", "queued"].includes(j.state) ? `<button data-cancel="${esc(j.id)}" title="${j.refundable ? "Отменить и вернуть баллы" : "Отменить"}">${icon("x")}</button>` : ""}</div></td></tr>`,
    )
    .join("");
  $$("[data-retry]").forEach((el) =>
    act(el, () => command("retry", el.dataset.retry)),
  );
  $$("[data-cancel]").forEach((el) =>
    act(el, () => command("cancel", el.dataset.cancel)),
  );
  icons();
}
function renderSettings() {
  $("#auth-state").textContent =
    state.auth.message ||
    (state.auth.user
      ? "Выполнен вход: " + state.auth.user.login
      : "Нет аккаунта");
  if (document.activeElement !== $("#client-id"))
    $("#client-id").value = state.clientId;
  $("#overlay-url").value = state.overlay.url;
  $("#obs-status").textContent = `Подключений: ${state.overlay.clients}`;
  $("#overlay-error").textContent = state.overlay.error;
  $("#overlay-error").hidden = !state.overlay.error;
  if (document.activeElement !== $("#port"))
    $("#port").value = state.overlay.port;
  $("#login-pending").hidden = !state.auth.pending;
  $("#login-code").textContent = state.auth.pending?.code || "";
  $("#logout").disabled = !state.auth.user;
  $("#login").disabled = !!state.auth.pending;
  $("#logs").textContent =
    state.logs
      .map((l) => new Date(l.stamp).toLocaleString("ru") + "  " + l.message)
      .join("\n") || "Событий пока нет";
}
$$("[data-tab]").forEach((el) =>
  act(el, () => {
    $$("[data-tab]").forEach((b) => b.classList.toggle("active", b === el));
    for (const name of ["rewards", "queue", "settings"])
      $("#tab-" + name).hidden = name !== el.dataset.tab;
    updatePlacement();
  }),
);
for (const kind of ["audio", "video"])
  act($("#new-" + kind), async () => {
    const result = await command("new", kind);
    select(result.rewards.at(-1).id);
  });
act($("#first-create"), async () => {
  const result = await command("new", "audio");
  select(result.rewards.at(-1).id);
});
$("#search").addEventListener("input", renderList);
act($("#pause"), () => command("pause", !state.paused));
act($("#stop"), () => {
  if (
    confirm(
      "Остановить воспроизведение? Незавершённая покупка будет отменена с возвратом баллов.",
    )
  )
    return command("stop");
});
for (const name of [
  "copy-url",
  "preview",
  "reconnect",
  "folder",
  "logout",
  "cancel-login",
  "copy-code",
])
  act($("#" + name), () => command(name));
act($("#login"), () => command("login", $("#client-id").value));
act($("#save-port"), () => command("port", Number($("#port").value)));
addEventListener("resize", updatePlacement);
desk.onState(accept);
command("state")
  .then(() => {
    if (state.rewards.length) select(state.rewards[0].id);
  })
  .catch(() => {});
icons();
