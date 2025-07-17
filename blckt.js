import * as THREE from "./libs/three.js";

// --- Configuration ---
const WELL_DIMS = { width: 5, depth: 5, height: 12 };
const TICK_RATE_MS = 1000;
const LOCK_DELAY_MS = 500;
const FAST_FALL_TICK_RATE_MS = 100;
const HOLD_DELAY_MS = 200;
const FPS_CAP = 30;
const FRAME_INTERVAL = 1000 / FPS_CAP;

const CAMERA_CONFIG = {
  pos: new THREE.Vector3(0, WELL_DIMS.height * 1.4, 0),
  lookAt: new THREE.Vector3(0, -WELL_DIMS.height * 0.05, 0),
};

// --- Core Components ---
let scene, camera, renderer, clock, dirLight;
let activePiece = null,
  ghostPiece = null;
let grid = [],
  staticMeshes = new THREE.Group(),
  wallHighlights = new THREE.Group();
let collisionHighlights = new THREE.Group();
let score = 0,
  lastTick = 0,
  lockDelayTimer = 0,
  lastFrameTime = 0;
let isTouchingFloor = false,
  gameOver = false;
let isFastDropping = false;
let isAnimating = false;
let keyRotateMode = false;
let gameHasStarted = false;
let isPaused = false;
let shakeDuration = 0,
  shakeMagnitude = 0;
let particleSystems = [];
let translucentCubelets = new Set();
let collisionFlashTimer = 0;
const COLLISION_FLASH_DURATION_MS = 100; // How long the flash lasts
// --- Piece Definitions & Materials ---

const translucentCommittedMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff, // Color will be set per cubelet
  transparent: true,
  opacity: 0.5, // Adjust this value for desired translucency
  depthWrite: false, // Prevents depth fighting issues
});

const SOLARIZED_COLORS_FOR_FLASH = [
  0x268bd2, // Blue
  0x2aa198, // Cyan
  0x859900, // Green
  0xb58900, // Yellow
  0xcb4b16, // Orange
  0xdc322f, // Red
  0xd33682, // Magenta
  0x6c71c4, // Violet
];

const translucentWireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xdc322f, // Solarized Red
  transparent: true,
  opacity: 0.9,
  linewidth: 2,
});

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

const LAYER_COLORS = PIECES.map((p) => p.color);
const activeWireframeMaterial = new THREE.LineBasicMaterial({
  color: 0xfdf6e3,
});
const committedWireframeMaterial = new THREE.LineBasicMaterial({
  color: 0x000000,
});
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

function createExplosion(position, color) {
  const particleCount = 200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4 + 2,
      (Math.random() - 0.5) * 4,
    );
    velocities.push(velocity);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: color,
    size: 0.08,
    transparent: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const particles = new THREE.Points(geometry, material);
  particles.position.copy(position);
  scene.add(particles);

  particleSystems.push({
    mesh: particles,
    velocities: velocities,
    lifetime: 1.5,
  });
}

function triggerShake(magnitude, duration) {
  shakeMagnitude = magnitude;
  shakeDuration = duration;
}

// blckt.js

// ... (existing code) ...

function detectCoveredHoles() {
  const holes = [];
  const w = WELL_DIMS.width;
  const h = WELL_DIMS.height;
  const d = WELL_DIMS.depth;

  // Iterate through each cell in the grid
  for (let y = 0; y < h; y++) {
    // Start from bottom layer (y=0)
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        // If the current cell is empty
        if (!grid[x][y][z]) {
          // Check if there's a block directly above it
          let isCovered = false;
          for (let yi = y + 1; yi < h; yi++) {
            if (grid[x][yi][z]) {
              isCovered = true;
              break; // Found a block above, this is a covered hole
            }
          }
          if (isCovered) {
            holes.push({ x, y, z });
          }
        }
      }
    }
  }
  return holes;
}

