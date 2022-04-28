import fs from "fs/promises";

export function indexBy(items, keyFn) {
  const index = {};
  for (const item of items) {
    const key = keyFn(item);
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      if (k) index[k] = [...(index[k] || []), item];
    }
  }
  return index;
}

export function writeJSONFile(filepath, data) {
  return fs.writeFile(filepath, JSON.stringify(data, null, "  "));
}
