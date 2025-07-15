# 3D Tetris (Blockout) Project Summary

This document summarizes the plan, development process, and technical implementation of the 3D Tetris game we've built together.

---

## 1. The Plan

Our initial goal was to implement a 3D Tetris-like game (Blockout) using `three.js`. The plan was broken down into several phases:

- **Scene Setup**: Basic `three.js` scene with a camera, lights, and a renderer. Define the play area ("well").
- **Game Pieces**: Define piece shapes and a system for spawning them.
- **Game Logic**: Implement the core game loop, gravity, collision detection, piece locking, and layer clearing.
- **Controls**: Add keyboard controls for movement and rotation.
- **UI & Polish**: Display score, handle game over, and add polish.

---

## 2. What We've Done (Iterative Refinements)

We successfully built the game and then polished it through several iterations based on direct feedback:

- **Initial Implementation**: Created a functional game with a basic 3D view and keyboard controls (`n/o` for left/right, `i/e` for forward/back, `a/r/s` for rotations).
- **View & Depth Cues**:
  - Rejected an initial top-down `OrthographicCamera` in favor of a more classic, inclined `PerspectiveCamera` to give a better "pit" feel. We made this **camera position configurable**.
  - Added a "ghost piece" to show the final landing spot. We evolved this from a transparent solid to a yellow **wireframe outline** (`EdgesGeometry`) for superior visibility.
- **Game Feel & Mechanics**:
  - Implemented a **lock delay** to give the player a moment to slide or rotate a piece after it lands.
  - Added a **hard drop** feature on the **Spacebar** to instantly lock a piece in place.
  - Increased the well height to allow for longer gameplay.
- **Aesthetics & Visuals**:
  - Replaced the initial random piece shapes with a specific set: the **7 Soma cube pieces plus the 1x4 line and 2x2 square**.
  - Changed the color scheme to the **Solarized Dark palette**.
  - Replaced dynamic canvas-based walls with a **true 3D wireframe well** made of `LineSegments` for a crisp, clean look.
  - Added a **wall highlight** feature, where semi-transparent planes show the color of the nearest locked block, providing crucial information about hidden holes.
- **Bug Fixing**: We debugged and fixed several errors, including two `TypeError` / `ReferenceError` exceptions caused by incorrect initialization order and faulty loop logic in the wall rendering code.

---

## 3. How It Works (Technical Overview)

- **Engine**: The game is built entirely in a single `index.html` file using `three.js` via ES6 module imports from a CDN.
- **Game Grid**: A 3D array (`grid[x][y][z]`) acts as the logical representation of the well. It stores references to the `THREE.Mesh` objects of locked cubes, allowing for fast collision detection against already-placed pieces.
- **Pieces**: The active falling piece is a `THREE.Group` containing several cube `THREE.Mesh` objects. This allows the constituent cubes to be moved and rotated together as a single unit.
- **Collision Detection**: A `checkCollision()` function checks if any cube of the active piece is either outside the well's boundaries (x, y, or z) or occupies a cell that is already filled in the logical `grid`.
- **Rendering & Visuals**:
  - The main well is a static wireframe grid composed of `THREE.LineSegments` in a solarized cyan color.
  - The "shadow" highlights on the walls are implemented by dynamically creating and destroying semi-transparent `THREE.PlaneGeometry` meshes each time a piece is locked. This avoids the complexities and state-pollution issues we encountered when using a `CanvasTexture`.
  - Lighting is provided by an `AmbientLight` for fill and a `DirectionalLight` to cast shadows from the pieces, which adds to the sense of depth.