function updateTranslucentCubelets() {
  // 1. Reset all previously translucent cubelets to opaque
  translucentCubelets.forEach((cubeletGroup) => {
    const mesh = cubeletGroup.children[0]; // The actual cube mesh
    const wireframe = cubeletGroup.children[1]; // The wireframe (LineSegments)

    const originalColor = mesh.userData.originalColor;
    if (originalColor !== undefined) {
      mesh.material = new THREE.MeshStandardMaterial({ color: originalColor });
      mesh.material.needsUpdate = true;
    }

    // Reset wireframe material to committedWireframeMaterial
    wireframe.material = committedWireframeMaterial;
    wireframe.material.needsUpdate = true;
  });
  translucentCubelets.clear();

  // 2. Detect current covered holes
  const coveredHoles = detectCoveredHoles();

  // 3. Mark new cubelets above holes as translucent
  const w = WELL_DIMS.width;
  const h = WELL_DIMS.height;
  const d = WELL_DIMS.depth;

  coveredHoles.forEach((hole) => {
    for (let yi = hole.y + 1; yi < h; yi++) {
      const cubeletGroup = grid[hole.x][yi][hole.z];
      if (cubeletGroup) {
        const mesh = cubeletGroup.children[0]; // The actual cube mesh
        const wireframe = cubeletGroup.children[1]; // The wireframe

        // Store original color if not already stored
        if (mesh.userData.originalColor === undefined) {
          mesh.userData.originalColor = mesh.material.color.getHex();
        }

        // Apply translucent mesh material
        const newMeshMaterial = translucentCommittedMaterial.clone();
        newMeshMaterial.color.set(mesh.userData.originalColor);
        mesh.material = newMeshMaterial;
        mesh.material.needsUpdate = true;

        // Apply translucent wireframe material
        wireframe.material = translucentWireframeMaterial; // Use the new translucent wireframe material
        wireframe.material.needsUpdate = true;

        translucentCubelets.add(cubeletGroup);
      }
    }
  });
}

function togglePause() {
  if (gameOver) return;

  if (!gameHasStarted) {
    document.getElementById("pause-menu").style.display = "none";
    startGame();
    return;
  }

  isPaused = !isPaused;
  const pauseMenu = document.getElementById("pause-menu");
  pauseMenu.style.display = isPaused ? "block" : "none";
}

function createTriangleMesh(color) {
  const geometry = new THREE.BufferGeometry();
  // Vertices for a simple equilateral triangle in 2D (on XZ plane, assuming Y is up)
  // You can adjust these to your preferred triangle shape
  const vertices = new Float32Array([
    0.5,
    0,
    -0.288, // Vertex 0 (right)
    -0.5,
    0,
    -0.288, // Vertex 1 (left)
    0.0,
    0,
    0.577, // Vertex 2 (top/front)
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals(); // Needed for proper lighting (if you add any to particles)

  const material = new THREE.MeshBasicMaterial({
    // Use MeshBasicMaterial as they are just decorative
    color: color,
    transparent: true,
    opacity: 0.1, // Still faint
    side: THREE.DoubleSide, // Important for seeing both sides of the plane
  });

  const triangle = new THREE.Mesh(geometry, material);
  triangle.rotation.x = Math.PI / 2; // Orient flat triangle upwards (XZ plane)
  return triangle;
}

function init() {
  scene = new THREE.Scene();
  clock = new THREE.Clock();
  scene.add(staticMeshes, wallHighlights);
  camera = new THREE.PerspectiveCamera(
    50,
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
  renderer.setClearColor(0x000000);
  scene.add(new THREE.AmbientLight(0x93a1a1));
  dirLight = new THREE.DirectionalLight(0xfdf6e3, 0.8);
  dirLight.position.set(WELL_DIMS.width, WELL_DIMS.height, WELL_DIMS.depth);
  dirLight.castShadow = true;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  scene.add(staticMeshes, wallHighlights, collisionHighlights);
  grid = Array.from({ length: WELL_DIMS.width }, () =>
    Array.from({ length: WELL_DIMS.height }, () =>
      Array(WELL_DIMS.depth).fill(null),
    ),
  );
  createWireframeWell();
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(onWindowResize, 100); // Wait 100ms
  });

  renderer.domElement.addEventListener("touchstart", onTouchStart, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchmove", onTouchMove, {
    passive: false,
  });
  renderer.domElement.addEventListener("touchend", onTouchEnd, {
    passive: false,
  });

  document.getElementById("pause-menu").style.display = "block";
  document.getElementById("game-over").addEventListener("click", restartGame);
  document
    .getElementById("score-container")
    .addEventListener("click", togglePause);
  document.getElementById("pause-menu").addEventListener("click", togglePause);
  requestAnimationFrame(animate);
}

function restartGame() {
  document.getElementById("game-over").style.display = "none";
  gameOver = false;
  score = 0;
  lastTick = 0;
  lockDelayTimer = 0;
  isTouchingFloor = false;
  document.getElementById("score").innerText = score;
  if (activePiece) scene.remove(activePiece);
  if (ghostPiece) scene.remove(ghostPiece);
  while (staticMeshes.children.length > 0) {
    let child = staticMeshes.children[0];
    staticMeshes.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    if (child.children.length > 0) {
      let innerChild = child.children[0];
      if (innerChild.geometry) innerChild.geometry.dispose();
      if (innerChild.material) innerChild.material.dispose();
    }
  }
  wallHighlights.clear();
  grid = Array.from({ length: WELL_DIMS.width }, () =>
    Array.from({ length: WELL_DIMS.height }, () =>
      Array(WELL_DIMS.depth).fill(null),
    ),
  );
  spawnPiece();
}

