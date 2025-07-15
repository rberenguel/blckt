import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js";

// --- Configuration ---
const WELL_DIMS = { width: 6, height: 12, depth: 5 };
const TICK_RATE_MS = 800;
const LOCK_DELAY_MS = 500;
const CAMERA_CONFIG = {
  pos: new THREE.Vector3(0, WELL_DIMS.height * 1.8, 0),
  lookAt: new THREE.Vector3(0, WELL_DIMS.height * 0.35, 0),
};

// --- Core Components ---
let scene, camera, renderer, clock, dirLight;
let activePiece = null,
  ghostPiece = null;
let grid = [],
  staticMeshes = new THREE.Group(),
  wallHighlights = new THREE.Group();
let score = 0,
  lastTick = 0,
  lockDelayTimer = 0;
let isTouchingFloor = false,
  gameOver = false;
  let isAnimating = false;

// --- Piece Definitions & Materials ---
const PIECES = [
  {
    color: 0x2aa198,
    shape: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ],
  }, // Cyan
  {
    color: 0xb58900,
    shape: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  }, // Yellow
  {
    color: 0x6c71c4,
    shape: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
  }, // Violet
  {
    color: 0xcb4b16,
    shape: [
      [-1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
      [1, 0, 0],
    ],
  }, // Orange
  {
    color: 0x859900,
    shape: [
      [-1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  }, // Green
  {
    color: 0x268bd2,
    shape: [
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  }, // Blue
  {
    color: 0xdc322f,
    shape: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  }, // Red
  {
    color: 0xd33682,
    shape: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  }, // Magenta
  {
    color: 0x839496,
    shape: [
      [0, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  }, // Base0
];

// Colors for committed layers, using the Solarized palette from PIECES
const LAYER_COLORS = PIECES.map((p) => p.color);

// Material for the active (falling) piece wireframe
const activeWireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xfdf6e3,
}); // Solarized Base3 (White)
const committedWireframeMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
// Material cache for the wall highlights
const highlightMaterials = {};
LAYER_COLORS.forEach((color) => {
  highlightMaterials[color.toString(16).padStart(6, "0")] =
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
});

const baseBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const ghostWireframeMaterial = new THREE.LineBasicMaterial({ color: 0xb58900 });

function init() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  scene.add(staticMeshes, wallHighlights);

  camera = new THREE.PerspectiveCamera(
    30, // Field of view
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.copy(CAMERA_CONFIG.pos);
  camera.lookAt(CAMERA_CONFIG.lookAt);

  renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("#bg"),
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x333333);

  scene.add(new THREE.AmbientLight(0x93a1a1));
  dirLight = new THREE.DirectionalLight(0xfdf6e3, 0.8);
  dirLight.position.set(WELL_DIMS.width, WELL_DIMS.height, WELL_DIMS.depth);
  dirLight.castShadow = true;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  grid = Array.from({ length: WELL_DIMS.width }, () =>
    Array.from({ length: WELL_DIMS.height }, () =>
      Array(WELL_DIMS.depth).fill(null),
    ),
  );

  createWireframeWell();

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", onWindowResize);
  renderer.domElement.addEventListener("touchstart", onTouchStart, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchmove", onTouchMove, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchend", onTouchEnd);

  spawnPiece();
  animate();
}

function createWireframeWell() {
  const w = WELL_DIMS.width,
    h = WELL_DIMS.height,
    d = WELL_DIMS.depth;
  const hw = w / 2,
    hd = d / 2;
  const points = [];

  // Horizontal lines
  for (let y = 0; y <= h; y++) {
    points.push(-hw, y - 0.5, -hd, hw, y - 0.5, -hd);
    points.push(-hw, y - 0.5, hd, hw, y - 0.5, hd);
    points.push(-hw, y - 0.5, -hd, -hw, y - 0.5, hd);
    points.push(hw, y - 0.5, -hd, hw, y - 0.5, hd);
  }
  // Vertical lines
  for (let x = -hw; x <= hw; x++) {
    points.push(x, -0.5, -hd, x, h - 0.5, -hd);
    points.push(x, -0.5, hd, x, h - 0.5, hd);
  }
  for (let z = -hd; z <= hd; z++) {
    points.push(-hw, -0.5, z, -hw, h - 0.5, z);
    points.push(hw, -0.5, z, hw, h - 0.5, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  const material = new THREE.LineBasicMaterial({ color: 0x2aa198 }); // Solarized Cyan
  const wireframe = new THREE.LineSegments(geometry, material);
  scene.add(wireframe);
}

function updateWallHighlights() {
    wallHighlights.clear();
    const w = WELL_DIMS.width, h = WELL_DIMS.height, d = WELL_DIMS.depth;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const planeGeom = new THREE.PlaneGeometry(1, 1);

    const addHighlight = (x, y, z, color, wall) => {
        const material = highlightMaterials[color.getHexString()];
        if (!material) return; // Failsafe if color not found

        const plane = new THREE.Mesh(planeGeom, material);
        // Adjust position based on wall
        switch(wall) {
            case 'left':
                plane.position.set(-hw - 0.01, y, z - hd + 0.5);
                plane.rotation.y = Math.PI / 2;
                break;
            case 'right':
                plane.position.set(hw + 0.01, y, z - hd + 0.5);
                plane.rotation.y = -Math.PI / 2;
                break;
            case 'back':
                plane.position.set(x - hw + 0.5, y, -hd - 0.01);
                break;
        }
        wallHighlights.add(plane);
    };

    for (let y = 0; y < h; y++) {
        // Left Wall
        for (let z = 0; z < d; z++) {
            for (let x = 0; x < w; x++) {
                const group = grid[x][y][z];
                if (group) {
                    addHighlight(x, y, z, group.children[0].material.color, 'left');
                    break;
                }
            }
        }
        // Right Wall
        for (let z = 0; z < d; z++) {
            for (let x = w - 1; x >= 0; x--) {
                const group = grid[x][y][z];
                if (group) {
                    addHighlight(x, y, z, group.children[0].material.color, 'right');
                    break;
                }
            }
        }
         // Back Wall
         for (let x = 0; x < w; x++) {
            for (let z = 0; z < d; z++) {
                const group = grid[x][y][z];
                if (group) {
                    addHighlight(x, y, z, group.children[0].material.color, 'back');
                    break;
                }
            }
        }
    }
}

function spawnPiece() {
    if (gameOver) return;
    const pieceIndex = Math.floor(Math.random() * PIECES.length);
    activePiece = new THREE.Group();
    ghostPiece = new THREE.Group();

    const edgeGeom = new THREE.EdgesGeometry(baseBoxGeometry);

    for (const pos of PIECES[pieceIndex].shape) {
        // Active piece is just a white wireframe now
        const wireframe = new THREE.LineSegments(edgeGeom, activeWireframeMaterial);
        wireframe.position.set(...pos);
        wireframe.scale.set(0.99, 0.99, 0.99); // Scale down to prevent z-fighting
        activePiece.add(wireframe);

        // Ghost piece remains the same, but also scaled
        const ghostWireframeCube = new THREE.LineSegments(edgeGeom, ghostWireframeMaterial);
        ghostWireframeCube.position.set(...pos);
        ghostWireframeCube.scale.set(0.99, 0.99, 0.99); // Scale down for consistency
        ghostPiece.add(ghostWireframeCube);
    }

    // --- THIS IS THE FIX ---
    // Calculate spawn position to align with grid center, works for even/odd dimensions
    const spawnX = Math.floor(WELL_DIMS.width / 2) - (WELL_DIMS.width / 2 - 0.5);
    const spawnZ = Math.floor(WELL_DIMS.depth / 2) - (WELL_DIMS.depth / 2 - 0.5);
    activePiece.position.set(spawnX, WELL_DIMS.height - 3, spawnZ);
    // ----------------------

    scene.add(activePiece, ghostPiece);
    if (checkCollision(activePiece)) {
        gameOver = true;
        document.getElementById('game-over').style.display = 'block';
        scene.remove(activePiece, ghostPiece);
    } else {
        updateGhostPiece();
    }
}

function lockPiece() {
    const tempVec = new THREE.Vector3();
    const edgeGeom = new THREE.EdgesGeometry(baseBoxGeometry);

    // Iterate through the wireframe segments of the active piece
    activePiece.children.forEach(wireframeCube => {
        wireframeCube.getWorldPosition(tempVec);
        const [gx, gy, gz] = worldToGrid(tempVec);

        if (grid[gx]?.[gy] !== undefined && gy >= 0) {
            // Determine color based on the Y-level (layer)
            const layerColor = LAYER_COLORS[gy % LAYER_COLORS.length];
            const staticMaterial = new THREE.MeshStandardMaterial({ color: layerColor });

            // Create the solid cube and its black wireframe
            const staticCube = new THREE.Mesh(baseBoxGeometry, staticMaterial);
            staticCube.castShadow = true;
            const staticWireframe = new THREE.LineSegments(edgeGeom, committedWireframeMaterial);
            
            // --- THIS IS THE FIX ---
            // Scale the wireframe slightly larger to sit outside the cube
            staticWireframe.scale.set(1.01, 1.01, 1.01);

            // Group the cube and its wireframe together
            const cubeletGroup = new THREE.Group();
            cubeletGroup.add(staticCube);
            cubeletGroup.add(staticWireframe);
            cubeletGroup.position.copy(tempVec);

            // Add the group to the grid and the scene
            grid[gx][gy][gz] = cubeletGroup;
            staticMeshes.add(cubeletGroup);
        }
    });

    scene.remove(activePiece, ghostPiece);
    activePiece = ghostPiece = null;
    checkAndClearLayers();
    updateWallHighlights();
    spawnPiece();
    isTouchingFloor = false;
    lockDelayTimer = 0;
}

function checkAndClearLayers() {
    let layersCleared = 0;
    for (let y = 0; y < WELL_DIMS.height; y++) {
        let isFull = true;
        for (let x = 0; x < WELL_DIMS.width; x++) {
            for (let z = 0; z < WELL_DIMS.depth; z++) {
                if (!grid[x][y][z]) {
                    isFull = false;
                    break;
                }
            }
            if (!isFull) break;
        }
        if (!isFull) continue;

        layersCleared++;
        for (let x = 0; x < WELL_DIMS.width; x++) {
            for (let z = 0; z < WELL_DIMS.depth; z++) {
                const cubeletGroup = grid[x][y][z];
                if (!cubeletGroup) continue;

                // Properly dispose of the group's children (cube and wireframe)
                cubeletGroup.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });

                staticMeshes.remove(cubeletGroup);
                grid[x][y][z] = null;
            }
        }

        // Shift layers down
        for (let yi = y; yi < WELL_DIMS.height - 1; yi++) {
            for (let x = 0; x < WELL_DIMS.width; x++) {
                for (let z = 0; z < WELL_DIMS.depth; z++) {
                    const groupToMove = grid[x][yi + 1][z];
                    grid[x][yi][z] = groupToMove;
                    if (groupToMove) {
                        groupToMove.position.y--;
                    }
                }
            }
        }
        y--; // Re-check the current layer index since we shifted everything down
    }
    if (layersCleared > 0) {
        score += (100 * layersCleared) * layersCleared;
        document.getElementById('score').innerText = score;
    }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function worldToGrid(worldPos) {
  return [
    Math.round(worldPos.x + (WELL_DIMS.width / 2 - 0.5)),
    Math.round(worldPos.y - 0.5),
    Math.round(worldPos.z + (WELL_DIMS.depth / 2 - 0.5)),
  ];
}

function updateGhostPiece() {
  if (!activePiece) return;
  ghostPiece.position.copy(activePiece.position);
  ghostPiece.quaternion.copy(activePiece.quaternion);
  while (!checkCollision(ghostPiece)) ghostPiece.position.y--;
  ghostPiece.position.y++;
}

function checkCollision(piece) {
  const tempVec = new THREE.Vector3();
  for (const cube of piece.children) {
    cube.getWorldPosition(tempVec);
    const [gx, gy, gz] = worldToGrid(tempVec);
    if (
      gy < 0 ||
      gy >= WELL_DIMS.height ||
      gx < 0 ||
      gx >= WELL_DIMS.width ||
      gz < 0 ||
      gz >= WELL_DIMS.depth
    )
      return true;
    if (grid[gx]?.[gy]?.[gz]) return true;
  }
  return false;
}

function animate() {
  TWEEN.update();
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (gameOver || !activePiece) {
    renderer.render(scene, camera);
    return;
  }
  lastTick += delta;
  if (isTouchingFloor) lockDelayTimer += delta;

  if (lockDelayTimer > LOCK_DELAY_MS / 1000) {
    lockPiece();
  } else if (lastTick > TICK_RATE_MS / 1000) {
    lastTick = 0;
    activePiece.position.y--;
    if (checkCollision(activePiece)) {
      activePiece.position.y++;
      isTouchingFloor = true;
      if (lockDelayTimer === 0) lockDelayTimer = 0.001;
    } else {
      isTouchingFloor = false;
      lockDelayTimer = 0;
    }
  }
  renderer.render(scene, camera);
}
// --- Touch Control Globals & Constants ---
const TAP_THRESHOLD_MS = 200;
const SWIPE_THRESHOLD_MS = 500;
const DRAG_SENSITIVITY = 40; // Pixels of drag to move one grid unit
const SWIPE_DISTANCE_THRESHOLD = 50; // Min pixels for a swipe
let touchStartX = 0,
  touchStartY = 0,
  touchStartTime = 0;
let cumulativeDragY = 0;
let isDragging = false;

// --- Refactored Action Handlers (for both Keyboard and Touch) ---

function movePiece(x, y, z) {
  if (!activePiece || gameOver || isAnimating) return false;
  activePiece.position.add(new THREE.Vector3(x, y, z));
  if (checkCollision(activePiece)) {
    activePiece.position.sub(new THREE.Vector3(x, y, z));
    return false;
  }
  // On successful move, reset lock delay if piece was on the floor
  if (isTouchingFloor) lockDelayTimer = 0;
  updateGhostPiece();
  return true;
}

function rotatePiece(axis, angle) {
    if (!activePiece || gameOver || isAnimating) return false;

    // Create a clone to calculate the final valid rotation and position
    const clone = activePiece.clone();
    clone.position.copy(activePiece.position); // Ensure clone is at the right spot
    clone.rotateOnWorldAxis(axis, angle);

    let targetPosition = activePiece.position.clone();
    let isValidMove = false;

    // Check if the new rotation is valid as-is
    if (!checkCollision(clone)) {
        isValidMove = true;
    } else {
        // If not, try "wall kicking" the clone to find a valid spot
        const kicks = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
        ];
        for (const kick of kicks) {
            clone.position.add(kick);
            if (!checkCollision(clone)) {
                isValidMove = true;
                targetPosition.copy(clone.position); // This is our new target
                break;
            }
            clone.position.sub(kick); // Revert test
        }
    }

    // If a valid final state was found, animate to it
    if (isValidMove) {
        isAnimating = true;
        const duration = 150; // Animation time in milliseconds
        const targetQuaternion = clone.quaternion;

        new TWEEN.Tween(activePiece.position)
            .to(targetPosition, duration)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();

        new TWEEN.Tween(activePiece.quaternion)
            .to(targetQuaternion, duration)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(updateGhostPiece) // Keep ghost updated during animation
            .onComplete(() => {
                isAnimating = false;
                // Snap to final values for precision
                activePiece.position.copy(targetPosition);
                activePiece.quaternion.copy(targetQuaternion);
                if (isTouchingFloor) lockDelayTimer = 0;
                updateGhostPiece();
            })
            .start();

        return true;
    }

    return false; // The rotation was not possible
}

function hardDrop() {
  if (!activePiece || gameOver || isAnimating) return;
  activePiece.position.copy(ghostPiece.position);
  lockPiece();
}

// --- REPLACEMENT for handleKeyDown ---

function handleKeyDown(event) {
  if (!activePiece || gameOver) return;

  if (event.code === "Space") {
    event.preventDefault();
    hardDrop();
    return;
  }

  switch (event.key.toLowerCase()) {
    case "n":
      movePiece(-1, 0, 0);
      break; // Left
    case "o":
      movePiece(1, 0, 0);
      break; // Right
    case "i":
      movePiece(0, 0, -1);
      break; // Forward
    case "e":
      movePiece(0, 0, 1);
      break; // Back
    case "s":
      rotatePiece(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      break; // Z-axis
    case "r":
      rotatePiece(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      break; // Y-axis
    case "a":
      rotatePiece(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      break; // X-axis
  }
}

// --- NEW Touch Handlers ---

function onTouchStart(event) {
  event.preventDefault();
  if (!activePiece || gameOver || isAnimating) return;

  // Z-axis rotation on two-finger tap
  if (event.touches.length === 2) {
    rotatePiece(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    return;
  }

  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = clock.getElapsedTime();
  cumulativeDragY = 0;
  isDragging = true;
}

function onTouchMove(event) {
  event.preventDefault();
  if (!isDragging || !activePiece || gameOver || event.touches.length > 1 || isAnimating)
    return;

  const touch = event.touches[0];
  const deltaY = touch.clientY - touchStartY;
  cumulativeDragY += deltaY;

  const moveThreshold = DRAG_SENSITIVITY;
  const isLeftSide = touchStartX < window.innerWidth / 2;

  // Move piece every time drag crosses the sensitivity threshold
  if (Math.abs(cumulativeDragY) > moveThreshold) {
    const steps = Math.floor(cumulativeDragY / moveThreshold);
    if (isLeftSide) {
      // Left side drag moves on X-axis
      movePiece(steps, 0, 0);
    } else {
      // Right side drag moves on Z-axis
      movePiece(0, 0, steps);
    }
    cumulativeDragY %= moveThreshold;
  }
  // Update touchStartY for next delta calculation to be relative
  touchStartY = touch.clientY;
}

function onTouchEnd(event) {
  if (!isDragging || !activePiece || gameOver) return;
  isDragging = false;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const deltaTime = clock.getElapsedTime() - touchStartTime;

  // 1. Check for Hard Drop (fast downward swipe)
  if (
    deltaTime < SWIPE_THRESHOLD_MS &&
    deltaY > SWIPE_DISTANCE_THRESHOLD &&
    Math.abs(deltaY) > Math.abs(deltaX)
  ) {
    hardDrop();
    return;
  }

  // 2. Check for Tap (rotation)
  if (
    deltaTime < TAP_THRESHOLD_MS &&
    Math.abs(deltaX) < 20 &&
    Math.abs(deltaY) < 20
  ) {
    const isLeftSide = touch.clientX < window.innerWidth / 2;
    if (isLeftSide) {
      // Left side tap: Y-axis rotation
      rotatePiece(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    } else {
      // Right side tap: X-axis rotation
      rotatePiece(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
  }
}
init();
