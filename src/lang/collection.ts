// Collection — the DSL's Pythonic list type. Wraps a JS array so the
// interpreter can intercept indexing, iteration, truthiness, and method
// dispatch in one place.
//
// Returned from query callables (enemies(), allies(), items(), ...) and
// from any `[a, b, c]` literal in DSL source. Raw JS arrays may still appear
// inside the engine — Index/For/truthy/len treat both interchangeably.

export class Collection {
  items: unknown[];
  constructor(items: unknown[] = []) { this.items = items; }

  // Surfaces as `.length` so DSL `coll.length` keeps reading the same as
  // legacy `enemies().length` chains.
  get length(): number { return this.items.length; }

  filter(pred: unknown): Collection {
    const fn = asPred(pred);
    if (!fn) return new Collection([]);
    return new Collection(this.items.filter(it => truthyJs(fn(it))));
  }

  sorted_by(key: unknown): Collection {
    const fn = asKey(key);
    if (!fn) return new Collection([...this.items]);
    return new Collection([...this.items].sort((a, b) => {
      const ka = fn(a), kb = fn(b);
      if (ka === kb) return 0;
      // @ts-ignore — both keys come from script-supplied fn; comparable when same primitive type.
      return ka < kb ? -1 : 1;
    }));
  }

  first(): unknown { return this.items.length > 0 ? this.items[0] : null; }
  last(): unknown { return this.items.length > 0 ? this.items[this.items.length - 1] : null; }

  min_by(key: unknown): unknown {
    const fn = asKey(key);
    if (!fn || this.items.length === 0) return null;
    let bestI = 0;
    let bestK = fn(this.items[0]);
    for (let i = 1; i < this.items.length; i++) {
      const k = fn(this.items[i]);
      // @ts-ignore — see sorted_by note.
      if (k < bestK) { bestK = k; bestI = i; }
    }
    return this.items[bestI];
  }

  max_by(key: unknown): unknown {
    const fn = asKey(key);
    if (!fn || this.items.length === 0) return null;
    let bestI = 0;
    let bestK = fn(this.items[0]);
    for (let i = 1; i < this.items.length; i++) {
      const k = fn(this.items[i]);
      // @ts-ignore — see sorted_by note.
      if (k > bestK) { bestK = k; bestI = i; }
    }
    return this.items[bestI];
  }
}

export function isCollection(v: unknown): v is Collection {
  return v instanceof Collection;
}

// Iterable view: works for both Collection and raw arrays. Lets For-loops and
// len() share one code path in the interpreter.
export function asIterableArray(v: unknown): unknown[] | null {
  if (v instanceof Collection) return v.items;
  if (Array.isArray(v)) return v;
  return null;
}

export function listLength(v: unknown): number | null {
  if (v instanceof Collection) return v.items.length;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "string") return v.length;
  return null;
}

function asPred(p: unknown): ((it: unknown) => unknown) | null {
  return typeof p === "function" ? p as (it: unknown) => unknown : null;
}
function asKey(k: unknown): ((it: unknown) => unknown) | null {
  return typeof k === "function" ? k as (it: unknown) => unknown : null;
}
function truthyJs(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (v instanceof Collection) return v.items.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