function createWireframeWell() {
  const w = WELL_DIMS.width,
    h = WELL_DIMS.height,
    d = WELL_DIMS.depth;
  const hw = w / 2,
    hd = d / 2;
  const points = [];
  for (let y = 0; y <= h; y++) {
    points.push(-hw, y - 0.5, -hd, hw, y - 0.5, -hd);
    points.push(-hw, y - 0.5, hd, hw, y - 0.5, hd);
    points.push(-hw, y - 0.5, -hd, -hw, y - 0.5, hd);
    points.push(hw, y - 0.5, -hd, hw, y - 0.5, hd);
  }
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
  const material = new THREE.LineBasicMaterial({ color: 0x2aa198 });
  const wireframe = new THREE.LineSegments(geometry, material);
  scene.add(wireframe);
}

function updateWallHighlights() {
  wallHighlights.clear();
  const w = WELL_DIMS.width,
    h = WELL_DIMS.height,
    d = WELL_DIMS.depth;
  const hw = w / 2,
    hd = d / 2;
  const planeGeom = new THREE.PlaneGeometry(1, 1);
  const addHighlight = (x, y, z, color, wall) => {
    const material = highlightMaterials[color.getHexString()];
    if (!material) return;
    const plane = new THREE.Mesh(planeGeom, material);
    switch (wall) {
      case "left":
        plane.position.set(-hw - 0.01, y, z - hd + 0.5);
        plane.rotation.y = Math.PI / 2;
        break;
      case "right":
        plane.position.set(hw + 0.01, y, z - hd + 0.5);
        plane.rotation.y = -Math.PI / 2;
        break;
      case "back":
        plane.position.set(x - hw + 0.5, y, -hd - 0.01);
        break;
    }
    wallHighlights.add(plane);
  };
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (grid[x][y][z]) {
          addHighlight(
            x,
            y,
            z,
            grid[x][y][z].children[0].material.color,
            "left",
          );
          break;
        }
      }
    }
    for (let z = 0; z < d; z++) {
      for (let x = w - 1; x >= 0; x--) {
        if (grid[x][y][z]) {
          addHighlight(
            x,
            y,
            z,
            grid[x][y][z].children[0].material.color,
            "right",
          );
          break;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        if (grid[x][y][z]) {
          addHighlight(
            x,
            y,
            z,
            grid[x][y][z].children[0].material.color,
            "back",
          );
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
    const wireframe = new THREE.LineSegments(edgeGeom, activeWireframeMaterial);
    wireframe.position.set(...pos);
    activePiece.add(wireframe);
    const ghostWireframeCube = new THREE.LineSegments(
      edgeGeom,
      ghostWireframeMaterial,
    );
    ghostWireframeCube.position.set(...pos);
    ghostWireframeCube.scale.set(0.99, 0.99, 0.99);
    ghostPiece.add(ghostWireframeCube);
  }
  const spawnGridX = Math.floor(WELL_DIMS.width / 2) - 1;
  const spawnX = spawnGridX - (WELL_DIMS.width / 2 - 0.5);
  const spawnGridZ = Math.floor(WELL_DIMS.depth / 2);
  const spawnZ = spawnGridZ - (WELL_DIMS.depth / 2 - 0.5);
  activePiece.position.set(spawnX, WELL_DIMS.height - 3, spawnZ);
  scene.add(activePiece, ghostPiece);
  if (checkCollision(activePiece).isColliding) {
    gameOver = true;
    document.getElementById("game-over").style.display = "block";
    scene.remove(activePiece, ghostPiece);
  } else {
    updateGhostPiece();
    isAnimating = true;
    activePiece.scale.set(0.1, 0.1, 0.1);
    new TWEEN.Tween(activePiece.scale)
      .to({ x: 0.99, y: 0.99, z: 0.99 }, 300)
      .easing(TWEEN.Easing.Back.Out)
      .onComplete(() => {
        isAnimating = false;
      })
      .start();
  }
}

function lockPiece() {
  const lockEffectMagnitude = isFastDropping ? 0.4 : 0.2;
  triggerShake(lockEffectMagnitude, 0.25);

  const pieceCenter = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  activePiece.children.forEach((c) => {
    pieceCenter.add(c.getWorldPosition(worldPos));
  });
  pieceCenter.divideScalar(activePiece.children.length);

  const flashLight = new THREE.PointLight(0xfdf6e3, 3, 20);
  flashLight.position.copy(pieceCenter);
  scene.add(flashLight);

  new TWEEN.Tween(flashLight)
    .to({ intensity: 0 }, 400)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onComplete(() => scene.remove(flashLight))
    .start();

  const edgeGeom = new THREE.EdgesGeometry(baseBoxGeometry);
  const cubeletsToCreate = [];

  activePiece.children.forEach((wireframeCube) => {
    const worldPos = new THREE.Vector3();
    wireframeCube.getWorldPosition(worldPos);
    const [gx, gy, gz] = worldToGrid(worldPos);

    if (grid[gx]?.[gy] !== undefined && gy >= 0) {
      const color = LAYER_COLORS[gy % LAYER_COLORS.length];
      cubeletsToCreate.push({
        position: worldPos,
        gridPos: { x: gx, y: gy, z: gz },
        color: color,
      });
    }
  });

  cubeletsToCreate.forEach((data) => {
    const staticMaterial = new THREE.MeshStandardMaterial({
      color: data.color,
    });
    const staticCube = new THREE.Mesh(baseBoxGeometry, staticMaterial);
    staticCube.castShadow = true;

    const staticWireframe = new THREE.LineSegments(
      edgeGeom,
      committedWireframeMaterial,
    );
    staticWireframe.scale.set(1.01, 1.01, 1.01);

    const cubeletGroup = new THREE.Group();
    cubeletGroup.add(staticCube);
    cubeletGroup.add(staticWireframe);
    cubeletGroup.position.copy(data.position);

    const { x, y, z } = data.gridPos;
    grid[x][y][z] = cubeletGroup;
    staticMeshes.add(cubeletGroup);
  });

  scene.remove(activePiece, ghostPiece);
  activePiece = ghostPiece = null;
  checkAndClearLayers();
  updateWallHighlights();

  updateTranslucentCubelets();

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

        const worldPos = new THREE.Vector3();
        cubeletGroup.getWorldPosition(worldPos);
        const color = cubeletGroup.children[0].material.color;
        createExplosion(worldPos, color);

        cubeletGroup.children.forEach((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        staticMeshes.remove(cubeletGroup);
        grid[x][y][z] = null;
      }
    }

    for (let yi = y; yi < WELL_DIMS.height - 1; yi++) {
      for (let x = 0; x < WELL_DIMS.width; x++) {
        for (let z = 0; z < WELL_DIMS.depth; z++) {
          const groupToMove = grid[x][yi + 1][z];
          grid[x][yi][z] = groupToMove;
          if (groupToMove) {
            groupToMove.position.y--;
            const newLayerColor = LAYER_COLORS[yi % LAYER_COLORS.length];
            const mesh = groupToMove.children[0];
            mesh.material.color.set(newLayerColor);
          }
        }
      }
    }

    for (let x = 0; x < WELL_DIMS.width; x++) {
      for (let z = 0; z < WELL_DIMS.depth; z++) {
        grid[x][WELL_DIMS.height - 1][z] = null;
      }
    }
    y--;
  }

  if (layersCleared > 0) {
    score += 100 * layersCleared * layersCleared;
    document.getElementById("score").innerText = score;
    updateTranslucentCubelets();
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
    Math.round(worldPos.y - 0.2),
    Math.round(worldPos.z + (WELL_DIMS.depth / 2 - 0.5)),
  ];
}

function updateGhostPiece() {
  if (!activePiece) return;
  ghostPiece.position.copy(activePiece.position);
  ghostPiece.quaternion.copy(activePiece.quaternion);
  while (!checkCollision(ghostPiece).isColliding) ghostPiece.position.y--;
  ghostPiece.position.y++;
}

function flashWalls(walls, pieceBBoxMin, pieceBBoxMax) {
  collisionHighlights.clear();
  const w = WELL_DIMS.width,
    h = WELL_DIMS.height,
    d = WELL_DIMS.depth;
  const hw = w / 2,
    hd = d / 2;

  const baseSolarizedColor =
    SOLARIZED_COLORS_FOR_FLASH[
      Math.floor(Math.random() * SOLARIZED_COLORS_FOR_FLASH.length)
    ];
  const flashColor = new THREE.Color(0x339999);
  flashColor.multiplyScalar(0.5); // Still darken the base color
  const darkerFlashColor = new THREE.Color(0x003333);
  darkerFlashColor.multiplyScalar(0.99); // Still darken the base color

  const flashSquareGeom = new THREE.PlaneGeometry(1, 1); // 1x1 square plane

  // Helper to add a flash square to the scene
  const addFlashSquare = (gridX, gridY, gridZ, distance, color) => {
    let opacity;
    if (distance === 0) {
      opacity = 0.3; // Brighter for direct collision
    } else if (distance === 1) {
      opacity = 0.08; // Darker for one square away
    } else {
      return; // No flash for further distances
    }

    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
    });

    const flashPlane = new THREE.Mesh(flashSquareGeom, material);
    // Position the flash plane at the center of the grid cell
    const worldX = gridX - hw + 0.5;
    const worldY = gridY - 0.5;
    const worldZ = gridZ - hd + 0.5;

    if (walls.includes("left") && gridX === 0) {
      // Only flash on the leftmost face if it's the left wall
      flashPlane.position.set(-hw - 0.05, worldY, worldZ);
      flashPlane.rotation.y = Math.PI / 2;
      collisionHighlights.add(flashPlane);
    }
    if (walls.includes("right") && gridX === WELL_DIMS.width - 1) {
      // Only flash on the rightmost face
      flashPlane.position.set(hw + 0.05, worldY, worldZ);
      flashPlane.rotation.y = -Math.PI / 2;
      collisionHighlights.add(flashPlane);
    }
    if (walls.includes("back") && gridZ === 0) {
      // Only flash on the backmost face
      flashPlane.position.set(worldX, worldY, -hd - 0.05);
      collisionHighlights.add(flashPlane);
    }
    if (walls.includes("front") && gridZ === WELL_DIMS.depth - 1) {
      // Only flash on the frontmost face
      flashPlane.position.set(worldX, worldY, hd + 0.05);
      flashPlane.rotation.y = Math.PI;
      collisionHighlights.add(flashPlane);
    }
    if (walls.includes("floor") && gridY === 0) {
      // Floor flash
      const floorFlashPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        material,
      );
      floorFlashPlane.position.set(worldX, -0.55, worldZ);
      floorFlashPlane.rotation.x = -Math.PI / 2;
      collisionHighlights.add(floorFlashPlane);
    }
  };

  // Iterate through the bounding box of the piece + 1 square buffer
  // This allows us to check for pixels 1 unit away
  const minX = Math.max(0, pieceBBoxMin.x - 1);
  const maxX = Math.min(WELL_DIMS.width - 1, pieceBBoxMax.x + 1);
  const minY = Math.max(0, pieceBBoxMin.y - 1);
  const maxY = Math.min(WELL_DIMS.height - 1, pieceBBoxMax.y + 1);
  const minZ = Math.max(0, pieceBBoxMin.z - 1);
  const maxZ = Math.min(WELL_DIMS.depth - 1, pieceBBoxMax.z + 1);

  for (let gy = minY; gy <= maxY; gy++) {
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        // Calculate Euclidean distance to the nearest cubelet of the piece
        let minEuclideanDist = Infinity;
        // Iterate through all cubelets in the piece's bounding box
        for (let py = pieceBBoxMin.y; py <= pieceBBoxMax.y; py++) {
          for (let px = pieceBBoxMin.x; px <= pieceBBoxMax.x; px++) {
            for (let pz = pieceBBoxMin.z; pz <= pieceBBoxMax.z; pz++) {
              // Calculate squared Euclidean distance (faster than sqrt)
              const distSq =
                (gx - px) * (gx - px) +
                (gy - py) * (gy - py) +
                (gz - pz) * (gz - pz);
              minEuclideanDist = Math.min(minEuclideanDist, distSq);
            }
          }
        }
        const dist = Math.round(Math.sqrt(minEuclideanDist)); // Round to nearest integer for stepped effect

        // Add flash square if distance is 0 or 1
        if (dist <= 1) {
          if (dist == 0) {
            addFlashSquare(gx, gy, gz, dist, flashColor);
            //TODO This is a hack because opacity does not affect these materials
          } else if (dist == 1) {
            addFlashSquare(gx, gy, gz, dist, darkerFlashColor);
          }
        }
      }
    }
  }

  collisionFlashTimer = COLLISION_FLASH_DURATION_MS;
}

