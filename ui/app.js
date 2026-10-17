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
const icons = () => {
  RewardHelp.enhance();
  $$("select:not([multiple]):not([size])").forEach((select) => {
    if (select.parentElement.classList.contains("select-control")) return;
    const wrapper = document.createElement("span");
    wrapper.className = "select-control";
    if (select.style.width) {
      wrapper.style.width = select.style.width;
      select.style.width = "100%";
    }
    select.before(wrapper);
    wrapper.append(select);
    wrapper.insertAdjacentHTML(
      "beforeend",
      '<i data-lucide="chevron-down" aria-hidden="true"></i>',
    );
  });
  lucide.createIcons();
};
let state,
  selected = "",
  previewItemId = "",
  draft,
  dirty = false,
  draftTimer,
  draftRevision = 0,
  exiting = false,
  toastTimer,
  saving = false,
  previewObserver;
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
  renderUpdates();
  renderChatStatus();
  channelAccountChanged();
  if (selected && !dirty && !saving) {
    const latest = state.rewards.find((r) => r.id === selected);
    if (JSON.stringify(draft) !== JSON.stringify(latest)) {
      draft = structuredClone(latest);
      if (!draft) selected = "";
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
  if (saving) return;
  flushLocalDraft();
  selected = id;
  dirty = !!state.drafts?.[id];
  draft = structuredClone(
    state.drafts?.[id]?.value || state.rewards.find((r) => r.id === id),
  );
  renderEditor();
  renderList();
  draftStatus(dirty ? "Локальный черновик восстановлен" : "Сохранено");
}
function num(key, label, min, max, step = 1, value = draft) {
  return `<label>${label}<input data-field="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value[key])}"></label>`;
}
function vnum(key, label, min, max) {
  return `<label>${label}<input data-video="${key}" type="number" min="${min}" max="${max}" value="${esc(draft.video[key])}"></label>`;
}
function check(key, label, value = draft) {
  return `<label class="check"><input data-field="${key}" type="checkbox" ${value[key] ? "checked" : ""}>${label}</label>`;
}
function limit(key, label, max, value = draft) {
  return `<label>${label}<div class="limit-line"><input type="checkbox" data-limit="${key}" ${value[key] ? "checked" : ""} aria-label="Включить ${label}"><input data-field="${key}" type="number" min="1" max="${max}" value="${esc(value[key] || 1)}" ${value[key] ? "" : "disabled"} aria-label="${label}"></div></label>`;
}
function settingsMarkup(value) {
  return `<div class="form-grid"><label>Название<input data-field="title" maxlength="45" value="${esc(value.title)}"></label>${num("cost", "Баллы", 1, 1000000000, 1, value)}<label>Цвет<input data-field="background" type="color" value="${esc(value.background)}"></label><label class="wide">Описание<textarea data-field="prompt" maxlength="200">${esc(value.prompt)}</textarea></label></div>
  <div class="switches">${check("enabled", "Доступна в Twitch", value)}${check("paused", "На паузе", value)}${check("input", "Сообщение зрителя", value)}</div>
  <div class="limits">${limit("streamLimit", "Лимит за эфир", 1000000000, value)}${limit("userLimit", "На одного зрителя", 1000000000, value)}${limit("cooldown", "Перезарядка, сек.", 604800, value)}</div>
  <div class="switches">${check("skipQueue", "Сразу завершать покупку в Twitch", value)}</div><div data-skip-warning class="notice" ${value.skipQueue ? "" : "hidden"}>При мгновенном завершении Twitch не позволяет вернуть баллы. Покупки во время отключения приложения могут быть пропущены.</div>`;
}
function bindSettings(root, getValue, changed) {
  root.querySelectorAll("[data-field]").forEach((el) =>
    el.addEventListener("input", () => {
      const value = getValue();
      value[el.dataset.field] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      if (el.dataset.field === "skipQueue")
        root.querySelector("[data-skip-warning]").hidden = !el.checked;
      changed();
    }),
  );
  root.querySelectorAll("[data-limit]").forEach((el) =>
    el.addEventListener("change", () => {
      const value = getValue();
      const field = root.querySelector(`[data-field="${el.dataset.limit}"]`);
      field.disabled = !el.checked;
      value[el.dataset.limit] = el.checked ? Number(field.value) : 0;
      changed();
    }),
  );
}
function renderEditor() {
  previewObserver?.disconnect();
  if (!draft) {
    $("#editor").innerHTML =
      `<div class="empty">${icon("gift")}<h2>Выберите или создайте награду</h2></div>`;
    icons();
    return;
  }
  const video = draft.kind === "video";
  const chat = draft.chat || {
    enabled: false,
    command: "",
    users: [],
    cooldown: 5,
  };
  $("#editor").innerHTML =
    `<div class="editor-head"><div class="title"><h2>${esc(draft.title)}</h2><small>${draft.remoteId ? "Связана с Twitch" : "Локальный черновик"}${draft.sync === "pending" ? " · изменения не отправлены" : ""}</small></div><div class="button-row"><button id="test-reward">${icon("play")}Тест</button><button id="remove-reward" class="danger" title="Удалить награду">${icon("trash-2")}</button></div></div>
  ${settingsMarkup(draft)}
  <section class="editor-section chat-section"><div class="section-head"><h3>Запуск через чат</h3><span id="chat-status" class="muted"></span></div>
  <label class="check"><input id="chat-enabled" type="checkbox" ${chat.enabled ? "checked" : ""}>Разрешить команду чата</label>
  <div class="chat-fields"><label>Команда<input id="chat-command" maxlength="33" placeholder="!video" value="${esc(chat.command)}" spellcheck="false"></label><label>Пауза, сек.<input id="chat-cooldown" type="number" min="0" max="3600" value="${chat.cooldown}"></label><label class="wide">Разрешённые Twitch-ники<textarea id="chat-users" rows="2" maxlength="5400" placeholder="nickname1, nickname2" spellcheck="false">${esc(Array.isArray(chat.users) ? chat.users.join(", ") : chat.users)}</textarea></label></div>
  <div id="chat-access" class="notice" hidden><span id="chat-access-text"></span><button id="chat-open-settings">${icon("log-in")}Подключение Twitch</button></div></section>
  <section class="editor-section"><div class="section-head"><h3>${video ? "Видео" : "Звуки"} <span class="muted" id="media-count"></span></h3><span class="muted" id="media-mode"></span></div><div class="roulette-options"><label class="check"><input id="allow-repeats" type="checkbox" ${draft.allowRepeats === true ? "checked" : ""} aria-describedby="roulette-help">Полный рандом с повторениями</label><div id="roulette-help" class="field-note"></div></div><div class="media-head" aria-hidden="true"><span>Файл</span><span>Громкость</span><span>Вес</span><span id="chance-heading"></span><span></span><span></span></div><div id="media-list" class="media-list"></div><div id="drop-zone" class="drop-zone"><button id="add-files">${icon("upload")}Добавить файлы</button><span class="formats">${video ? "MP4 · WebM" : "MP3 · WAV · OGG · M4A · FLAC"}</span></div></section>
  ${video ? `<section class="editor-section"><div class="section-head"><h3>Размещение видео</h3><select id="position-mode" aria-label="Размещение" style="width:190px"><option value="fixed">Фиксированная область</option><option value="random">Случайное место</option></select></div><div class="preview-layout"><div><div id="stage" class="stage"><div id="placement" class="placement">${icon("move")}</div></div><div class="stage-caption"><span>1920 × 1080</span><span id="coordinates"></span></div></div><div class="video-controls">${vnum("width", "Макс. ширина", 40, 1920)}${vnum("height", "Макс. высота", 40, 1080)}${vnum("x", "X", 0, 1920)}${vnum("y", "Y", 0, 1080)}${vnum("border", "Толщина рамки", 0, 40)}<label>Стиль рамки<select id="border-style"><option value="solid">Сплошная</option><option value="dashed">Пунктир</option><option value="dotted">Точки</option><option value="double">Двойная</option><option value="none">Без рамки</option></select></label>${vnum("radius", "Скругление", 0, 200)}<label>Цвет рамки<input type="color" id="border-color" value="${draft.video.color}"></label><label class="check wide"><input type="checkbox" id="tilt" ${draft.video.angle ? "checked" : ""}>Случайный наклон</label><label class="wide">Максимальный угол, ±°<input id="angle" type="range" min="0" max="45" value="${draft.video.angle}"><output id="angle-value">${draft.video.angle}°</output></label></div></div></section>` : ""}
  ${video ? captionMarkup() : ""}
  <div class="save-footer"><button id="save" class="primary">${icon("save")}Сохранить</button><button id="publish">${icon("cloud-upload")}${draft.remoteId ? "Синхронизировать" : "Создать в Twitch"}</button><button id="reward-history" title="История сохранённых версий" aria-label="История сохранённых версий">${icon("history")}</button><span id="draft-status" class="field-note" role="status"></span></div>`;
  act($("#reward-history"), showRewardHistory);
  bindSettings($("#editor"), () => draft, markDirty);
  for (const [id, key] of Object.entries({
    "chat-enabled": "enabled",
    "chat-command": "command",
    "chat-users": "users",
    "chat-cooldown": "cooldown",
  })) {
    $("#" + id).addEventListener("input", (event) => {
      draft.chat ||= { enabled: false, command: "", users: [], cooldown: 5 };
      const el = event.target;
      draft.chat[key] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      markDirty();
      renderChatStatus();
    });
  }
  act($("#chat-open-settings"), () => $("[data-tab=settings]").click());
  renderChatStatus();
  $("#allow-repeats").addEventListener("change", (event) => {
    draft.allowRepeats = event.target.checked;
    markDirty();
    percentages();
  });
  act($("#save"), save);
  act($("#publish"), async () => {
    if (draft.sync !== "creating") await save();
    await command("publish", selected);
    select(selected);
    toast("Награда синхронизирована");
  });
  act($("#remove-reward"), async () => {
    flushLocalDraft();
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
function renderChatStatus() {
  if (!$("#chat-status") || !draft) return;
  const enabled = !!draft.chat?.enabled;
  $(".chat-fields").hidden = !enabled;
  $("#chat-status").textContent = enabled
    ? state.chat?.status || "Чат не подключён"
    : "Выключено";
  for (const id of ["chat-command", "chat-users", "chat-cooldown"])
    $("#" + id).disabled = !enabled;
  const otherAccount =
    draft.chatAccount &&
    (draft.chatAccount !== state.auth.user?.id ||
      draft.chatClientId !== state.authClientId);
  $("#chat-access").hidden =
    !enabled ||
    (!!state.auth.user && !state.chat?.reauthRequired && !otherAccount);
  $("#chat-access-text").textContent = otherAccount
    ? "Команда привязана к другому аккаунту Twitch или Client ID. Войдите в исходный аккаунт."
    : state.auth.user
      ? "Для команд нужен повторный вход с разрешением на чтение чата. Награды за баллы продолжают работать."
      : "Для запуска из чата войдите в аккаунт своего канала.";
}
function markDirty() {
  dirty = true;
  draftRevision++;
  clearTimeout(draftTimer);
  draftStatus("Сохранение черновика…");
  draftTimer = setTimeout(() => {
    try {
      flushLocalDraft();
    } catch (error) {
      toast(error.message);
    }
  }, 250);
  if ($("#save")) $("#save").innerHTML = icon("save") + "Сохранить *";
  icons();
}
function draftStatus(text) {
  if ($("#draft-status")) $("#draft-status").textContent = text;
}
function flushLocalDraft() {
  clearTimeout(draftTimer);
  if (!draft || !dirty) return;
  const result = desk.stashDraft(draft);
  if (!result?.ok) {
    draftStatus("Черновик не сохранён");
    throw Error(result?.error || "Не удалось сохранить локальный черновик");
  }
  state.drafts ||= {};
  state.drafts[draft.id] = {
    value: structuredClone(draft),
    savedAt: Date.now(),
  };
  draftStatus("Черновик сохранён на этом ПК");
}
window.flushLocalDraft = flushLocalDraft;
window.prepareExit = () => {
  flushLocalDraft();
  exiting = true;
};
addEventListener("beforeunload", () => {
  if (!exiting) flushLocalDraft();
});
async function showRewardHistory() {
  flushLocalDraft();
  const id = selected;
  const versions = await command("versions", id);
  const modal = $("#history-dialog");
  $("#history-list").innerHTML = versions.length
    ? versions
        .map(
          (v) =>
            `<div class="version-row"><div><strong>${esc(v.value.title)}</strong><div class="field-note">${esc(new Date(v.stamp).toLocaleString("ru"))} · ${v.value.items.length} файлов</div></div><button data-version="${v.id}" title="Открыть эту версию как черновик">${icon("rotate-ccw")}Восстановить</button></div>`,
        )
        .join("")
    : '<div class="empty">Предыдущих сохранений пока нет</div>';
  $$("[data-version]").forEach((el) =>
    act(el, async () => {
      flushLocalDraft();
      dirty = false;
      await command("restore-draft", {
        id,
        version: Number(el.dataset.version),
      });
      select(id);
      modal.close();
      toast("Версия открыта как черновик. Twitch не изменён.");
    }),
  );
  icons();
  modal.showModal();
}
async function save() {
  if (!draft || saving) return;
  flushLocalDraft();
  const revision = draftRevision;
  saving = true;
  try {
    const result = await command("save", structuredClone(draft));
    if (revision !== draftRevision) {
      flushLocalDraft();
      return;
    }
    dirty = false;
    draft = structuredClone(result.rewards.find((r) => r.id === selected));
    $(".editor-head h2").textContent = draft.title;
    $("#save").innerHTML = icon("save") + "Сохранить";
    draftStatus("Сохранено");
    icons();
  } finally {
    saving = false;
    if (dirty) flushLocalDraft();
  }
}
async function addFiles(paths) {
  const added = await command("import", { id: selected, paths });
  for (const m of added)
    draft.items.push({
      id: m.id,
      volume: 80,
      weight: 1,
      ...(draft.kind === "video" ? { captionText: "" } : {}),
    });
  markDirty();
  renderMedia();
  updatePlacement();
}
function renderMedia() {
  $("#media-mode").textContent =
    draft.items.length > 1
      ? "Рулетка"
      : draft.items.length
        ? "Один файл"
        : "Нет файлов";
  $("#media-count").textContent = draft.items.length
    ? "· " + draft.items.length
    : "";
  $("#media-list").innerHTML = draft.items
    .map((i) => {
      const m = state.media.find((m) => m.id === i.id);
      return `<div class="media-row" data-item="${i.id}"><div class="media-file"><div class="media-name">${esc(m?.name || "Файл отсутствует")}<small>${((m?.size || 0) / 1024 / 1024).toFixed(1)} МБ</small></div>${draft.kind === "video" ? `<button data-caption-edit title="Текст этого ролика" aria-label="Текст ролика ${esc(m?.name)}">${icon("captions")}</button>` : ""}</div><div class="media-volume"><input data-volume type="range" min="0" max="100" value="${i.volume}" aria-label="Громкость ${esc(m?.name)}"><output class="volume-value">${i.volume}%</output></div><input data-weight type="number" min="0" max="10000" step="1" value="${i.weight}" aria-label="Вес ${esc(m?.name)}"><span class="chance"></span><button data-play title="Тест файла в OBS">${icon("play")}</button><button data-remove class="danger" title="Убрать файл">${icon("x")}</button></div>`;
    })
    .join("");
  $$(".media-row").forEach((row) => {
    const i = draft.items.find((i) => i.id === row.dataset.item);
    if (draft.kind === "video")
      act(row.querySelector("[data-caption-edit]"), () => {
        previewItemId = i.id;
        refreshCaptionItems();
        updatePlacement();
        $("#caption-text").focus();
      });
    row.querySelector("[data-volume]").addEventListener("input", (e) => {
      const item = draft.items.find((item) => item.id === row.dataset.item);
      item.volume = Number(e.target.value);
      row.querySelector(".volume-value").textContent = item.volume + "%";
      markDirty();
    });
    row.querySelector("[data-weight]").addEventListener("input", (e) => {
      draft.items.find((item) => item.id === row.dataset.item).weight = Number(
        e.target.value,
      );
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
  refreshCaptionItems();
  icons();
}
function previewItem() {
  const item =
    draft.items.find((item) => item.id === previewItemId) || draft.items[0];
  previewItemId = item?.id || "";
  return item;
}
function refreshCaptionItems() {
  if (draft.kind !== "video" || !$("#caption-item")) return;
  const item = previewItem();
  $("#caption-item").innerHTML = draft.items.length
    ? draft.items
        .map(
          (i) =>
            `<option value="${esc(i.id)}">${esc(state.media.find((m) => m.id === i.id)?.name || "Файл отсутствует")}</option>`,
        )
        .join("")
    : '<option value="">Нет видео</option>';
  $("#caption-item").value = previewItemId;
  $("#caption-item").disabled = !item;
  $("#caption-text").value = item
    ? RewardCaption.forItem(draft.video, item).caption.text
    : "";
  $("#caption-text").disabled = !item;
}
function percentages() {
  const heading = $("#chance-heading");
  if (heading.firstChild?.nodeType !== Node.TEXT_NODE)
    heading.prepend(document.createTextNode(""));
  heading.firstChild.textContent = draft.allowRepeats ? "Шанс" : "Доля";
  $("#roulette-help").textContent = draft.allowRepeats
    ? "Включено: каждый запуск выбирает из всех файлов с учётом веса. Один файл может выпасть несколько раз подряд."
    : "Выключено: каждый файл с весом больше нуля выпадет один раз за цикл. Цикл общий для всех зрителей и сохраняется после перезапуска. Вес влияет на порядок, а не число показов за цикл.";
  const total = draft.items.reduce((n, i) => n + i.weight, 0);
  $$(".media-row").forEach((row) => {
    const i = draft.items.find((i) => i.id === row.dataset.item);
    row.querySelector(".chance").textContent =
      (total > 0 ? (i.weight / total) * 100 : 0).toFixed(1) + "%";
  });
}
function bindVideo() {
  $("#caption-item").addEventListener("change", (event) => {
    previewItemId = event.target.value;
    refreshCaptionItems();
    updatePlacement();
  });
  $("#caption-text").addEventListener("input", (event) => {
    const item = previewItem();
    if (!item) return;
    item.captionText = event.target.value;
    markDirty();
    updatePlacement();
  });
  for (const button of $$("[data-text-anchor]"))
    button.addEventListener("click", () => {
      const kind = button.dataset.textKind;
      draft.video[kind] ||= {
        ...(kind === "caption"
          ? RewardCaption.defaults
          : RewardCaption.durationDefaults),
      };
      Object.assign(draft.video[kind], {
        anchor: button.dataset.textAnchor,
        x: 0,
        y: 0,
      });
      for (const option of $$(`[data-text-kind="${kind}"]`))
        option.setAttribute("aria-pressed", String(option === button));
      $(`#${kind}-x`).value = 0;
      $(`#${kind}-y`).value = 0;
      markDirty();
      updatePlacement();
    });
  for (const el of $$("[data-caption]"))
    el.addEventListener("input", () => {
      draft.video.caption ||= { ...RewardCaption.defaults };
      draft.video.caption[el.dataset.caption] =
        el.type === "number" ? Number(el.value) : el.value;
      markDirty();
      updatePlacement();
    });
  for (const el of $$("[data-duration]"))
    el.addEventListener("input", () => {
      draft.video.duration ||= { ...RewardCaption.durationDefaults };
      draft.video.duration[el.dataset.duration] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      for (const input of $$("[data-duration]:not([type=checkbox])"))
        input.disabled = !draft.video.duration.enabled;
      for (const button of $$('[data-text-kind="duration"]'))
        button.disabled = !draft.video.duration.enabled;
      markDirty();
      updatePlacement();
    });
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
  previewObserver = new ResizeObserver(updatePlacement);
  previewObserver.observe($("#stage"));
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
  const item = previewItem();
  const first = item?.id || "";
  if (p.dataset.media !== first) {
    p.querySelector("video")?.remove();
    p.dataset.media = first;
    if (first) {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        if (!p.isConnected) return;
        updatePlacement();
        if (Number.isFinite(video.duration) && video.duration > 0)
          video.currentTime = Math.min(0.05, video.duration / 2);
      };
      video.src = state.overlay.url + "media/" + first;
      p.prepend(video);
    }
  }
  const video = p.querySelector("video");
  const ratio =
    video?.videoWidth && video.videoHeight
      ? video.videoWidth / video.videoHeight
      : v.width / v.height;
  const frame = RewardGeometry.layout({ ...v, mode: "fixed", angle: 0 }, ratio);
  Object.assign(p.style, {
    left: frame.x / 19.2 + "%",
    top: frame.y / 10.8 + "%",
    width: frame.width / 19.2 + "%",
    height: frame.height / 10.8 + "%",
    border: `${frame.border * scale}px ${v.borderStyle} ${v.color}`,
    borderRadius: v.radius * scale + "px",
  });
  RewardCaption.renderAll(
    p,
    RewardCaption.forItem(draft.video, item),
    video?.duration,
    scale,
  );
  $("#coordinates").textContent =
    `${Math.round(frame.x)}, ${Math.round(frame.y)} · ${Math.round(frame.width)} × ${Math.round(frame.height)}`;
  for (const key of ["x", "y"])
    if (document.activeElement !== $(`[data-video="${key}"]`))
      $(`[data-video="${key}"]`).value = v[key];
}
function textPlacementMarkup(kind, value, disabled = false) {
  const labels = [
    "Сверху слева",
    "Сверху по центру",
    "Сверху справа",
    "По центру слева",
    "По центру",
    "По центру справа",
    "Снизу слева",
    "Снизу по центру",
    "Снизу справа",
  ];
  const symbols = [
    "arrow-up-left",
    "arrow-up",
    "arrow-up-right",
    "arrow-left",
    "dot",
    "arrow-right",
    "arrow-down-left",
    "arrow-down",
    "arrow-down-right",
  ];
  return `<div class="text-placement"><div><div class="anchor-label">Положение<button type="button" class="option-help" data-help="captionAnchor" aria-label="О положении текста">${icon("circle-help")}</button></div><div class="text-anchor-grid" role="group" aria-label="${kind === "caption" ? "Положение подписи" : "Положение длительности"}">${RewardCaption.anchors.map((anchor, i) => `<button type="button" data-text-kind="${kind}" data-text-anchor="${anchor}" aria-label="${labels[i]}" title="${labels[i]}" aria-pressed="${(value.anchor || RewardCaption.defaults.anchor) === anchor}" ${disabled ? "disabled" : ""}>${icon(symbols[i])}</button>`).join("")}</div></div><label>Смещение X<input id="${kind}-x" data-${kind}="x" type="number" min="-1920" max="1920" value="${value.x}" ${disabled ? "disabled" : ""}></label><label>Смещение Y<input id="${kind}-y" data-${kind}="y" type="number" min="-1080" max="1080" value="${value.y}" ${disabled ? "disabled" : ""}></label></div>`;
}
function captionMarkup() {
  const c = draft.video.caption || RewardCaption.defaults;
  const d = draft.video.duration || RewardCaption.durationDefaults;
  return `<section class="editor-section"><div class="section-head"><h3>Текст на видео</h3></div><div class="caption-fields">
  <label class="wide">Ролик<select id="caption-item"></select></label>
  <label class="wide">Текст ролика<textarea id="caption-text" maxlength="300" rows="2" placeholder="Без надписи"></textarea></label>
  <label>Шрифт<select id="caption-font" data-caption="font">${RewardCaption.fonts.map((font) => `<option ${font === c.font ? "selected" : ""}>${esc(font)}</option>`).join("")}</select></label>
  <label>Размер, px<input id="caption-size" data-caption="size" type="number" min="8" max="200" value="${c.size}"></label>
  <label>Цвет<input id="caption-color" data-caption="color" type="color" value="${esc(c.color)}"></label>
  </div>${textPlacementMarkup("caption", c)}<div class="duration-options"><label class="check"><input id="duration-enabled" data-duration="enabled" type="checkbox" ${d.enabled ? "checked" : ""}>Показывать длительность видео</label><div class="caption-fields">
  <label>Шрифт<select id="duration-font" data-duration="font" ${d.enabled ? "" : "disabled"}>${RewardCaption.fonts.map((font) => `<option ${font === d.font ? "selected" : ""}>${esc(font)}</option>`).join("")}</select></label>
  <label>Размер, px<input id="duration-size" data-duration="size" type="number" min="8" max="200" value="${d.size}" ${d.enabled ? "" : "disabled"}></label>
  <label>Цвет<input id="duration-color" data-duration="color" type="color" value="${esc(d.color)}" ${d.enabled ? "" : "disabled"}></label>
  </div>${textPlacementMarkup("duration", d, !d.enabled)}</div></section>`;
}
function renderStatus() {
  $(".version").textContent = "PRIVATE " + state.version;
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
        `<tr><td>${new Date(j.createdAt).toLocaleString("ru")}</td><td>${esc(j.user)}<small>${esc(j.rewardTitle)}</small>${j.source === "chat" ? `<small>Чат · ${esc(j.command)}</small>` : ""}</td><td>${esc(j.item?.name || "")}</td><td><span class="status ${j.state}">${states[j.state] || j.state}</span>${j.detail ? `<small>${esc(j.detail)}</small>` : ""}</td><td><div class="button-row">${j.state === "attention" ? `<button data-retry="${esc(j.id)}" title="Повторить тот же файл">${icon("rotate-ccw")}</button>` : ""}${["attention", "queued"].includes(j.state) ? `<button data-cancel="${esc(j.id)}" title="${j.refundable ? "Отменить и вернуть баллы" : "Отменить"}">${icon("x")}</button>` : ""}</div></td></tr>`,
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
  $("#profile-path").textContent = state.dataPath || "";
  $("#chat-connection-state").textContent =
    state.chat?.status || "Чат не подключён";
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
  act(el, async () => {
    if (el.classList.contains("active")) return;
    if (saving || channelBusy) return;
    if (
      channelDirty &&
      !confirm("Есть несохранённые изменения. Перейти без сохранения?")
    )
      return;
    flushLocalDraft();
    channelDirty = false;
    $$("[data-tab]").forEach((b) => b.classList.toggle("active", b === el));
    for (const name of ["rewards", "channel", "queue", "settings"])
      $("#tab-" + name).hidden = name !== el.dataset.tab;
    $("main").scrollTop = 0;
    updatePlacement();
    if (el.dataset.tab === "channel") await loadChannel();
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
for (const name of ["tray", "minimize", "maximize", "quit"])
  act($("#window-" + name), () => command(name));
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
  "recover-profile",
  "logout",
  "cancel-login",
  "copy-code",
])
  act($("#" + name), () => command(name));
act($("#login"), () => command("login", $("#client-id").value));
act($("#save-port"), () => command("port", Number($("#port").value)));
addEventListener("resize", updatePlacement);
desk.onState(accept);
addEventListener("DOMContentLoaded", () =>
  command("state")
    .then(() => {
      if (state.rewards.length) select(state.rewards[0].id);
    })
    .catch(() => {}),
);
icons();
