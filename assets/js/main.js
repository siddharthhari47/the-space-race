// Highlight the current page in the nav bar.
document.querySelectorAll("nav.site-nav a").forEach((link) => {
  if (link.getAttribute("href") === location.pathname.split("/").pop() ||
      (location.pathname.endsWith("/") && link.getAttribute("href") === "index.html")) {
    link.classList.add("active");
  }
});
