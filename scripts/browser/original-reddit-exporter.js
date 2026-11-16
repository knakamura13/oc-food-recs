// Original exporter supplied by Kyle Nakamura on 2026-10-05.
// Preserved verbatim below. Manual reference only; reusable automation uses
// capture-reddit-thread.js to return HTML without touching the clipboard.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const SETTLE_MS = 1200;   // pause after each round for content to lazy-load
  const MAX_ROUNDS = 300;   // hard cap so we never loop forever
  const STABLE_TARGET = 3;  // consecutive no-change rounds before we stop

  const clicked = new WeakSet(); // don't re-click the same button

  // Three shapes of expander, two different nestings:
  //  - nested "more replies": <button><faceplate-tracker noun="more_replies">
  //  - top-level "View more comments": <faceplate-partial src=".../more-comments..."> wrapping a <button>
  //    (trackers noun="view_more_comments"/"load_more_comments" sit ABOVE the button)
  // :not([aria-hidden="true"]) skips the duplicate button in the partial's loading slot.
  const EXPANDER_SELECTORS = [
    'button:not([aria-hidden="true"]):has(faceplate-tracker[noun*="more_replies"])',
    'button:not([aria-hidden="true"]):has(faceplate-tracker[noun*="more_comments"])',
    'faceplate-partial[src*="more-comments"] button:not([aria-hidden="true"])'
  ];

  const expand = () => {
    const buttons = new Set();
    for (const sel of EXPANDER_SELECTORS) {
      document.querySelectorAll(sel).forEach((b) => {
        if (!clicked.has(b)) buttons.add(b);
      });
    }
    buttons.forEach((b) => {
      clicked.add(b);
      b.click();
    });
    return buttons.size;
  };

  let stable = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const before = document.body.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    const expanded = expand();
    await sleep(SETTLE_MS);
    const after = document.body.scrollHeight;

    const changed = after > before || expanded > 0;
    stable = changed ? 0 : stable + 1;
    console.log(
      `round ${round}: height ${before}→${after}, expanded ${expanded}, stable ${stable}/${STABLE_TARGET}`
    );
    if (stable >= STABLE_TARGET) break;
  }

  window.scrollTo(0, 0);
  await sleep(300);

  const main = document.querySelector('#main-content');
  if (!main) {
    console.error('❌ #main-content not found — nothing to copy.');
    return;
  }
  const html = main.outerHTML;
  const kb = (html.length / 1024).toFixed(0);

  try {
    await navigator.clipboard.writeText(html);
    console.log(`✅ Copied #main-content to clipboard (${kb} KB).`);
  } catch (err) {
    // Console clipboard writes fail if the page isn't focused — fall back to a download.
    console.warn('Clipboard blocked, downloading instead:', err.message);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'reddit-thread.html';
    a.click();
    URL.revokeObjectURL(a.href);
    console.log(`💾 Downloaded reddit-thread.html (${kb} KB).`);
  }
})();
