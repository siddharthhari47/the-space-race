const CATEGORIES = {
  commercial: { label: "Commercial", available: true },
  military: { label: "Military", available: false },
  private: { label: "Private", available: false },
  // Cargo has a real model now, but it lives on its own page rather than
  // swapping into this canvas (see the note below on why), so the tab
  // points there instead of claiming to be coming soon.
  cargo: {
    label: "Cargo",
    available: false,
    page: "/flight-lab/interactive-cargo-aircraft.html",
  },
};

// This canvas only mounts the commercial model. Selecting another category
// surfaces an honest note rather than swapping the model — there's no
// separate mount() to call here the way expandable-diagram had a load()
// method; the R3F scene is a single always-on canvas bound to one
// data-model attribute. Categories that do have a model elsewhere link out
// to it; the rest say plainly that they don't exist yet.
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
      if (config.page) {
        note.innerHTML =
          `${config.label} aircraft have their own explorer: ` +
          `<a href="${config.page}">open it here</a>. ` +
          `This canvas stays on the commercial model.`;
      } else {
        note.textContent = `${config.label} aircraft are coming soon. Here's the commercial model in the meantime.`;
      }
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
