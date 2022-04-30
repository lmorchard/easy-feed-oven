import "./lib/components.js";

async function main() {
}

document.addEventListener("DOMContentLoaded", () =>
  main()
    .then(() => console.log("READY."))
    .catch((err) => console.error(err))
);
