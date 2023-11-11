const LAZY_LOAD_THRESHOLD = 0.1;

async function main() {
  initLazyLoadObserver();
  initFeedTitleObserver();
  initEventDelegation();
  pageChanged();

  console.log("READY.");
}

function pageChanged() {
  applyTimeAgo();
  updateLazyLoadObserver();
  updateFeedTitleObserver();
}

function applyTimeAgo() {
  timeago.cancel();
  timeago.render(document.querySelectorAll(".timeago"), "en_US", {
    minInterval: 10,
  });
}

function initEventDelegation() {
  document.body.addEventListener("click", async (ev) => {
    // Start from the target and walk up through parents to look for
    // the real target we want to delegate. (i.e. click was on a span
    // within a link, but the link is the relevant target)
    let target = ev.target;
    while (target) {
      if (/a/i.test(target.tagName) && target.classList.contains("load-href")) {
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

let feedTitleObserver;
function initFeedTitleObserver() {
  feedTitleObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          handleFeedTitleIntersection(entry);
        }
      }
    },
    {
      threshold: 0.2,
    }
  );
}

function updateFeedTitleObserver() {
  feedTitleObserver.disconnect();
  const toObserve = document.querySelectorAll(".feed .title");
  for (const element of toObserve) {
    feedTitleObserver.observe(element);
  }
}

async function handleFeedTitleIntersection(entry) {
  // console.log(entry);
}

let lazyLoadObserver;
function initLazyLoadObserver() {
  lazyLoadObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          handleLazyLoadIntersection(entry);
        }
      }
    },
    {
      threshold: LAZY_LOAD_THRESHOLD,
    }
  );
}

function updateLazyLoadObserver() {
  lazyLoadObserver.disconnect();
  const toObserve = document.querySelectorAll(".lazy-load");
  for (const element of toObserve) {
    lazyLoadObserver.observe(element);
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
