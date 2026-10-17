function renderObsRecovery() {
  const recovery = state.obsRecovery || {};
  $("#obs-recovery-status").textContent = recovery.status || "Не подключено";
  $("#obs-auto").checked = !!recovery.enabled;
  const ready = state.overlay.obsClients > 0;
  const queued = state.jobs.filter((j) => j.state === "queued").length;
  $("#source-health").textContent = ready
    ? "Источник OBS подключён"
    : state.overlay.outdated
      ? "В OBS старая страница источника. Требуется обновление."
      : `Источник OBS не отвечает${queued ? ` · ожидают награды: ${queued}` : ""}${recovery.enabled ? " · " + recovery.status : ""}`;
  $("#source-health").classList.toggle("ready", ready);
}
act($("#obs-local"), async () => {
  const button = $("#obs-local");
  button.disabled = true;
  try {
    await command("obs-connect", { local: true });
    toast(
      state.obsRecovery.connected
        ? "Защита OBS включена"
        : "Защита настроена. Запустите OBS обычным способом.",
    );
  } finally {
    button.disabled = false;
  }
});
act($("#obs-connect"), async () => {
  const button = $("#obs-connect");
  button.disabled = true;
  try {
    await command("obs-connect", {
      port: Number($("#obs-ws-port").value),
      password: $("#obs-ws-password").value,
    });
    $("#obs-ws-password").value = "";
  } finally {
    button.disabled = false;
  }
});
$("#obs-auto").addEventListener("change", async (e) => {
  try {
    await command("obs-auto", e.target.checked);
  } catch {
    renderObsRecovery();
  }
});
