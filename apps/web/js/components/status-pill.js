import { h } from "../dom.js";

const LABEL = {
  pending: "Queued",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

export function statusPill(status) {
  return h("span", { class: `pill pill-${status}` }, LABEL[status]);
}
