let channelCatalog = null,
  channelSelected = "",
  channelDraft = null,
  channelDirty = false,
  channelBusy = false,
  channelIdentity = "",
  channelError = "",
  channelColors = new Set(),
  channelSort = { key: "", direction: 1 };
const channelCollator = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});
function rewardColor(r) {
  const color = r.settings.background;
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#777777";
}
function rewardStatus(r) {
  return !r.settings.enabled
    ? "disabled"
    : r.settings.paused
      ? "paused"
      : r.inStock === false
        ? "unavailable"
        : "active";
}
function clearChannelFilters(column) {
  if (!column || column === "color") channelColors.clear();
  if (!column || column === "title") {
    $("#channel-search").value = "";
    $("#channel-name").value = "";
    $("#channel-status").value = "all";
  }
  if (!column || column === "cost") {
    $("#channel-cost-min").value = "";
    $("#channel-cost-max").value = "";
  }
  if (!column) $("#channel-filter").value = "all";
}
function positionChannelPopover(popover) {
  if (!popover.matches(":popover-open")) return;
  const button = document.querySelector(`[popovertarget="${popover.id}"]`);
  const anchor = button.getBoundingClientRect();
  const rect = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - rect.width - 12))}px`;
  const top =
    anchor.bottom + 6 + rect.height <= innerHeight - 12
      ? anchor.bottom + 6
      : anchor.top - rect.height - 6;
  popover.style.top = `${Math.max(12, Math.min(top, innerHeight - rect.height - 12))}px`;
}
function channelAccountChanged() {
  const identity = `${state.auth.user?.id || ""}:${state.authClientId || ""}`;
  if (identity === channelIdentity) return;
  channelIdentity = identity;
  channelCatalog = null;
  channelSelected = "";
  channelDraft = null;
  channelDirty = false;
  channelError = "";
  clearChannelFilters();
  channelSort = { key: "", direction: 1 };
  $$(".column-popover:popover-open").forEach((el) => el.hidePopover());
  renderChannel();
  renderChannelEditor();
}
function renderChannel() {
  const term = $("#channel-search").value.trim().toLocaleLowerCase();
  const filter = $("#channel-filter").value;
  const status = $("#channel-status").value;
  const minInput = $("#channel-cost-min"),
    maxInput = $("#channel-cost-max");
  const min = minInput.value === "" ? 0 : minInput.valueAsNumber;
  const max = maxInput.value === "" ? Infinity : maxInput.valueAsNumber;
  const validRange =
    minInput.validity.valid && maxInput.validity.valid && min <= max;
  const active = {
    color: channelColors.size > 0,
    title: !!term || status !== "all",
    cost: minInput.value !== "" || maxInput.value !== "" || !validRange,
  };
  const items = (channelCatalog?.items || []).filter(
    (r) =>
      validRange &&
      r.settings.title.toLocaleLowerCase().includes(term) &&
      (filter === "all" || r.manageable === (filter === "editable")) &&
      (!channelColors.size || channelColors.has(rewardColor(r))) &&
      (status === "all" || rewardStatus(r) === status) &&
      r.settings.cost >= min &&
      r.settings.cost <= max,
  );
  if (channelSort.key)
    items.sort((a, b) => {
      const order =
        channelSort.key === "cost"
          ? a.settings.cost - b.settings.cost
          : channelCollator.compare(
              channelSort.key === "color" ? rewardColor(a) : a.settings.title,
              channelSort.key === "color" ? rewardColor(b) : b.settings.title,
            );
      return order * channelSort.direction;
    });
  $("#channel-range-error").hidden = validRange;
  minInput.setAttribute("aria-invalid", String(!validRange));
  maxInput.setAttribute("aria-invalid", String(!validRange));
  $("#channel-filter-summary").hidden =
    !Object.values(active).some(Boolean) && filter === "all";
  $("#channel-filter-count").textContent =
    `${items.length} из ${channelCatalog?.items.length || 0} наград`;
  $$("[data-channel-menu]").forEach((button) => {
    button.classList.toggle("active", active[button.dataset.channelMenu]);
    button.setAttribute(
      "aria-label",
      `${button.title}${active[button.dataset.channelMenu] ? ": включён" : ""}`,
    );
  });
  $$("[data-channel-sort]").forEach((button) => {
    const sorted = channelSort.key === button.dataset.channelSort;
    const direction = sorted
      ? channelSort.direction > 0
        ? "ascending"
        : "descending"
      : "none";
    button.closest("th").setAttribute("aria-sort", direction);
    button.classList.toggle("active", sorted);
    button.querySelector("svg, i")?.remove();
    button.insertAdjacentHTML(
      "beforeend",
      icon(
        !sorted
          ? "arrow-up-down"
          : channelSort.direction > 0
            ? "arrow-up"
            : "arrow-down",
      ),
    );
  });
  const colors = [
    ...new Set([
      ...(channelCatalog?.items || []).map(rewardColor),
      ...channelColors,
    ]),
  ].sort();
  if ($("#channel-colors").dataset.colors !== colors.join(",")) {
    $("#channel-colors").dataset.colors = colors.join(",");
    $("#channel-colors").innerHTML = colors
      .map(
        (color) =>
          `<button data-filter-color="${color}" style="background:${color}" title="${color.toUpperCase()}" aria-label="Цвет ${color.toUpperCase()}" aria-pressed="false"></button>`,
      )
      .join("");
  }
  $$("[data-filter-color]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(channelColors.has(button.dataset.filterColor)),
    ),
  );
  $("#channel-list").innerHTML = items
    .map(
      (r) => `<tr class="${r.id === channelSelected ? "selected" : ""}">
    <td><span class="reward-swatch" style="background:${rewardColor(r)}" title="${esc(r.settings.background)}"></span></td>
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
  $$(".column-popover:popover-open").forEach(positionChannelPopover);
}
async function selectChannel(id) {
  if (channelBusy) return;
  if (
    channelDirty &&
    !(await confirmAction(
      "Есть несохранённые изменения. Перейти без сохранения?",
    ))
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
    <form id="channel-form"><fieldset class="${r.manageable ? "" : "readonly"}" ${channelBusy ? "disabled" : ""}>${settingsMarkup(channelDraft)}<div class="save-footer" ${!r.manageable ? "hidden" : ""}><button type="button" id="channel-reset" title="Отменить изменения">${icon("undo-2")}</button><button id="channel-save" type="submit" class="primary">${icon("save")}Сохранить в Twitch${channelDirty ? " *" : ""}</button></div></fieldset></form>`;
  if (!r.manageable)
    $("#channel-form")
      .querySelectorAll("input, select, textarea, button")
      .forEach((control) => {
        control.disabled = true;
      });
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
  if (
    channelDirty &&
    !(await confirmAction("Обновить список без сохранения изменений?"))
  )
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
$("#channel-search").addEventListener("input", () => {
  $("#channel-name").value = $("#channel-search").value;
  renderChannel();
});
$("#channel-name").addEventListener("input", () => {
  $("#channel-search").value = $("#channel-name").value;
  renderChannel();
});
$("#channel-filter").addEventListener("change", renderChannel);
$("#channel-status").addEventListener("change", renderChannel);
["#channel-cost-min", "#channel-cost-max"].forEach((selector) =>
  $(selector).addEventListener("input", renderChannel),
);
$("#channel-colors").addEventListener("click", (event) => {
  const color = event.target.closest("[data-filter-color]")?.dataset
    .filterColor;
  if (!color) return;
  if (channelColors.has(color)) channelColors.delete(color);
  else channelColors.add(color);
  renderChannel();
});
$$("[data-channel-sort]").forEach((button) =>
  act(button, () => {
    const key = button.dataset.channelSort;
    channelSort =
      channelSort.key !== key
        ? { key, direction: 1 }
        : channelSort.direction === 1
          ? { key, direction: -1 }
          : { key: "", direction: 1 };
    renderChannel();
  }),
);
$$("[data-clear-column]").forEach((button) =>
  act(button, () => {
    clearChannelFilters(button.dataset.clearColumn);
    renderChannel();
  }),
);
act($("#channel-clear-filters"), () => {
  clearChannelFilters();
  renderChannel();
});
$$(".column-popover").forEach((popover) =>
  popover.addEventListener("toggle", () => {
    const button = document.querySelector(`[popovertarget="${popover.id}"]`);
    button.setAttribute(
      "aria-expanded",
      String(popover.matches(":popover-open")),
    );
    positionChannelPopover(popover);
  }),
);
const repositionChannelFilters = () =>
  $$(".column-popover:popover-open").forEach(positionChannelPopover);
window.addEventListener("resize", repositionChannelFilters);
document.addEventListener("scroll", repositionChannelFilters, true);
act($("#channel-refresh"), loadChannel);
act($("#channel-dashboard"), () => command("channel-dashboard"));
