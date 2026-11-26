const links = [
  ["Company website", "https://hephzibahbehulah.com/"],
  ["Facebook", "https://www.facebook.com/Hephzibahbehulah/"],
  ["X", "https://x.com/HephzibaBehulah"],
  ["Instagram", "https://www.instagram.com/hephzibahbehulah/"],
  ["TikTok", "https://www.tiktok.com/@hephzibahbhehulah"],
  ["LinkedIn", "https://www.linkedin.com/in/isaacoluwoleadigun/"],
];

const footer = document.createElement("footer");
footer.className = "hb-company-footer";
footer.setAttribute("aria-label", "Hephzibah Behulah company links");

const identity = document.createElement("a");
identity.className = "hb-company-footer-identity";
identity.href = "https://hephzibahbehulah.com/";
identity.setAttribute("aria-label", "Hephzibah Behulah company website");

const logo = document.createElement("img");
logo.src = "./assets/hb-official.jpg";
logo.alt = "";
logo.width = 96;
logo.height = 24;
identity.append(logo);

const nav = document.createElement("nav");
nav.className = "hb-company-footer-links";
nav.setAttribute("aria-label", "Company contact and social links");

const contact = document.createElement("a");
contact.href = "mailto:isaacadigunoluwole@gmail.com";
contact.textContent = "Contact";
nav.append(contact);

for (const [label, href] of links) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  if (!href.startsWith("mailto:")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  nav.append(link);
}

const copyright = document.createElement("span");
copyright.className = "hb-company-footer-copy";
copyright.textContent = `© ${new Date().getFullYear()} HEPHZIBAH BEHULAH`;

footer.append(identity, nav, copyright);
document.body.append(footer);
