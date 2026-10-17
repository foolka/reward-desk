(function (root) {
  const fonts = [
    "Arial",
    "Segoe UI",
    "Verdana",
    "Tahoma",
    "Trebuchet MS",
    "Georgia",
    "Impact",
  ];
  const defaults = {
    text: "",
    x: 0,
    y: 0,
    size: 48,
    color: "#ffffff",
    font: "Arial",
  };
  const durationDefaults = {
    enabled: false,
    x: 0,
    y: -64,
    size: 32,
    color: "#ffffff",
    font: "Arial",
  };
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const total = Math.floor(seconds),
      minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, "0")}`;
  }
  function render(
    container,
    value = defaults,
    scale = 1,
    kind = "caption",
    heightLimit = Infinity,
  ) {
    let el = container.querySelector(
      `:scope > .video-caption[data-kind="${kind}"]`,
    );
    if (!value.text?.trim()) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "video-caption";
      el.dataset.kind = kind;
      container.append(el);
    }
    const width = container.clientWidth,
      height = container.clientHeight;
    if (!width || !height) return;
    const inset = Math.min(12 * scale, width / 4, height / 4);
    el.textContent = value.text;
    Object.assign(el.style, {
      maxWidth: Math.max(1, width - 2 * inset) + "px",
      fontFamily: `"${fonts.includes(value.font) ? value.font : defaults.font}", sans-serif`,
      color: value.color || defaults.color,
      textShadow: `0 ${2 * scale}px ${4 * scale}px #000, 0 0 ${2 * scale}px #000`,
    });
    let size = (value.size || defaults.size) * scale;
    el.style.fontSize = size + "px";
    // Fit long captions without changing video geometry or cutting off glyphs.
    while (
      (el.scrollHeight > Math.min(height, heightLimit) - 2 * inset ||
        el.scrollWidth > width - 2 * inset) &&
      size > 2 * scale
    ) {
      size = Math.max(2 * scale, size - scale);
      el.style.fontSize = size + "px";
    }
    el.style.left =
      Math.max(
        inset,
        Math.min(
          width - inset - el.offsetWidth,
          (width - el.offsetWidth) / 2 + (value.x || 0) * scale,
        ),
      ) + "px";
    el.style.top =
      Math.max(
        inset,
        Math.min(
          height - inset - el.offsetHeight,
          height - inset - el.offsetHeight + (value.y || 0) * scale,
        ),
      ) + "px";
    return el;
  }
  function renderAll(container, video, seconds, scale = 1) {
    const d = video.duration || durationDefaults;
    const duration = render(
      container,
      { ...d, text: d.enabled ? formatDuration(seconds) : "" },
      scale,
      "duration",
    );
    const autoStack =
      duration && d.x === durationDefaults.x && d.y === durationDefaults.y;
    const caption = render(
      container,
      video.caption,
      scale,
      "caption",
      autoStack
        ? container.clientHeight - duration.offsetHeight - 12 * scale
        : Infinity,
    );
    if (autoStack && caption) {
      duration.style.top =
        Math.max(
          4 * scale,
          caption.offsetTop - duration.offsetHeight - 8 * scale,
        ) + "px";
    }
  }
  const api = {
    fonts,
    defaults,
    durationDefaults,
    formatDuration,
    render,
    renderAll,
  };
  if (typeof module === "object") module.exports = api;
  else root.RewardCaption = api;
})(globalThis);
