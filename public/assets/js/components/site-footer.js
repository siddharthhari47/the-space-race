class SiteFooter extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer class="site-footer">
        <div class="footer-links">
          <a href="/about/index.html">About</a>
          <a href="/references/index.html">References</a>
        </div>
        <div class="footer-contact">
          <h3>Contact Me</h3>
          <p><a href="mailto:siddharth.hari47@gmail.com">siddharth.hari47@gmail.com</a></p>
          <p><a href="https://wa.me/918939358926" target="_blank" rel="noopener">WhatsApp: +91 89393 58926</a></p>
          <p class="footer-note">No calls, please &mdash; WhatsApp or email only.</p>
        </div>
        <p>Written by Siddharth Hariharan</p>
        <p>&copy; 2026 The Space Race. All rights reserved.</p>
      </footer>
    `;
  }
}

customElements.define("site-footer", SiteFooter);
