// Help pane state machine: category → list → leaf → back, and search result
// click lands on the right leaf with the breadcrumb set correctly.

import { describe, it, expect, beforeEach } from "vitest";
import { mountHelpPane } from "../../../src/ui/help/help-pane.js";

function q(sel: string, root: Element = document.body): HTMLElement | null {
  return root.querySelector(sel) as HTMLElement | null;
}
function qAll(sel: string, root: Element = document.body): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[];
}

describe("help pane navigation", () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("opens on the category view", () => {
    const h = mountHelpPane(container);
    expect(h.getView()).toEqual({ kind: "category" });
    const rows = qAll(".help-row-name", container);
    expect(rows.map(r => r.textContent)).toContain("Commands");
  });

  it("drills category → list → leaf", () => {
    const h = mountHelpPane(container);
    // Click the Commands category row
    const commandsRow = qAll(".help-row-link", container)
      .find(a => a.querySelector(".help-row-name")?.textContent === "Commands")!;
    commandsRow.click();
    expect(h.getView()).toEqual({ kind: "list", category: "commands" });

    // Click the attack row in the list
    const attackRow = qAll(".help-row-link", container)
      .find(a => a.dataset.path === "commands/attack")!;
    attackRow.click();
    expect(h.getView()).toEqual({ kind: "leaf", path: "commands/attack" });

    // Leaf header present
    expect(q(".help-leaf-name", container)?.textContent).toBe("attack");
  });

  it("breadcrumb back goes category → list → leaf → back", () => {
    const h = mountHelpPane(container);
    h.goto("commands/cast");
    expect(h.getView()).toEqual({ kind: "leaf", path: "commands/cast" });
    // Breadcrumb has two links (HELP + Commands) and a current segment
    const crumbLinks = qAll(".help-crumb-link", container);
    expect(crumbLinks.length).toBe(2);
    crumbLinks[1]!.click(); // back to list
    expect(h.getView()).toEqual({ kind: "list", category: "commands" });

    // Now click HELP to return to categories
    const homeLink = qAll(".help-crumb-link", container)[0]!;
    homeLink.click();
    expect(h.getView()).toEqual({ kind: "category" });
  });

  it("search result click lands on leaf with breadcrumb", () => {
    const h = mountHelpPane(container);
    const input = q(".help-search-input", container) as HTMLInputElement;
    input.value = "firebolt";
    input.dispatchEvent(new Event("input"));
    const hitLink = qAll(".help-row-link", container)
      .find(a => a.dataset.path === "spells/firebolt");
    expect(hitLink).toBeDefined();
    hitLink!.click();
    expect(h.getView()).toEqual({ kind: "leaf", path: "spells/firebolt" });
    const crumb = qAll(".help-crumb-link, .help-crumb-current", container)
      .map(e => e.textContent);
    expect(crumb).toEqual(["HELP", "Spells", "firebolt"]);
  });

  it("isSpellVisible hides unknown spells from the spells list", () => {
    const h = mountHelpPane(container, { isSpellVisible: (n) => n === "bolt" });
    h.goto("spells/bolt"); // direct goto still works
    // Navigate back to the spells list via breadcrumb
    const crumbLinks = qAll(".help-crumb-link", container);
    crumbLinks[1]!.click();
    const visibleNames = qAll(".help-row-name", container).map(e => e.textContent);
    expect(visibleNames).toContain("bolt");
    expect(visibleNames).not.toContain("firebolt");
    expect(visibleNames).not.toContain("heal");
  });

  it("isSpellVisible filters search results", () => {
    mountHelpPane(container, { isSpellVisible: (n) => n === "bolt" });
    const input = q(".help-search-input", container) as HTMLInputElement;
    input.value = "bolt";
    input.dispatchEvent(new Event("input"));
    const hitPaths = qAll(".help-row-link", container).map(a => a.dataset.path);
    expect(hitPaths).toContain("spells/bolt");
    expect(hitPaths).not.toContain("spells/firebolt");
  });

  it("empty spells list shows a hint", () => {
    mountHelpPane(container, { isSpellVisible: () => false });
    const h = mountHelpPane(container, { isSpellVisible: () => false });
    h.goto("spells/bolt");
    const crumbLinks = qAll(".help-crumb-link", container);
    crumbLinks[1]!.click();
    expect(q(".help-empty", container)?.textContent).toMatch(/haven't learned/i);
  });

  it("related link navigates to another leaf", () => {
    const h = mountHelpPane(container);
    h.goto("commands/cast");
    const relatedLinks = qAll(".help-related-link", container);
    expect(relatedLinks.length).toBeGreaterThan(0);
    // Click the first related link — it should route to a real leaf.
    const targetPath = relatedLinks[0]!.dataset.path!;
    relatedLinks[0]!.click();
    expect(h.getView()).toEqual({ kind: "leaf", path: targetPath });
  });
});
