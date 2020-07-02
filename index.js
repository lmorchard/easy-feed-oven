const LAZY_LOAD_THRESHOLD = 0.1;

async function main() {
  initLazyLoadObserver();
  initEventDelegation();
  pageChanged();

  console.log("READY.");
}

function pageChanged() {
  applyTimeAgo();
  updateLazyLoadObserver();
}

function applyTimeAgo() {
  timeago.cancel();
  timeago.render(document.querySelectorAll(".timeago"), "en_US", {
    minInterval: 10,
  });
}

function initEventDelegation() {
  document.body.addEventListener("click", async (ev) => {
    console.log("CLICK DELEGATION GO", ev);
    let target = ev.target;
    while (target) {
      if (/a/i.test(target.tagName) && target.classList.contains("load-href")) {
        console.log("LOADER CLICK GO", ev);
        return handleLoaderClick(ev, target);
      }
      target = target.parentNode;
    }
  });
}

async function handleLoaderClick(ev, target) {
  ev.preventDefault();
  ev.stopPropagation();
  await replaceElementWithHTMLResource(
    target.parentNode,
    target.getAttribute("href")
  );
}

async function replaceElementWithHTMLResource(element, href) {
  if (element.classList.contains("loading")) {
    return;
  }
  element.classList.add("loading");
  element.setAttribute("disabled", true);

  const response = await fetch(href);
  const content = await response.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  const loadedNodes = Array.from(doc.body.children);

  const parent = element.parentNode;
  for (const node of loadedNodes) {
    parent.insertBefore(document.adoptNode(node), element);
  }

  element.remove();
  pageChanged();
}

let lazyLoadObserver;
function initLazyLoadObserver() {
  lazyLoadObserver = new IntersectionObserver(handleAllLazyLoadIntersections, {
    threshold: LAZY_LOAD_THRESHOLD,
  });
}

function updateLazyLoadObserver() {
  lazyLoadObserver.disconnect();
  const toObserve = document.querySelectorAll(".lazy-load");
  for (const element of toObserve) {
    lazyLoadObserver.observe(element);
  }
}

function handleAllLazyLoadIntersections(entries) {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      handleLazyLoadIntersection(entry);
    }
  }
}

async function handleLazyLoadIntersection({ target }) {
  if (/img/i.test(target.tagName)) {
    const src = target.getAttribute("data-src");
    if (src) {
      target.setAttribute("src", src);
      target.removeAttribute("data-src");
    }
  }

  if (target.classList.contains("load-href")) {
    await replaceElementWithHTMLResource(
      target.parentNode,
      target.getAttribute("href")
    );
  }
}

document.addEventListener("DOMContentLoaded", (event) => {
  main().catch((err) => console.error(err));
});
