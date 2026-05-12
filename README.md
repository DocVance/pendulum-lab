# Pendulum Lab

A WebXR physics experiment for exploring **oscillation and pendulum mechanics**. Part of the **Scandrop Research Institute** physics lab suite.

## Overview

Attach any 3D object to the pendulum, set the length, release angle, mass, and damping, then let it swing. Observe how each variable affects the period of oscillation. Compare real-world measurements against the theoretical formula.

**Core concept:** `T = 2π√(L/g)` — The period of a pendulum depends only on its length and the local gravitational acceleration, not on its mass or the angle of release (for small angles).

## Experiment Features

- **Adjustable release angle** — 15°, 30°, 45°, 60°, 90°
- **Adjustable string length** — 1m, 2m, 3m, 5m
- **Damping control** — None, Low, High — simulates air resistance and friction
- **Mass selection** — 1 kg, 5 kg, 10 kg, 20 kg
- **Any model as the bob** — Attach any object from the model library to the pendulum arm
- **Attach / Release / Reset** — Full control over the swing cycle

## Running Locally

No build step required. Serve the folder with any static file server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve .
```

Then open `http://localhost:8080` in your browser.

## Controls

| Input | Action |
|---|---|
| `W A S D` | Walk |
| `G` | Toggle fly mode |
| `Tab` | Toggle model selector panel |
| `Left Click` | Grab / drag object |
| `H` | Toggle controls reference |
| VR controllers | Laser pointer interaction |

## The Science

**Pendulum period formula:**
```
T = 2π√(L / g)
```

Where:
- `T` = period in seconds (time for one full swing)
- `L` = string length in meters
- `g` = gravitational acceleration (9.81 m/s² on Earth)

| Length | Period on Earth |
|---|---|
| 1 m | ~2.0 s |
| 2 m | ~2.8 s |
| 3 m | ~3.5 s |
| 5 m | ~4.5 s |

**Key observation:** Changing the mass does not change the period. Changing the release angle has minimal effect for small angles (the small-angle approximation holds for θ < 15°).

## Tech Stack

- [A-Frame](https://aframe.io/) 1.4.2
- [A-Frame Extras](https://github.com/c-frame/aframe-extras)
- [Ammo.js](https://github.com/kripken/ammo.js/) — WASM physics
- [A-Frame Physics System](https://github.com/c-frame/aframe-physics-system)

## Related Labs

| Lab | Concept |
|---|---|
| [core-sandbox](https://github.com/DocVance/core-sandbox) | General physics sandbox hub |
| [gravity-lab](https://github.com/DocVance/gravity-lab) | Gravity & free fall |
| [friction-ramp](https://github.com/DocVance/friction-ramp) | Friction & inclined planes |
| [collision-arena](https://github.com/DocVance/collision-arena) | Momentum & collisions |
| [optics-bench](https://github.com/DocVance/optics-bench) | Light, reflection & refraction |
