---
title: "Living Lamp"
description: "A lamp that — just like its owner — moves, responds, and evolves."
year: 2025
category: "Product Design"
tags: ["Arduino", "Metalwork", "Electronics", "Fusion 360", "Prototyping"]
order: 1
cover: "/images/living-lamp/lamp.jpg"
---

For my first-year Product Design finale I picked an ambitious brief to stretch my skills — and of every project this year, the lamp is the one I learnt the most from. Before it I'd never touched an Arduino, had only ever built a circuit in a physics class, and had spent almost no time in the metal workshop.

I chose a lamp over another table-tennis bat or wooden catapult because I wanted something I'd actually use, week in, week out — and something in constant use pushes me to make it the best object I can. The brief put *provenance* — an object's origin — front and centre, so I started in the library with books on cutting-edge materials like living leather and bioluminescent bacteria. The bigger influence was the then-unreleased game *Marathon*: its aesthetic of raw, just-out-of-the-factory functionality, and its theme of artificial life, shaped the project more than any single material. I wanted something with undeniable personality — not just another lamp.

## Making it move

While discussing the design with Mike, it was suggested I give the lamp movement with an Arduino. I had very little understanding of electronics, but a lamp that moved of its own volition was too appealing to ignore — and my brother, Tim Murray-Browne, a computational artist who works with AI, embodiment and interactive systems, confirmed it was not only possible but doable. So I started small: with a borrowed Arduino and ChatGPT explaining the wiring, I flashed the onboard LED, then powered an external one, then — after mistaking a three-wire servo for a stepper motor — finally got the servo turning. We had movement.

## Into the workshop

<section class="proj-row">
  <figure class="proj-media">
    <img loading="lazy" decoding="async" src="/images/living-lamp/workshop.jpg" alt="The lamp arm being shaped on a metal roller in the workshop" />
  </figure>
  <div class="proj-text">With the electronics proven, I moved on to building the lamp proper, spending most of my time in the metal workshop cutting the aluminium bar and steel pipe. My original plan was to weld the pipe to the bar, but their different melting points made that impossible — so I threaded the holes and simply screwed the pipes in instead.</div>
</section>

The hinges were the real headache. After consulting one lecturer, two technicians, two books, a company, three different ChatGPT models and roughly ten websites — and after five pages of sketches — I settled on two cylinders rotating on a shared axle, with a bolt pressing a little rubber against the axle for friction, so the lamp holds its position while staying adjustable.

<div class="carousel">
  <img loading="lazy" decoding="async" src="/images/living-lamp/hinge.jpg" alt="The finished hinge — two cylinders on a shared axle, running on a bearing" />
  <img loading="lazy" decoding="async" src="/images/living-lamp/snapped-tap.jpg" alt="A tap snapped off deep inside the silver-steel axle" />
</div>

Then the bump in the road. The axle was silver steel — dense, and feeling indestructible — so I threaded it with a regular steel tap. The tap snapped off deep inside, with zero chance of recovery. With no choice but to work around it, I switched to aluminium pipe for the axle, which came with the bonus of a ready-made hole.

## Five bases

<section class="proj-row proj-row--rev">
  <figure class="proj-media proj-media--a4">
    <img loading="lazy" decoding="async" src="/images/living-lamp/form-sketch.jpg" alt="A page of base-form ideas, from funky to plain" />
  </figure>
  <div class="proj-text">The brief asked for five products, and making five of these lamps was never realistic — so the five became five ways to mount one lamp. I sketched everything from the funky to the plain before narrowing it down.</div>
</section>

A flat base would have to be impractically heavy; a wall clamp commits you to one position; the wearable base — for paramedics and the like — was a fun tangent; a rail base could run the length of a desk. In the end I went with the clamp: light, easy to set up, and small enough to actually carry around.

<figure class="proj-full">
  <img loading="lazy" decoding="async" src="/images/living-lamp/bases-sketch.jpg" alt="Five base concepts: flat, wall clamp, wearable, rail and clamp" />
</figure>

## What I learnt

I didn't get everything I wanted. The plan had three phases — a lamp; then a lamp that makes the occasional pseudo-random movement; then a lamp that tracks and follows your hand — and at week 11 of 12, even phase one was looking optimistic. The lamp ended up on a fixed clamp rather than the rotating, gesture-following base I'd imagined.

Even so, it's the project I'm proudest of. I broke the ice with coding, electronics, mechanical design and metalwork all at once, and came away with real, quantifiable experience in each. The Living Lamp is far from over — it's become a passion project I'll keep building well past the deadline, learning robotics and AI as I go, until each lamp can respond to and evolve with its owner.
