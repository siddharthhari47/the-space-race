import { SIMULATOR_REGISTRY } from "/assets/js/simulators/registry.js";

const CATEGORY_ORDER = ["flight", "space", "engineering"];
const CATEGORY_LABELS = {
  flight: "Flight",
  space: "Space",
  engineering: "Engineering",
};

function groupByCategory() {
  const groups = {};
  Object.values(SIMULATOR_REGISTRY).forEach((meta) => {
    const category = meta.category || "other";
    groups[category] = groups[category] || [];
    groups[category].push(meta);
  });
  return groups;
}

function buildCard(meta) {
  const card = document.createElement("info-card");
  card.setAttribute("title", meta.title);
  if (meta.status === "live" && meta.page) {
    card.setAttribute("href", meta.page);
  } else {
    card.setAttribute("status", "coming-soon");
  }
  card.textContent = meta.description || "";
  return card;
}

function init() {
  const root = document.querySelector("[data-playground-root]");
  if (!root) return;

  const groups = groupByCategory();
  const order = CATEGORY_ORDER.filter((c) => groups[c]).concat(
    Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))
  );

  order.forEach((category) => {
    const header = document.createElement("section-header");
    header.setAttribute("title", CATEGORY_LABELS[category] || category);
    root.appendChild(header);

    const grid = document.createElement("feature-grid");
    groups[category].forEach((meta) => grid.appendChild(buildCard(meta)));
    root.appendChild(grid);
  });
}

init();
