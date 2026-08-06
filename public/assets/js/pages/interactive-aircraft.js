const CATEGORIES = {
  commercial: { label: "Commercial", available: true },
  military: { label: "Military", available: false },
  private: { label: "Private", available: false },
  cargo: { label: "Cargo", available: false },
};

// The 3D viewer only has a commercial model this pass. Selecting another
// category just surfaces an honest note rather than swapping the model —
// there's no separate mount() to call here the way expandable-diagram had
// a load() method; the R3F scene is a single always-on canvas.
function init() {
  const tabs = Array.from(document.querySelectorAll(".category-tab"));
  const note = document.querySelector(".category-note");
  const switcher = document.querySelector(".category-switcher");

  function selectTab(tab) {
    const config = CATEGORIES[tab.dataset.category];

    tabs.forEach((t) => {
      const isSelected = t === tab;
      t.setAttribute("aria-selected", String(isSelected));
      t.setAttribute("tabindex", isSelected ? "0" : "-1");
    });

    if (!config.available) {
      note.hidden = false;
      note.textContent = `${config.label} aircraft are coming soon — here's the commercial model in the meantime.`;
      return;
    }

    note.hidden = true;
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab)));

  switcher.addEventListener("keydown", (event) => {
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    tabs[nextIndex].focus();
    selectTab(tabs[nextIndex]);
  });
}

init();
