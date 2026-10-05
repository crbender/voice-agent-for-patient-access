"use strict";

(() => {
  const requestedTheme = new URLSearchParams(window.location.search).get("theme");
  const theme = requestedTheme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
})();
