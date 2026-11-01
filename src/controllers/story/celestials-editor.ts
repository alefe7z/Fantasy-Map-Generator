// Celestials Manager: the world's suns and moons, edited in `options.map.lore.celestials` through the Celestials model
import { hsl } from "d3";
import { type Celestial, Celestials, type CelestialType } from "@/model/story/celestials";
import { Dialog } from "@/ui/dialog/dialog";
import {
  type EditorColumn,
  getRowId,
  initColumnVisibility,
  initEditorTable,
  renderEditorHeader,
  renderEditorPagination,
  type TableView
} from "@/ui/dialog/table";
import { tip } from "@/ui/tooltips";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { escapeHtml } from "@/utils/string-utils";

const dialogId = "celestialsEditor" as const;
const position = { my: "center", at: "center", of: "svg" };

const TYPE_LABEL: Record<CelestialType, string> = { sun: `☀️ ${t("Sun")}`, moon: `🌙 ${t("Moon")}` };

const columns: EditorColumn<Celestial>[] = [
  { key: "type", label: t("Type"), width: "6.5em", permanent: true },
  { key: "color", label: t("Color"), width: "3.4em" },
  { key: "name", label: t("Name"), width: "11em", permanent: true },
  { key: "size", label: t("Size"), width: "4em", tip: t("Apparent size in the sky: 1 is Earth's sun or moon") },
  {
    key: "period",
    label: t("Cycle"),
    width: "4.6em",
    tip: t("Days in its cycle: a moon's phases from full to full, a sun's year")
  },
  { key: "description", label: t("Description"), width: "16em" },
  { key: "remove", width: "1.4em", permanent: true }
];

const table = initEditorTable<Celestial>({ getData: () => Celestials.all, onUpdate: renderPage });

// the artwork and its average color, which a body's own color is reached from by a CSS filter
const ART: Record<CelestialType, { src: string; base: string }> = {
  sun: { src: "./images/celestials/sun.webp", base: "#b98032" },
  moon: { src: "./images/celestials/moon.webp", base: "#9a6a91" }
};
const SKY_SIZE = 44; // px of a body with size 1

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getTint({ type, color }: Celestial): string {
  const base = hsl(ART[type].base);
  const target = hsl(color);
  const hue = Number.isNaN(target.h) ? 0 : target.h - base.h;
  const saturation = clamp((target.s || 0) / base.s, 0, 2.5);
  const brightness = clamp(1 + (target.l - base.l) * 1.2, 0.35, 1.8);
  return `hue-rotate(${Math.round(hue)}deg) saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)}) drop-shadow(0 0 6px ${color})`;
}

function renderSky(): void {
  const sky = ensureEl("celestialsSky");
  const bodies = [...Celestials.all].sort((a, b) => (a.type === b.type ? 0 : a.type === "sun" ? -1 : 1));
  if (!bodies.length) {
    sky.innerHTML = `<span class="ce-empty">${t("The sky is empty: add a sun or a moon")}</span>`;
    return;
  }

  sky.innerHTML = bodies
    .map(body => {
      const px = Math.round(clamp(SKY_SIZE * body.size, 14, SKY_SIZE * 3));
      return /* html */ `<img src="${ART[body.type].src}" alt="" draggable="false" data-id="${body.i}"
        data-tip="${escapeHtml(body.name)}" style="width: ${px}px; height: ${px}px; filter: ${getTint(body)}" />`;
    })
    .join("");
}

/** Repaint one body in the sky while its color or size is being changed */
function updateSkyBody(body: Celestial): void {
  const img = ensureEl("celestialsSky").querySelector<HTMLImageElement>(`img[data-id="${body.i}"]`);
  if (!img) {
    renderSky();
    return;
  }
  const px = Math.round(clamp(SKY_SIZE * body.size, 14, SKY_SIZE * 3));
  img.style.width = img.style.height = `${px}px`;
  img.style.filter = getTint(body);
}

function open(): void {
  if (options.app.mode) return;
  Dialog.closeAll(`#${dialogId}, .stable`);
  renderDialog();
  table.reset();
  Dialog.open(dialogId, { title: t("Celestials Manager"), position, onClose });
}

