// "Structure" tab: interactive file tree with filter, folder purposes, entry points and key files.
import { h, reducedMotion, render } from "../dom.js";
import { icon, reveal } from "../ui.js";
import { grow } from "./grow.js";

function flatten(n, out = []) {
  for (const c of n.children ?? []) {
    out.push(c);
    if (c.type === "dir") flatten(c, out);
  }
  return out;
}

function fileTone(name) {
  if (/^readme/i.test(name)) return "t-doc";
  if (/\.(md|mdx|rst|txt)$/i.test(name)) return "t-doc";
  if (/\.(json|ya?ml|toml|ini|lock|env.*)$|^\.|config\./i.test(name)) return "t-cfg";
  if (/\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|ai)$/i.test(name)) return "t-media";
  if (/\.(test|spec)\.|_test\.|^test_/i.test(name)) return "t-test";
  return "t-code";
}

const EASE_CSS = "var(--ease-out)";

/** Opens/closes a folder's children with a height + opacity transition (0.32s). */
function animateKids(ul, opening, done) {
  if (reducedMotion()) {
    done?.();
    return;
  }
  const full = ul.scrollHeight;
  ul.style.transition = "none";
  ul.style.height = opening ? "0px" : `${full}px`;
  ul.style.opacity = opening ? "0" : "1";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ul.style.transition = `height 0.32s ${EASE_CSS}, opacity 0.32s ${EASE_CSS}`;
      ul.style.height = opening ? `${full}px` : "0px";
      ul.style.opacity = opening ? "1" : "0";
    }),
  );
  // transitionend never fires when the height doesn't change (e.g. an empty folder), so also time out
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    ul.style.height = "";
    ul.style.transition = "";
    done?.();
  };
  ul.addEventListener("transitionend", (e) => e.propertyName === "height" && finish());
  setTimeout(finish, 450);
}

