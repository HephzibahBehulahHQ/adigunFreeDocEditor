const themeButton = document.querySelector("#suite-theme-toggle");
const themeMeta = document.querySelector('meta[name="theme-color"]');
function applyTheme(value) {
  const theme = value === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  if (themeMeta) themeMeta.content = theme === "dark" ? "#0e1623" : "#0b1220";
  if (themeButton) {
    const dark = theme === "dark";
    themeButton.textContent = dark ? "☼" : "◐";
    themeButton.setAttribute("aria-pressed", String(dark));
    themeButton.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    themeButton.title = dark ? "Switch to light theme" : "Switch to dark theme";
  }
}
applyTheme(localStorage.getItem("adigun-theme"));
themeButton?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("adigun-theme", next);
  applyTheme(next);
});
window.addEventListener("storage", event => {
  if (event.key === "adigun-theme") applyTheme(event.newValue);
});