function checkCollision(piece) {
  const tempVec = new THREE.Vector3();
  let collidedWalls = [];
  let isColliding = false;

  let minY = Infinity; // Still useful for ghost piece, but not for flash now
  let maxY = -Infinity; // Still useful for ghost piece, but not for flash now

  // Store grid positions of piece cubes that are actually causing the collision with a wall
  const collidingCubeGridPositions = [];

  for (const cube of piece.children) {
    cube.getWorldPosition(tempVec);
    const [gx, gy, gz] = worldToGrid(tempVec);

    minY = Math.min(minY, gy); // Keep these for other uses like ghost piece
    maxY = Math.max(maxY, gy); // Keep these for other uses like ghost piece

    let cubeCollides = false;

    // Check for boundary collisions
    if (gy < 0) {
      // Floor collision
      cubeCollides = true;
      if (!collidedWalls.includes("floor")) collidedWalls.push("floor");
    }
    if (gx < 0) {
      // Left wall collision
      cubeCollides = true;
      if (!collidedWalls.includes("left")) collidedWalls.push("left");
    }
    if (gx >= WELL_DIMS.width) {
      // Right wall collision
      cubeCollides = true;
      if (!collidedWalls.includes("right")) collidedWalls.push("right");
    }
    if (gz < 0) {
      // Back wall collision
      cubeCollides = true;
      if (!collidedWalls.includes("back")) collidedWalls.push("back");
    }
    if (gz >= WELL_DIMS.depth) {
      // Front wall collision
      cubeCollides = true;
      if (!collidedWalls.includes("front")) collidedWalls.push("front");
    }
    if (gy >= WELL_DIMS.height) {
      // Ceiling collision (game over)
      cubeCollides = true;
    }

    // Check for static block collisions (only if within bounds)
    if (
      gy >= 0 &&
      gy < WELL_DIMS.height &&
      gx >= 0 &&
      gx < WELL_DIMS.width &&
      gz >= 0 &&
      gz < WELL_DIMS.depth
    ) {
      if (grid[gx]?.[gy]?.[gz]) {
        cubeCollides = true;
      }
    }

    if (cubeCollides) {
      isColliding = true; // Overall collision
      // We only care about wall collisions here for the flash effect
      // If the piece collides with a wall (and is about to be reverted),
      // then we consider its cubes for the flash origin
      // A simple way is to pass *all* cubes of the piece, and let flashWalls filter
      // Or, determine if it's a *new* boundary collision that warrants a flash.
      // For this simpler effect, let's just pass all piece cubes if a wall collision happens.
      // If isColliding is true, all cubes are relevant for the flash
      // This is actually simpler: just pass the piece's current position and dimensions.
    }
  }
  // For this effect, we don't need individual colliding cubes.
  // The flash will happen on the walls themselves, localized by the piece's Y-range
  // and using its extent for the "circle" center/radius.
  // Let's revert to passing piece's Y-range and its world-position center.
  // The previous implementation for flashWalls was better suited for "Euclidean circle" on walls
  // if we want it pixelated, we make many small planes.

  // Re-evaluating based on "darker one square away" and "not smooth"
  // This implies we generate a grid of small flash planes at various distances.

  // Let's calculate the bounding box of the piece in grid coordinates when it's colliding
  const bboxMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const bboxMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  piece.children.forEach((cube) => {
    cube.getWorldPosition(tempVec);
    const [gx, gy, gz] = worldToGrid(tempVec);
    bboxMin.min(new THREE.Vector3(gx, gy, gz));
    bboxMax.max(new THREE.Vector3(gx, gy, gz));
  });

  return { isColliding, walls: collidedWalls, bboxMin, bboxMax };
}

