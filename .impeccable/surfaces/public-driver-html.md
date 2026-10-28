---
version: 1
slug: "public-driver-html"
primary_target: "public/driver.html"
related_targets: ["public/worker.html"]
---

# Surface: Spark en el aula (driver + worker)

Scope: `public/driver.html` (projector, presenter laptop) and `public/worker.html` (student phones), served by `server.js`. Mode: Operate.

Audience/job: presenter runs ~15 min activity; ~30+ technical students act as executors and decide what to send. Constraints: Spanish voseo, readable from the back of a lit or dark room, normal + high-contrast theme, zero installs, reconnect-tolerant.

## Direction contract

THESIS: The category standard, played straight at Vercel/Linear craft: a cluster console that reads instantly as a working product. Refuses novelty skins and gamified confetti; the drama is the data moving.

OWN-WORLD: Near-black neutral ground (dark theme) with one blue interaction accent; three cluster colors (that also have shape: circle, square, triangle) that never collide with status colors (green ok, amber waiting, red failed). High-contrast theme: white ground, pure black ink, 2px strokes, same shapes. Geist-style precise sans + tabular mono for numbers only.

STORY: Students see their partition, assign points, choose what to send, and watch the projector reduce. They understand partitions, combine, shuffle cost, stragglers, lineage, caching.

FIRST VIEWPORT: Driver: top bar (title, round stepper, theme toggle, join QR); left 2/3 the K-Means scatter with centroids and their trails; right rail: executor grid (one cell per worker, status-colored) above the aggregation log and network bytes. Primary action (Next step / Run iteration) bottom-right of the rail. Worker: big executor id, partition range, the scatter of own points, then the send decision.

FORM: canon (category standard), Vercel/Linear quality bar; seed key c6906eb9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
