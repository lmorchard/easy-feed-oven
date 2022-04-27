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