function animate(currentTime) {
  requestAnimationFrame(animate);

  if (isPaused) {
    return;
  }

  const elapsed = currentTime - lastFrameTime;
  if (elapsed < FRAME_INTERVAL) {
    return;
  }
  lastFrameTime = currentTime - (elapsed % FRAME_INTERVAL);

  TWEEN.update(currentTime);
  const delta = clock.getDelta();

  if (collisionFlashTimer > 0) {
    collisionFlashTimer -= delta * 1000; // Decrement by ms
    const opacity = collisionFlashTimer / COLLISION_FLASH_DURATION_MS;
    collisionHighlights.children.forEach((mesh) => {
      if (mesh.material.transparent) {
        mesh.material.opacity = opacity;
        mesh.material.needsUpdate = true;
      }
    });
    if (collisionFlashTimer <= 0) {
      collisionHighlights.clear(); // Remove highlights when timer expires
    }
  }

  if (gameHasStarted && !gameOver && activePiece) {
    lastTick += delta;
    if (isTouchingFloor) lockDelayTimer += delta;

    const currentTickRate = isFastDropping
      ? FAST_FALL_TICK_RATE_MS
      : TICK_RATE_MS;

    if (lockDelayTimer > LOCK_DELAY_MS / 1000) {
      lockPiece();
    } else if (lastTick > currentTickRate / 1000) {
      lastTick = 0;
      activePiece.position.y--;
      if (checkCollision(activePiece).isColliding) {
        activePiece.position.y++;
        isTouchingFloor = true;
        if (lockDelayTimer === 0) lockDelayTimer = 0.001;
      } else {
        if (isFastDropping) {
          score++;
          document.getElementById("score").innerText = score;
        }
        isTouchingFloor = false;
        lockDelayTimer = 0;
      }
    }
  }

  for (let i = particleSystems.length - 1; i >= 0; i--) {
    const system = particleSystems[i];
    system.lifetime -= delta;

    if (system.lifetime <= 0) {
      scene.remove(system.mesh);
      system.mesh.geometry.dispose();
      system.mesh.material.dispose();
      particleSystems.splice(i, 1);
      continue;
    }

    system.mesh.material.opacity = system.lifetime;
    const positions = system.mesh.geometry.attributes.position.array;
    for (let j = 0; j < system.velocities.length; j++) {
      system.velocities[j].y -= 5.0 * delta; // gravity
      positions[j * 3] += system.velocities[j].x * delta;
      positions[j * 3 + 1] += system.velocities[j].y * delta;
      positions[j * 3 + 2] += system.velocities[j].z * delta;
    }
    system.mesh.geometry.attributes.position.needsUpdate = true;
  }

  const targetCamPos = CAMERA_CONFIG.pos.clone();
  if (shakeDuration > 0) {
    targetCamPos.x += (Math.random() - 0.5) * shakeMagnitude;
    targetCamPos.z += (Math.random() - 0.5) * shakeMagnitude;
    shakeDuration -= delta;
  }
  camera.position.lerp(targetCamPos, 0.2);

  renderer.render(scene, camera);
}

