// A loaded map may come from anyone, and the editors build markup out of its text: drop the markup it carries

import { Names } from "@/model/society/names-generator";
import { escapeHtml } from "@/utils/string-utils";
import { isSafeHtml } from "@/utils/validation-utils";

const MARKUP = /["<>]/g;
const LOOKALIKES: Record<string, string> = { '"': "”", "<": "‹", ">": "›" };
const SAFE_LINK = /^https?:\/\/[^\s"<>]+$/i;

/** Text with the characters that open markup swapped for lookalikes */
export const neutralizeText = (text: string): string => text.replace(MARKUP, character => LOOKALIKES[character]);

/** A note outside the notes editor's subset keeps only its text */
export function neutralizeNote(note: string): string {
  if (isSafeHtml(note)) return note;
  const template = document.createElement("template");
  template.innerHTML = note; // inert: a template runs nothing
  return escapeHtml(template.content.textContent ?? "");
}

type Fields = Record<string, unknown>;

// fields with rules of their own: HTML notes, distribution formulas (parsed, never run) and preview links
function neutralizeFields(record: Fields): void {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      if (key === "note") record[key] = neutralizeNote(value);
      else if (key === "link") {
        if (!SAFE_LINK.test(value.trim())) delete record[key];
      } else if (key !== "distribution") record[key] = neutralizeText(value);
    } else neutralizeValue(value);
  }
}

function neutralizeValue(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") value[index] = neutralizeText(item);
      else neutralizeValue(item);
    });
  } else if (value && typeof value === "object" && !ArrayBuffer.isView(value)) neutralizeFields(value as Fields);
}

/** Clean the text of the map just loaded, after its migrations; the cells hold no text */
export function neutralizeLoadedText(): void {
  for (const [key, collection] of Object.entries(pack)) {
    if (key !== "cells" && key !== "vertices") neutralizeValue(collection);
  }

  // custom icon markup is sanitized as an svg when the icons are synced
  const { customIcons, ...map } = options.map;
  neutralizeFields(map);
  Object.assign(options.map, map, { customIcons });

  for (const base of Names.nameBases) {
    base.name = neutralizeText(base.name);
    base.b = neutralizeText(base.b);
  }
}