export function structureSection(r) {
  const s = r.structure;
  const first = (s.tree.children ?? []).find(
    (c) => c.type === "dir" && /^(src|source|app|lib|apps|packages|backend|frontend)$/.test(c.name),
  );
  let open = new Set(first ? [first.path] : []);
  let q = "";
  const entry = new Set(s.entryPoints.map((e) => e.path));
  const all = flatten(s.tree);
  const maxShare = Math.max(...s.folders.map((f) => f.share), 0.01);

  const scroll = h("div", { class: "tree-scroll" });

  function fileNode(node, depth) {
    return h(
      "li",
      { class: `tn file ${fileTone(node.name)}${entry.has(node.path) ? " entry" : ""}`, style: { "--d": depth } },
      icon("file", 14),
      h("span", { class: "tn-name" }, node.name),
      entry.has(node.path) && h("span", { class: "tn-tag" }, "entry"),
    );
  }

  function kids(node, depth) {
    return h(
      "ul",
      { class: "tn-kids" },
      (node.children ?? []).map((c) => treeNode(c, depth + 1)),
      node.more ? h("li", { class: "tn more", style: { "--d": depth + 1 } }, `… ${node.more} more`) : null,
      !node.children?.length && !node.more && node.files
        ? h("li", { class: "tn more", style: { "--d": depth + 1 } }, `${node.files} files (not expanded)`)
        : null,
    );
  }

  function treeNode(node, depth) {
    if (node.type === "file") return fileNode(node, depth);
    const isOpen = open.has(node.path);
    const chev = h("span", { class: "tn-chev", style: { transform: `rotate(${isOpen ? 90 : 0}deg)`, transition: `transform 0.25s ${EASE_CSS}` } }, icon("chevron", 13));
    const wrap = h("li", { class: "tn-dir-wrap" });
    let kidList = isOpen ? kids(node, depth) : null;
    const btn = h(
      "button",
      {
        type: "button",
        class: `tn dir${isOpen ? " open" : ""}`,
        style: { "--d": depth },
        "aria-expanded": String(isOpen),
        onclick: () => {
          const nowOpen = !open.has(node.path);
          if (nowOpen) open.add(node.path);
          else open.delete(node.path);
          btn.classList.toggle("open", nowOpen);
          btn.setAttribute("aria-expanded", String(nowOpen));
          chev.style.transform = `rotate(${nowOpen ? 90 : 0}deg)`;
          if (nowOpen) {
            kidList?.remove();
            kidList = kids(node, depth);
            wrap.append(kidList);
            animateKids(kidList, true);
          } else if (kidList) {
            const closing = kidList;
            kidList = null;
            animateKids(closing, false, () => closing.remove());
          }
        },
      },
      chev,
      icon("folder", 14),
      h("span", { class: "tn-name" }, node.name),
      h("span", { class: "tn-count" }, node.files),
    );
    wrap.append(btn);
    if (kidList) wrap.append(kidList);
    return wrap;
  }

  function drawTree() {
    const term = q.trim().toLowerCase();
    if (term) {
      const matches = all.filter((n) => n.path.toLowerCase().includes(term)).slice(0, 80);
      render(
        scroll,
        h(
          "ul",
          { class: "tree flat" },
          matches.length === 0 && h("li", { class: "tn more" }, `No files match "${q}"`),
          matches.map((n) => {
            const i = n.path.toLowerCase().indexOf(term);
            return h(
              "li",
              { class: `tn ${n.type} ${n.type === "file" ? fileTone(n.name) : ""}`, style: { "--d": 0 } },
              icon(n.type === "dir" ? "folder" : "file", 14),
              h(
                "span",
                { class: "tn-name" },
                n.path.slice(0, i),
                h("mark", null, n.path.slice(i, i + term.length)),
                n.path.slice(i + term.length),
              ),
            );
          }),
        ),
      );
      return;
    }
    render(
      scroll,
      h(
        "ul",
        { class: "tree" },
        (s.tree.children ?? []).map((c) => treeNode(c, 0)),
        s.tree.more ? h("li", { class: "tn more" }, `… ${s.tree.more} more`) : null,
      ),
    );
  }
  drawTree();

  const treeCard = reveal(
    h(
      "div",
      { class: "card tree-card" },
      h(
        "div",
        { class: "tree-top" },
        h("h3", { class: "sub-h" }, "Files"),
        h(
          "div",
          { class: "tree-actions" },
          h(
            "button",
            {
              type: "button",
              class: "mini",
              onclick: () => {
                open = new Set(all.filter((n) => n.type === "dir" && n.path.split("/").length <= 2).map((n) => n.path));
                drawTree();
              },
            },
            "Expand",
          ),
          h(
            "button",
            {
              type: "button",
              class: "mini",
              onclick: () => {
                open = new Set();
                drawTree();
              },
            },
            "Collapse",
          ),
        ),
      ),
      h(
        "label",
        { class: "tree-search" },
        h("span", { class: "sr-only" }, "Filter files"),
        h("input", {
          value: q,
          placeholder: "Filter files…",
          spellcheck: "false",
          oninput: (e) => {
            q = e.target.value;
            drawTree();
          },
        }),
      ),
      scroll,
    ),
  );

  return h(
    "section",
    { id: "structure", class: "rp-section", "aria-labelledby": "structure-h" },
    reveal(
      h(
        "div",
        null,
        h(
          "div",
          { class: "sec-head" },
          h("h2", { id: "structure-h" }, "Structure"),
          h("p", { class: "sec-note" }, `${s.totalFiles.toLocaleString()} files in ${s.totalDirs.toLocaleString()} folders`),
        ),
      ),
    ),
    h(
      "div",
      { class: "structure-grid" },
      treeCard,
      h(
        "div",
        { class: "structure-side" },
        reveal(
          h(
            "div",
            { class: "card" },
            h("h3", { class: "sub-h" }, "Where things live"),
            h(
              "ul",
              { class: "folders" },
              s.folders.map((f, i) =>
                h(
                  "li",
                  null,
                  h(
                    "div",
                    { class: "fd-top" },
                    h("code", null, f.path === "(root)" ? "(top level)" : `${f.path}/`),
                    h("span", { class: "fd-files" }, `${f.files} files`),
                  ),
                  h("span", { class: "fd-purpose" }, f.purpose),
                  h(
                    "span",
                    { class: "fd-bar", "aria-hidden": "true" },
                    grow(h("span"), { transform: "scaleX(0)" }, { transform: `scaleX(${f.share / maxShare})` }, { duration: 0.9, delay: 0.1 + i * 0.04 }),
                  ),
                ),
              ),
            ),
          ),
        ),
        s.entryPoints.length > 0 &&
          reveal(
            h(
              "div",
              { class: "card" },
              h("h3", { class: "sub-h" }, "Where it starts"),
              h(
                "ul",
                { class: "kv-list" },
                s.entryPoints.map((e) => h("li", null, h("code", null, e.path), h("span", null, e.why))),
              ),
            ),
            { delay: 0.05 },
          ),
        s.keyFiles.length > 0 &&
          reveal(
            h(
              "div",
              { class: "card" },
              h("h3", { class: "sub-h" }, "Key files"),
              h(
                "ul",
                { class: "kv-list" },
                s.keyFiles.map((k) => h("li", null, h("code", null, k.path), h("span", null, k.role))),
              ),
            ),
            { delay: 0.1 },
          ),
      ),
    ),
  );
}
