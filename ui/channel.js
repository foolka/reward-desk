let channelCatalog = null,
  channelSelected = "",
  channelDraft = null,
  channelDirty = false,
  channelBusy = false,
  channelIdentity = "",
  channelError = "";
function channelAccountChanged() {
  const identity = `${state.auth.user?.id || ""}:${state.authClientId || ""}`;
  if (identity === channelIdentity) return;
  channelIdentity = identity;
  channelCatalog = null;
  channelSelected = "";
  channelDraft = null;
  channelDirty = false;
  channelError = "";
  renderChannel();
  renderChannelEditor();
}
function renderChannel() {
  const term = $("#channel-search").value.toLocaleLowerCase();
  const filter = $("#channel-filter").value;
  const items = (channelCatalog?.items || []).filter(
    (r) =>
      r.settings.title.toLocaleLowerCase().includes(term) &&
      (filter === "all" || r.manageable === (filter === "editable")),
  );
  $("#channel-list").innerHTML = items
    .map(
      (r) => `<tr class="${r.id === channelSelected ? "selected" : ""}">
    <td><span class="reward-swatch" style="background:${/^#[0-9a-f]{6}$/i.test(r.settings.background) ? r.settings.background : "#777777"}" title="${esc(r.settings.background)}"></span></td>
    <td><strong>${esc(r.settings.title)}</strong><small>${!r.settings.enabled ? "Отключена" : r.settings.paused ? "На паузе" : r.inStock === false ? "Недоступна сейчас" : "Активна"} · ${r.manageable ? "Reward Desk" : "Только просмотр"}</small></td>
    <td class="reward-cost">${Number(r.settings.cost).toLocaleString("ru")}</td>
    <td><button data-channel-id="${esc(r.id)}" title="${r.manageable ? "Редактировать" : "Просмотреть"} ${esc(r.settings.title)}" ${channelBusy ? "disabled" : ""}>${icon(r.manageable ? "pencil" : "eye")}</button></td></tr>`,
    )
    .join("");
  $$("[data-channel-id]").forEach((el) =>
    act(el, () => selectChannel(el.dataset.channelId)),
  );
  $("#channel-empty").hidden = items.length > 0;
  $("#channel-empty").textContent = channelBusy
    ? "Загрузка…"
    : !state.auth.user
      ? "Войдите через Twitch во вкладке «Подключение»"
      : !channelCatalog
        ? "Список не загружен"
        : channelCatalog.items.length
          ? "Ничего не найдено"
          : "Пользовательских наград пока нет";
  $("#channel-updated").textContent = channelBusy
    ? "Обновление…"
    : channelCatalog
      ? `${channelCatalog.items.length} наград · обновлено ${new Date(channelCatalog.updatedAt).toLocaleTimeString("ru")}`
      : "Пользовательские награды Twitch";
  $("#channel-refresh").disabled = channelBusy || !state.auth.user;
  $("#channel-dashboard").disabled = !state.auth.user;
  $("#channel-error").hidden = !channelError;
  $("#channel-error").textContent = channelError;
  icons();
}
function selectChannel(id) {
  if (channelBusy) return;
  if (
    channelDirty &&
    !confirm("Есть несохранённые изменения. Перейти без сохранения?")
  )
    return;
  channelSelected = id;
  channelDirty = false;
  channelDraft = structuredClone(
    channelCatalog?.items.find((r) => r.id === id)?.settings || null,
  );
  renderChannel();
  renderChannelEditor();
}
function renderChannelEditor() {
  const r = channelCatalog?.items.find((r) => r.id === channelSelected);
  if (!r || !channelDraft) {
    $("#channel-editor").innerHTML =
      '<div class="empty">Выберите награду</div>';
    return;
  }
  $("#channel-editor").innerHTML =
    `<div class="editor-head"><h2>${esc(r.settings.title)}</h2><span class="status">${r.manageable ? "Редактирование" : "Только просмотр"}</span></div>
    ${!r.manageable ? '<div class="notice">Награда создана вне этой регистрации Reward Desk. Twitch API не разрешает её изменение здесь.</div><button id="channel-open-twitch">' + icon("external-link") + "Открыть в Twitch</button>" : ""}
    <form id="channel-form"><fieldset ${!r.manageable || channelBusy ? "disabled" : ""}>${settingsMarkup(channelDraft)}<div class="save-footer" ${!r.manageable ? "hidden" : ""}><button type="button" id="channel-reset" title="Отменить изменения">${icon("undo-2")}</button><button id="channel-save" type="submit" class="primary">${icon("save")}Сохранить в Twitch${channelDirty ? " *" : ""}</button></div></fieldset></form>`;
  bindSettings(
    $("#channel-form"),
    () => channelDraft,
    () => {
      channelDirty = true;
      $("#channel-save").innerHTML = icon("save") + "Сохранить в Twitch *";
      icons();
    },
  );
  $("#channel-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void saveChannel().catch(() => {});
  });
  act($("#channel-reset"), () => selectChannel(channelSelected));
  act($("#channel-open-twitch"), () => command("channel-dashboard"));
  icons();
}
async function loadChannel() {
  if (channelBusy) return;
  if (channelDirty && !confirm("Обновить список без сохранения изменений?"))
    return;
  if (!state.auth.user) {
    renderChannel();
    return;
  }
  const identity = channelIdentity;
  channelBusy = true;
  channelError = "";
  renderChannel();
  renderChannelEditor();
  try {
    const result = await command("channel-list");
    if (identity !== channelIdentity) return;
    channelCatalog = result;
    channelDirty = false;
    channelDraft = structuredClone(
      result.items.find((r) => r.id === channelSelected)?.settings || null,
    );
  } catch {
    if (identity === channelIdentity)
      channelError =
        "Не удалось обновить список. Проверьте подключение Twitch и повторите обновление.";
  } finally {
    channelBusy = false;
    renderChannel();
    renderChannelEditor();
  }
}
async function saveChannel() {
  const r = channelCatalog?.items.find((r) => r.id === channelSelected);
  if (channelBusy || !r?.manageable) return;
  const identity = channelIdentity;
  channelBusy = true;
  renderChannel();
  $("#channel-form fieldset").disabled = true;
  try {
    const result = await command("channel-save", {
      account: channelCatalog.account,
      clientId: channelCatalog.clientId,
      id: r.id,
      baseline: r.settings,
      settings: channelDraft,
    });
    if (identity !== channelIdentity) return;
    channelCatalog = result;
    channelDraft = structuredClone(
      result.items.find((item) => item.id === r.id).settings,
    );
    channelDirty = false;
    channelError = "";
    await command("state");
    toast("Настройки сохранены в Twitch");
  } finally {
    channelBusy = false;
    renderChannel();
    renderChannelEditor();
  }
}
$("#channel-search").addEventListener("input", renderChannel);
$("#channel-filter").addEventListener("change", renderChannel);
act($("#channel-refresh"), loadChannel);
act($("#channel-dashboard"), () => command("channel-dashboard"));