function movePiece(x, y, z) {
  if (!activePiece || gameOver || isAnimating) return false;
  activePiece.position.add(new THREE.Vector3(x, y, z));
  const collisionResult = checkCollision(activePiece);
  if (collisionResult.isColliding) {
    activePiece.position.sub(new THREE.Vector3(x, y, z)); // Revert move
    if (collisionResult.walls.length > 0) {
      // If it was a wall collision
      // Pass the bounding box from the collision check
      flashWalls(
        collisionResult.walls,
        collisionResult.bboxMin,
        collisionResult.bboxMax,
      );
    }
    return false;
  }
  if (isTouchingFloor) lockDelayTimer = 0;
  updateGhostPiece();
  return true;
}

// Modify rotatePiece to pass the piece's bounding box to flashWalls
function rotatePiece(axis, angle) {
  if (!activePiece || gameOver || isAnimating) return false;
  const clone = activePiece.clone();
  clone.position.copy(activePiece.position);
  clone.rotateOnWorldAxis(axis, angle);

  let targetPosition = activePiece.position.clone();
  let isValidMove = false;
  let collisionResult = checkCollision(clone); // Check collision with rotated piece
  if (!collisionResult.isColliding) {
    isValidMove = true;
  } else {
    const kicks = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    for (const kick of kicks) {
      clone.position.add(kick);
      collisionResult = checkCollision(clone); // Check after kick
      if (!collisionResult.isColliding) {
        isValidMove = true;
        targetPosition.copy(clone.position);
        break;
      }
      clone.position.sub(kick);
    }
  }
  if (isValidMove) {
    isAnimating = true;
    const duration = 150;
    const targetQuaternion = clone.quaternion;
    new TWEEN.Tween(activePiece.position)
      .to(targetPosition, duration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
    new TWEEN.Tween(activePiece.quaternion)
      .to(targetQuaternion, duration)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(updateGhostPiece)
      .onComplete(() => {
        isAnimating = false;
        activePiece.position.copy(targetPosition);
        activePiece.quaternion.copy(targetQuaternion);
        if (isTouchingFloor) lockDelayTimer = 0;
        updateGhostPiece();
      })
      .start();
    return true;
  } else {
    if (collisionResult.walls.length > 0) {
      // Pass the bounding box from the collision check (of the final attempted position)
      flashWalls(
        collisionResult.walls,
        collisionResult.bboxMin,
        collisionResult.bboxMax,
      );
    }
    return false;
  }
}

function hardDrop() {
  if (!activePiece || gameOver || isAnimating) return;
  activePiece.position.copy(ghostPiece.position);
  lockPiece();
}

function handleKeyUp(event) {
  const key = event.key;
  if (key.toLowerCase() === "a" || key === "Shift") {
    keyRotateMode = false;
  }
  if (event.code === "Space") {
    isFastDropping = false;
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (isPaused) return;
  if (gameOver) {
    if (event.key === "Enter" || event.code === "Space") restartGame();
    return;
  }
  if (!activePiece || event.repeat) return;

  if (event.key === "a" || event.key === "Shift") {
    keyRotateMode = true;
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    isFastDropping = true;
    return;
  }

  const key = event.key.toLowerCase();
  switch (key) {
    case "n":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      else movePiece(-1, 0, 0);
      break;
    case "o":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      else movePiece(1, 0, 0);
      break;
    case "i":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      else movePiece(0, 0, -1);
      break;
    case "e":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      else movePiece(0, 0, 1);
      break;
    case "r":
      rotatePiece(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      break;
    case "z":
      rotatePiece(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      break;
  }

  switch (event.key) {
    case "ArrowLeft":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      else movePiece(-1, 0, 0);
      break;
    case "ArrowRight":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      else movePiece(1, 0, 0);
      break;
    case "ArrowUp":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      else movePiece(0, 0, -1);
      break;
    case "ArrowDown":
      if (keyRotateMode) rotatePiece(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      else movePiece(0, 0, 1);
      break;
  }
}

const touchState = {
  left: null,
  right: null,
  isRotateMode: false,
  holdTimeout: null,
};

const TOUCH_SETTINGS = {
  MOVE_THRESHOLD_PX: 20,
  ROTATE_THRESHOLD_PX: 30,
  TAP_MAX_DIST_PX: 25,
  TAP_TIMEOUT_MS: 200,
  SWIPE_MIN_DIST_PX: 40,
  SWIPE_TIMEOUT_MS: 400,
};

function onTouchStart(event) {
  if (isPaused) return;
  event.preventDefault();
  if (gameOver) {
    restartGame();
    return;
  }

  const now = clock.getElapsedTime() * 1000;

  for (const touch of event.changedTouches) {
    const isLeftHalf = touch.clientX < window.innerWidth / 2;

    if (isLeftHalf && !touchState.left) {
      touchState.left = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: now,
      };
    } else if (!isLeftHalf && touchState.left && !touchState.right) {
      touchState.right = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: now,
      };
      touchState.isRotateMode = true;
    } else if (!isLeftHalf && !touchState.left && !touchState.right) {
      touchState.right = { id: touch.identifier };
      touchState.holdTimeout = setTimeout(() => {
        isFastDropping = true;
        touchState.holdTimeout = null;
      }, HOLD_DELAY_MS);
    }
  }
}

function onTouchMove(event) {
  event.preventDefault();
  if (gameOver || isAnimating) return;

  for (const touch of event.changedTouches) {
    if (touchState.isRotateMode && touchState.right?.id === touch.identifier) {
      const deltaX = touch.clientX - touchState.right.lastX;
      const deltaY = touch.clientY - touchState.right.lastY;
      if (Math.abs(deltaX) > TOUCH_SETTINGS.ROTATE_THRESHOLD_PX) {
        rotatePiece(
          new THREE.Vector3(0, 0, 1),
          (Math.PI / 2) * Math.sign(deltaX),
        );
        touchState.right.lastX = touch.clientX;
        touchState.right.lastY = touch.clientY;
      } else if (Math.abs(deltaY) > TOUCH_SETTINGS.ROTATE_THRESHOLD_PX) {
        rotatePiece(
          new THREE.Vector3(1, 0, 0),
          (Math.PI / 2) * -Math.sign(deltaY),
        );
        touchState.right.lastY = touch.clientY;
        touchState.right.lastX = touch.clientX;
      }
    } else if (
      !touchState.isRotateMode &&
      touchState.left?.id === touch.identifier
    ) {
      const deltaX = touch.clientX - touchState.left.lastX;
      const deltaY = touch.clientY - touchState.left.lastY;
      if (Math.abs(deltaX) > TOUCH_SETTINGS.MOVE_THRESHOLD_PX) {
        movePiece(Math.sign(deltaX), 0, 0);
        touchState.left.lastX = touch.clientX;
        touchState.left.lastY = touch.clientY;
      } else if (Math.abs(deltaY) > TOUCH_SETTINGS.MOVE_THRESHOLD_PX) {
        movePiece(0, 0, Math.sign(deltaY));
        touchState.left.lastY = touch.clientY;
        touchState.left.lastX = touch.clientX;
      }
    }
  }
}

function onTouchEnd(event) {
  event.preventDefault();
  if (gameOver) return;

  clearTimeout(touchState.holdTimeout);
  isFastDropping = false;

  const now = clock.getElapsedTime() * 1000;

  for (const touch of event.changedTouches) {
    if (touchState.left?.id === touch.identifier) {
      const touchDuration = now - touchState.left.startTime;
      const verticalTraveled = touch.clientY - touchState.left.startY;
      if (
        touchDuration < TOUCH_SETTINGS.SWIPE_TIMEOUT_MS &&
        verticalTraveled > TOUCH_SETTINGS.SWIPE_MIN_DIST_PX &&
        verticalTraveled > Math.abs(touch.clientX - touchState.left.startX)
      ) {
        // hardDrop();
      }
      touchState.left = null;
      touchState.right = null;
      touchState.isRotateMode = false;
    } else if (touchState.right?.id === touch.identifier) {
      if (touchState.isRotateMode) {
        const touchDuration = now - touchState.right.startTime;
        const distTraveled = Math.hypot(
          touch.clientX - touchState.right.startX,
          touch.clientY - touchState.right.startY,
        );
        if (
          touchDuration < TOUCH_SETTINGS.TAP_TIMEOUT_MS &&
          distTraveled < TOUCH_SETTINGS.TAP_MAX_DIST_PX
        ) {
          rotatePiece(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        }
      }
      touchState.right = null;
      touchState.isRotateMode = false;
    }
  }
}

function startGame() {
  gameHasStarted = true;
  spawnPiece();
}

init();
