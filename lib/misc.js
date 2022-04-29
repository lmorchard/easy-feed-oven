import fs from "fs/promises";
import path from "path";
import mkdirp from "mkdirp";

export function indexBy(items, keyFn, uniqueItems = false) {
  const index = {};
  for (const item of items) {
    const key = keyFn(item);
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      if (k) index[k] = uniqueItems ? item : [...(index[k] || []), item];
    }
  }
  return index;
}

export async function writeJSONFile(filepath, data) {
  const dirpath = path.dirname(filepath);
  await mkdirp(dirpath);
  return fs.writeFile(filepath, JSON.stringify(data, null, "  "));
}

export async function readJSONFile(filepath) {
  return JSON.parse(await fs.readFile(filepath, "utf-8"));
}

export async function readJSONFileIfExists(filePath) {  
  try {
    return await readJSONFile(filePath);
  } catch (e) {
    if (e.code === "ENOENT") {
      return;
    }
    throw e;
  }
}
