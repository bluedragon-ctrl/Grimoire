// Help pane — mounts into an existing container, owns its own view state, and
// never touches the engine, World, or the rest of the UI. Boundary: reads help
// tree + writes DOM + navigator.clipboard; nothing else.

import {
  allEntries, categories, entriesIn, getEntry, search,
  type CategoryId, type HelpEntry, type SearchHit,
} from "./index.js";

type View =
  | { kind: "category" }
  | { kind: "list"; category: CategoryId }
  | { kind: "leaf"; path: string };

export interface HelpPaneHandle {
  /** Re-render (e.g., after external state changes). Currently unused but exposed for symmetry. */
  refresh(): void;
  /** Navigate to a specific path, opening the right view. Used by tests. */
  goto(path: string): void;
  /** Inspect current view (tests). */
  getView(): View;
}

export function mountHelpPane(container: HTMLElement): HelpPaneHandle {
  let view: View = { kind: "category" };
  let query = "";

  function render(): void {
    container.innerHTML = "";
    const root = document.createElement("div");
    root.className = "help-root";

    root.appendChild(renderBreadcrumb());

    if (view.kind === "category") {
      root.appendChild(renderSearchBox());
      if (query.trim()) {
        root.appendChild(renderSearchResults(search(query)));
      } else {
        root.appendChild(renderCategoryList());
      }
    } else if (view.kind === "list") {
      root.appendChild(renderList(view.category));
    } else {
      const entry = getEntry(view.path);
      if (!entry) {
        const p = document.createElement("p");
        p.textContent = `Unknown help path: ${view.path}`;
        root.appendChild(p);
      } else {
        root.appendChild(renderLeaf(entry));
      }
    }

    container.appendChild(root);
  }

  function renderBreadcrumb(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "help-crumb";

    const mkSeg = (label: string, go: (() => void) | null): HTMLElement => {
      if (!go) {
        const span = document.createElement("span");
        span.className = "help-crumb-current";
        span.textContent = label;
        return span;
      }
      const a = document.createElement("a");
      a.href = "#";
      a.className = "help-crumb-link";
      a.textContent = label;
      a.addEventListener("click", (e) => { e.preventDefault(); go(); });
      return a;
    };

    const current = view;
    bar.appendChild(mkSeg("HELP", current.kind === "category" ? null : () => { go({ kind: "category" }); }));
    if (current.kind === "list") {
      bar.appendChild(sep());
      const cat = categories().find(c => c.id === current.category)!;
      bar.appendChild(mkSeg(cat.title, null));
    } else if (current.kind === "leaf") {
      const entry = getEntry(current.path);
      if (entry) {
        const cat = categories().find(c => c.id === entry.category)!;
        bar.appendChild(sep());
        bar.appendChild(mkSeg(cat.title, () => { go({ kind: "list", category: entry.category }); }));
        bar.appendChild(sep());
        bar.appendChild(mkSeg(entry.name, null));
      }
    }
    return bar;
  }

  function sep(): HTMLElement {
    const s = document.createElement("span");
    s.className = "help-crumb-sep";
    s.textContent = " \u25B8 "; // ▸
    return s;
  }

  function renderSearchBox(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "help-search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search help…";
    input.value = query;
    input.className = "help-search-input";
    input.addEventListener("input", () => { query = input.value; render(); input.focus(); });
    wrap.appendChild(input);
    return wrap;
  }

  function renderCategoryList(): HTMLElement {
    const ul = document.createElement("ul");
    ul.className = "help-list";
    for (const c of categories()) {
      const li = document.createElement("li");
      li.className = "help-row";
      const a = document.createElement("a");
      a.href = "#";
      a.className = "help-row-link";
      a.addEventListener("click", (e) => { e.preventDefault(); go({ kind: "list", category: c.id }); });
      const name = document.createElement("span");
      name.className = "help-row-name";
      name.textContent = c.title;
      const blurb = document.createElement("span");
      blurb.className = "help-row-blurb";
      blurb.textContent = c.blurb;
      a.appendChild(name);
      a.appendChild(blurb);
      li.appendChild(a);
      ul.appendChild(li);
    }
    return ul;
  }

  function renderList(category: CategoryId): HTMLElement {
    const ul = document.createElement("ul");
    ul.className = "help-list";
    for (const e of entriesIn(category)) {
      ul.appendChild(renderRow(e));
    }
    return ul;
  }

  function renderRow(e: HelpEntry): HTMLElement {
    const li = document.createElement("li");
    li.className = "help-row";
    const a = document.createElement("a");
    a.href = "#";
    a.className = "help-row-link";
    a.dataset.path = e.path;
    a.addEventListener("click", (ev) => { ev.preventDefault(); go({ kind: "leaf", path: e.path }); });
    const name = document.createElement("span");
    name.className = "help-row-name";
    name.textContent = e.name;
    const blurb = document.createElement("span");
    blurb.className = "help-row-blurb";
    blurb.textContent = e.blurb;
    a.appendChild(name);
    a.appendChild(blurb);
    li.appendChild(a);
    return li;
  }

  function renderSearchResults(hits: SearchHit[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "help-search-results";
    if (hits.length === 0) {
      const p = document.createElement("p");
      p.className = "help-empty";
      p.textContent = "No matches.";
      wrap.appendChild(p);
      return wrap;
    }
    const nameHits = hits.filter(h => h.tier === "name");
    const blurbHits = hits.filter(h => h.tier === "blurb");
    if (nameHits.length > 0) {
      wrap.appendChild(group("Matches", nameHits.map(h => h.entry)));
    }
    if (blurbHits.length > 0) {
      wrap.appendChild(group("In description", blurbHits.map(h => h.entry)));
    }
    return wrap;
  }

  function group(title: string, entries: HelpEntry[]): HTMLElement {
    const h = document.createElement("h3");
    h.className = "help-group-title";
    h.textContent = title;
    const ul = document.createElement("ul");
    ul.className = "help-list";
    for (const e of entries) ul.appendChild(renderRow(e));
    const wrap = document.createElement("div");
    wrap.appendChild(h);
    wrap.appendChild(ul);
    return wrap;
  }

  function renderLeaf(entry: HelpEntry): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "help-leaf";

    const h = document.createElement("h2");
    h.className = "help-leaf-name";
    h.textContent = entry.name;
    wrap.appendChild(h);

    if (entry.signature) {
      const sig = document.createElement("div");
      sig.className = "help-leaf-sig";
      sig.textContent = entry.signature;
      wrap.appendChild(sig);
    }

    const blurb = document.createElement("p");
    blurb.className = "help-leaf-blurb";
    blurb.textContent = entry.blurb;
    wrap.appendChild(blurb);

    if (entry.meta && entry.meta.length > 0) {
      wrap.appendChild(renderMetaTable(entry.meta));
    }

    if (entry.body) {
      wrap.appendChild(renderBody(entry.body));
    }

    if (entry.examples.length > 0) {
      const exH = document.createElement("h3");
      exH.className = "help-section";
      exH.textContent = "Examples";
      wrap.appendChild(exH);
      for (const ex of entry.examples) wrap.appendChild(renderExample(ex.code, ex.caption));
    }

    if (entry.related.length > 0) {
      wrap.appendChild(renderRelated(entry.related));
    }

    return wrap;
  }

  function renderMetaTable(meta: Array<[string, string]>): HTMLElement {
    const tbl = document.createElement("table");
    tbl.className = "help-meta";
    for (const [k, v] of meta) {
      const tr = document.createElement("tr");
      const kd = document.createElement("td");
      kd.className = "k";
      kd.textContent = k;
      const vd = document.createElement("td");
      vd.className = "v";
      vd.textContent = v;
      tr.appendChild(kd);
      tr.appendChild(vd);
      tbl.appendChild(tr);
    }
    return tbl;
  }

  // Minimal markdown: split on blank lines into blocks; a block starting with
  // # is a heading, a block wrapped in ``` is a pre/code block, everything
  // else is a paragraph. Bullets (- ) render as a simple ul.
  function renderBody(src: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "help-body";
    const blocks = src.split(/\n\s*\n/);
    for (const raw of blocks) {
      const b = raw.trimEnd();
      if (!b) continue;
      if (b.startsWith("```")) {
        const pre = document.createElement("pre");
        pre.className = "help-code";
        pre.textContent = b.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```\s*$/, "");
        wrap.appendChild(pre);
        continue;
      }
      if (b.startsWith("# ")) {
        const h = document.createElement("h3");
        h.className = "help-section";
        h.textContent = b.slice(2).trim();
        wrap.appendChild(h);
        continue;
      }
      if (b.split("\n").every(l => l.trim().startsWith("- "))) {
        const ul = document.createElement("ul");
        ul.className = "help-bullets";
        for (const line of b.split("\n")) {
          const li = document.createElement("li");
          li.textContent = line.trim().slice(2);
          ul.appendChild(li);
        }
        wrap.appendChild(ul);
        continue;
      }
      const p = document.createElement("p");
      p.textContent = b;
      wrap.appendChild(p);
    }
    return wrap;
  }

  function renderExample(code: string, caption?: string): HTMLElement {
    const box = document.createElement("div");
    box.className = "help-example";
    if (caption) {
      const c = document.createElement("div");
      c.className = "help-example-caption";
      c.textContent = caption;
      box.appendChild(c);
    }
    const pre = document.createElement("pre");
    pre.className = "help-code";
    pre.textContent = code;
    box.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "help-copy";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try {
        const clip = (navigator as any).clipboard;
        if (clip && typeof clip.writeText === "function") {
          await clip.writeText(code);
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = "Copy"; }, 900);
        }
      } catch {
        // Silent: clipboard denied. The snippet is still visible to copy by hand.
      }
    });
    box.appendChild(btn);
    return box;
  }

  function renderRelated(paths: string[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "help-related";
    const h = document.createElement("h3");
    h.className = "help-section";
    h.textContent = "Related";
    wrap.appendChild(h);
    const ul = document.createElement("ul");
    ul.className = "help-related-list";
    for (const path of paths) {
      const entry = getEntry(path);
      if (!entry) continue; // defensive; tests guarantee this holds
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.className = "help-related-link";
      a.dataset.path = path;
      a.textContent = `${categoryLabel(entry.category)}: ${entry.name}`;
      a.addEventListener("click", (e) => { e.preventDefault(); go({ kind: "leaf", path }); });
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    return wrap;
  }

  function categoryLabel(id: CategoryId): string {
    return categories().find(c => c.id === id)?.title ?? id;
  }

  function go(next: View): void {
    view = next;
    if (next.kind !== "category") query = "";
    render();
  }

  render();

  return {
    refresh: render,
    goto(path: string) {
      const e = getEntry(path);
      if (!e) return;
      go({ kind: "leaf", path });
    },
    getView(): View {
      return view.kind === "leaf"
        ? { kind: "leaf", path: view.path }
        : view.kind === "list"
          ? { kind: "list", category: view.category }
          : { kind: "category" };
    },
  };
}

// Used for tests that want to assert coverage without hitting the DOM.
export { allEntries, search };
