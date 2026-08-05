class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer class="site-footer">
        <p>Written by Siddharth Hariharan &middot; <a href="mailto:info@mysite.com">info@mysite.com</a></p>
        <p>&copy; 2026 The Space Race. All rights reserved.</p>
      </footer>
    `;
  }
}

customElements.define("site-footer", SiteFooter);