function renderDialog(): void {
  Dialog.destroy(dialogId);

  const html = /* html */ `<div id="${dialogId}" class="dialog stable editorDialog">
    <style>
      #celestialsSky { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px;
        width: 0; min-width: 100%; box-sizing: border-box; min-height: 72px; margin-bottom: 6px; padding: 10px; border-radius: 4px;
        background: radial-gradient(ellipse at top, #2c3260, #10122a 75%); }
      #celestialsSky img { object-fit: contain; user-select: none; }
      #celestialsSky .ce-empty { color: #aab0d0; font-style: italic; }
    </style>
    <div id="celestialsSky" data-tip="${t("The sky as the world sees it")}"></div>
    <div id="celestialsBody" class="table">${renderEditorHeader({ dialogId, columns })}</div>

    <div id="celestialsFooter" class="totalLine">
      <div data-tip="${t("Suns in the sky")}" style="margin-left: 4px">☀️&nbsp;<span id="celestialsSuns">0</span></div>
      <div data-tip="${t("Moons in the sky")}" style="margin-left: 12px">🌙&nbsp;<span id="celestialsMoons">0</span></div>
    </div>

    <div class="editorToolbar">
      <button id="celestialsAddSun" data-tip="${t("Add a sun")}">☀️+</button>
      <button id="celestialsAddMoon" data-tip="${t("Add a moon")}">🌙+</button>
      <button id="celestialsRandomize" data-tip="${t("Replace the sky with random suns and moons")}" class="icon-shuffle"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  initColumnVisibility({
    dialogId,
    columns,
    onUpdate: () => Dialog.update(dialogId, { width: "fit-content", position })
  });
  ensureEl("celestialsAddSun").addEventListener("click", () => addBody("sun"));
  ensureEl("celestialsAddMoon").addEventListener("click", () => addBody("moon"));
  ensureEl("celestialsRandomize").addEventListener("click", triggerRandomize);
}

function renderPage(view: TableView<Celestial>): void {
  const body = ensureEl("celestialsBody");
  body.querySelectorAll(":scope > .states").forEach(row => void row.remove());

  let lines = "";
  for (const item of view.rows) {
    const types = (Object.keys(TYPE_LABEL) as CelestialType[])
      .map(type => `<option value="${type}" ${type === item.type ? "selected" : ""}>${TYPE_LABEL[type]}</option>`)
      .join("");

    lines += /* html */ `<div class="states" data-id="${item.i}">
      <div data-col="type"><select class="ceType" data-tip="${t("Sun or moon")}">${types}</select></div>
      <div data-col="color"><input class="ceColor" type="color" value="${item.color}" style="width: 1.6em; height: 1.4em; padding: 0; border: none" data-tip="${t("Color")}" /></div>
      <div data-col="name"><input class="ceName" value="${escapeHtml(item.name)}" data-tip="${t("Name")}" autocorrect="off" spellcheck="false" /></div>
      <div data-col="size"><input class="ceSize" type="number" min="0.01" step="0.1" value="${item.size}" data-tip="${t("Apparent size in the sky: 1 is Earth's sun or moon")}" /></div>
      <div data-col="period"><input class="cePeriod" type="number" min="0.01" step="0.5" value="${item.period}" data-tip="${t("Days in its cycle: a moon's phases from full to full, a sun's year")}" /></div>
      <div data-col="description"><input class="ceDescription" value="${escapeHtml(item.description)}" data-tip="${t("Myths, omens and anything else about it")}" placeholder="${t("Myths, omens")}…" /></div>
      <span data-col="remove" data-tip="${t("Remove")}" class="ceRemove pointer icon-trash-empty"></span>
    </div>`;
  }
  body.insertAdjacentHTML("beforeend", lines);

  renderSky();
  ensureEl("celestialsSuns").textContent = String(view.all.filter(item => item.type === "sun").length);
  ensureEl("celestialsMoons").textContent = String(view.all.filter(item => item.type === "moon").length);

  const on = (selector: string, event: string, handler: EventListener) => {
    body.querySelectorAll<HTMLElement>(selector).forEach(el => void el.addEventListener(event, handler));
  };
  on(".ceType", "change", onTypeChange);
  on(".ceColor", "input", onColorInput);
  on(".ceName", "change", onNameChange);
  on(".ceSize", "change", onNumberChange);
  on(".cePeriod", "change", onNumberChange);
  on(".ceDescription", "change", onDescriptionChange);
  on(".ceRemove", "click", triggerRemove);

  renderEditorPagination(ensureEl("celestialsFooter"), view, table.goto);
}

const getRow = (el: HTMLElement): Celestial | undefined => Celestials.get(getRowId(el));

function onTypeChange(this: HTMLSelectElement): void {
  const item = getRow(this);
  if (!item) return;
  Celestials.update(item.i, { type: this.value as CelestialType });
  table.refresh();
}

function onColorInput(this: HTMLInputElement): void {
  const item = getRow(this);
  if (!item) return;
  Celestials.update(item.i, { color: this.value });
  updateSkyBody(item);
}

function onNameChange(this: HTMLInputElement): void {
  const item = getRow(this);
  if (!item) return;
  if (!this.value.trim()) {
    this.value = item.name;
    tip(t("Name cannot be empty"), true, "error", 5000);
    return;
  }
  Celestials.update(item.i, { name: this.value });
  renderSky();
}

function onNumberChange(this: HTMLInputElement): void {
  const item = getRow(this);
  if (!item) return;
  const key = this.classList.contains("ceSize") ? "size" : "period";
  const value = +this.value;
  if (!Number.isFinite(value) || value <= 0) {
    this.value = String(item[key]);
    tip(t("The value must be greater than zero"), true, "error", 5000);
    return;
  }
  Celestials.update(item.i, { [key]: value });
  this.value = String(item[key]);
  if (key === "size") updateSkyBody(item);
}

function onDescriptionChange(this: HTMLInputElement): void {
  const item = getRow(this);
  if (item) Celestials.update(item.i, { description: this.value });
}

function addBody(type: CelestialType): void {
  const item = Celestials.add(type);
  table.refresh();
  document.querySelector<HTMLInputElement>(`#celestialsBody [data-id="${item.i}"] .ceName`)?.select();
}

function triggerRemove(this: HTMLElement): void {
  const item = getRow(this);
  if (!item) return;
  Dialog.confirm({
    title: t("Remove"),
    message: t("Remove {{name}} from the sky?", { name: item.name }),
    confirm: t("Remove"),
    onConfirm: () => {
      Celestials.remove(item.i);
      table.refresh();
    }
  });
}

function triggerRandomize(): void {
  const randomize = () => {
    Celestials.randomize();
    table.refresh();
  };
  if (!Celestials.all.length) {
    randomize();
    return;
  }
  Dialog.confirm({
    title: t("Random sky"),
    message: t("Replace all suns and moons with random ones?"),
    confirm: t("Replace"),
    onConfirm: randomize
  });
}

function onClose(): void {
  Dialog.destroy(dialogId);
}

export const CelestialsEditor = { open };
