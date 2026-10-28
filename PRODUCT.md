# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node + Socket.io + plain HTML/CSS/JS, no build step. Runs on the presenter's own machine (`npm start`), exposed to the class through Cloudflare Tunnel on the presenter's domain/subdomain. No third-party backends (no Supabase, Render, Firebase): all state lives in the Node process.

## Users

- **Presenter (one):** a student presenting "Procesamiento distribuido y ML sobre datos masivos (Apache Spark / MLlib)" to their class. Drives the activity from a laptop connected to the classroom projector.
- **Classmates (~30, must tolerate more):** technical students (informatics/database course) who just heard the presentation. They join from their phones (possibly some laptops) by scanning a QR code. They should have to *think*, not just tap.

## Product Purpose

A live classroom simulation where the class becomes a Spark cluster and trains a K-Means model together. The projector is the **Driver**; every phone is an **Executor** holding one partition of the dataset. Success: after ~15 minutes, students can explain partitions, tasks, map/combine/reduce, why only aggregates travel over the network (shuffle cost), stragglers, fault tolerance via lineage, and why Spark's in-memory caching beats Hadoop MapReduce for iterative ML.

## Positioning

The students are the cluster. Each concept is experienced by someone in the room, and the key decision (what to send to the driver: raw points, per-cluster averages, or sums + counts) has a wrong-but-tempting answer whose consequence is visible on the projector.

## Operating Context

- Classroom, projector; lighting unknown → the driver view needs a normal theme and a high-contrast theme toggle.
- Phones on mobile data or classroom Wi-Fi through a Cloudflare tunnel; reconnects must be tolerated.
- ~15 minutes total, presenter controls pacing from the driver view.
- Language: Spanish (Argentina, voseo).

## Capabilities and Constraints

- Rounds: (1) manual map — assign own points to nearest centroid; (2) choose what to send (points / averages / sums+counts) and compute it; driver reduces and moves centroids; (3) automatic "Spark mode" iterations; (4) chaos — presenter kills nodes, partitions are reassigned (lineage), stragglers visible; (5) Hadoop vs Spark timing (re-read data each iteration vs cache).
- Closing: equivalent PySpark/MLlib code mapped to what students did.
- Dataset is synthetic (generated clusters), labelled as such.
- Must work with zero installs on the student side.

## Brand Commitments

- Visual direction: the category standard (a clean cluster/monitoring console), executed at the craft level of Vercel and Linear. Chosen deliberately over themed worlds.
- Two display themes required: normal and high-contrast (for a lit classroom).

## Product Principles

1. Every concept is lived by a person, not narrated.
2. Wrong choices are allowed and their consequences are shown, not blocked.
3. The presenter is always in control of pacing.
4. Readable from the back of the room.
