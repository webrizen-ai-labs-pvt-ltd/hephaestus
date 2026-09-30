// Applies the saved theme before first paint (no flash). External file so the CSP needs no inline scripts.
(function () {
  var pref = "system";
  try { pref = localStorage.getItem("heph-theme") || "system"; } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
