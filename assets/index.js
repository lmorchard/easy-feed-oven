async function main() {
  initTimeAgo();
  console.log("READY.");
}

const initTimeAgo = () => {
  timeago.cancel();
  timeago.render(document.querySelectorAll(".timeago"), "en_US", {
    minInterval: 10,
  });
}

document.body.addEventListener("click", async (ev) => {
  const target = ev.target;
  if (
    /a/i.test(target.tagName) &&
    target.classList.contains("load-href")
  ) {
    ev.preventDefault();
    target.setAttribute("disabled", true);

    const href = target.getAttribute("href");
    const response = await fetch(href);
    const content = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const loadedNodes = Array.from(doc.body.children);

    const container = target.parentNode;
    const parent = container.parentNode;
    for (const node of loadedNodes) {
      parent.insertBefore(document.adoptNode(node), container);
    }

    container.remove();
    initTimeAgo();
  }
});

main().catch(err => console.error(err));
