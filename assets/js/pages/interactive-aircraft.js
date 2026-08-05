const CATEGORIES = {
  commercial: {
    label: "Commercial",
    src: "/assets/images/aircraft-commercial.svg",
    data: "/assets/data/aircraft-pins-commercial.json",
    alt: "Side view illustration of a commercial twin-engine airliner",
    available: true,
  },
  military: { label: "Military", available: false },
  private: { label: "Private", available: false },
  cargo: { label: "Cargo", available: false },
};

function init() {
  const tabs = Array.from(document.querySelectorAll(".category-tab"));
  const diagram = document.querySelector("#aircraft-diagram");
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
      note.textContent = `${config.label} aircraft are coming soon — here's the commercial explorer in the meantime.`;
      return;
    }

    note.hidden = true;
    diagram.load(config.src, config.data, config.alt);
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
