import { NAV_ITEMS } from "./nav-data.js";

function renderItem(item, current) {
  const isCurrent = item.id === current;

  if (item.children) {
    return `
      <li class="nav-item has-children">
        <button
          class="nav-trigger"
          type="button"
          aria-expanded="false"
          aria-controls="menu-${item.id}"
          ${isCurrent ? 'aria-current="true"' : ""}
        >
          ${item.label}
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="nav-dropdown" id="menu-${item.id}">
          <ul>
            ${item.children
              .map((child) => `<li><a href="${child.href}">${child.label}</a></li>`)
              .join("")}
          </ul>
        </div>
      </li>`;
  }

  return `
    <li class="nav-item">
      <a href="${item.href}" ${isCurrent ? 'aria-current="page"' : ""}>${item.label}</a>
    </li>`;
}

class SiteHeader extends HTMLElement {
  connectedCallback() {
    const current = this.getAttribute("current") || "";
    const logo = this.getAttribute("logo") || "/assets/images/logo.webp";
    const brandHref = this.getAttribute("brand-href") || "/index.html";

    this.innerHTML = `
      <header class="site-header">
        <div class="nav-inner">
          <a class="brand" href="${brandHref}">
            <img src="${logo}" alt="The Space Race logo" />
            <span>The Space Race</span>
          </a>
          <button
            class="nav-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="primary-nav"
            aria-label="Toggle navigation"
          >
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
            <span class="nav-toggle-bar"></span>
          </button>
          <nav class="site-nav" id="primary-nav" data-state="closed" aria-label="Primary">
            <ul class="nav-top">
              ${NAV_ITEMS.map((item) => renderItem(item, current)).join("")}
            </ul>
          </nav>
        </div>
      </header>
      <div class="nav-backdrop" data-state="closed"></div>
    `;

    this._wireUp();
  }

  _wireUp() {
    const toggle = this.querySelector(".nav-toggle");
    const nav = this.querySelector(".site-nav");
    const backdrop = this.querySelector(".nav-backdrop");
    const triggers = Array.from(this.querySelectorAll(".nav-trigger"));

    const closeMobileNav = () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.dataset.state = "closed";
      backdrop.dataset.state = "closed";
    };

    const openMobileNav = () => {
      toggle.setAttribute("aria-expanded", "true");
      nav.dataset.state = "open";
      backdrop.dataset.state = "open";
    };

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      isOpen ? closeMobileNav() : openMobileNav();
    });

    backdrop.addEventListener("click", closeMobileNav);

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
        trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (nav.dataset.state === "open") {
        closeMobileNav();
        toggle.focus();
        return;
      }

      const openTrigger = triggers.find((t) => t.getAttribute("aria-expanded") === "true");
      if (openTrigger) {
        openTrigger.setAttribute("aria-expanded", "false");
        openTrigger.focus();
      }
    });

    this.addEventListener("focusout", (event) => {
      if (this.contains(event.relatedTarget)) return;
      triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    });
  }
}

customElements.define("site-header", SiteHeader);
