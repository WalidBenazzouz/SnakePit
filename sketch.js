let player;
let bots = [];
let foods = [];
let zoom = 1;
let zoomMultiplier = 1;
const MAP_RADIUS = 2500;
const INITIAL_BOTS = 10;
const FOOD_COUNT = 1000;

// Game State
let gameState = "MENU"; // MENU, PLAY, GAMEOVER
let shakeEndTime = 0;
let debugMode = false;
let bg; // Background instance

function keyPressed() {
  if (key === 'd' || key === 'D') {
    debugMode = !debugMode;
    console.log("Debug Mode:", debugMode);
  }
}

function setup() {
  try {
    createCanvas(windowWidth, windowHeight);

    // OPTIMIZATION: Fix pixel density to 1 for performance on Retina screens
    pixelDensity(1);

    // UI Bindings
    let playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.onclick = startGame;

    let restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.onclick = startGame;

    // Init background simulation
    // Subtle, dark, responsive background (Tuned for user)
    // Opacity reduced (0.28)
    bg = new Background({
      mode: 1,
      gridScale: 50,              // Slightly larger grid
      lineWidth: 0.5,             // Thinner lines
      bgColor: [15, 20, 25],      // Dark Gray/Blue (Subtle)
      lineColor: [40, 60, 80],    // Faint Blue-Grey Grid
      intensity: 0.3,             // Less intense glow
      speed: 0.2                  // Slower animation
    });

    // Init Skin Manager
    if (typeof SkinManager !== 'undefined') {
      window.skinManager = new SkinManager();
    }

    resetGame();
  } catch (e) {
    alert("Error in setup: " + e.message);
    console.error(e);
  }
}

function startGame() {
  let name = document.getElementById('nickname').value || "Guest";
  let skinSelect = document.getElementById('skin-select');
  let skinId = skinSelect ? parseInt(skinSelect.value) : 1;

  // Random Spawn Position
  let spawnPos = p5.Vector.random2D().mult(random(MAP_RADIUS - 400));
  player = new Snake(spawnPos.x, spawnPos.y, name, skinId);

  // Set initial zoom to minimum (max dezoom for wide view)
  zoom = 0.5; // Start with maximum field of view

  // Switch to PLAY
  gameState = "PLAY";
  document.getElementById('start-menu').style.display = 'none';
  document.getElementById('game-over-menu').style.display = 'none';

  // Ensure bots exist
  if (bots.length < INITIAL_BOTS) {
    for (let i = bots.length; i < INITIAL_BOTS; i++) {
      let pos = p5.Vector.random2D().mult(random(MAP_RADIUS));
      bots.push(new Bot(pos.x, pos.y));
    }
  }
}

function resetGame() {
  // Init Player placeholder for background
  player = new Snake(0, 0, "Guest");
  player.alive = false; // Don't update

  // Init Bots
  bots = [];
  for (let i = 0; i < INITIAL_BOTS; i++) {
    let pos = p5.Vector.random2D().mult(random(MAP_RADIUS));
    bots.push(new Bot(pos.x, pos.y));
  }

  // Init Food
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    spawnFood();
  }
}

function spawnFood(center = null, count = 1) {
  for (let k = 0; k < count; k++) {
    let x, y;
    if (center) {
      x = center.x + random(-50, 50);
      y = center.y + random(-50, 50);
    } else {
      let pos = p5.Vector.random2D().mult(random(MAP_RADIUS));
      x = pos.x;
      y = pos.y;
    }
    foods.push(new Food(x, y));
  }
}

function draw() {
  // Clear background to prevent smearing (e.g. "names defile")
  // Using a dark color that matches the theme
  background(15, 20, 25);

  // Ensure player and bots are initialized
  if (!player || !bots) return;

  // --- Camera Logic (Moved up for Background) ---
  let camPos = player.alive ? player.pos : (bots[0] ? bots[0].pos : createVector(0, 0));

  // --- Draw Background (Shader) ---
  // Pass camera offset for scrolling
  bg.setOffset(camPos.x, camPos.y);

  // Set grid scale based on zoom (optional, but keeps grid feeling consistent)
  bg.setGrid(40 * zoom);

  // Collect Attractors (Visible Snakes)
  let attractors = [];
  let all = gameState === "PLAY" ? [player, ...bots] : bots;

  for (let s of all) {
    if (!s.alive) continue;
    // Convert world pos to screen pos for shader
    let sx = (s.pos.x - camPos.x) * zoom + width / 2;
    let sy = (s.pos.y - camPos.y) * zoom + height / 2;

    // Only add if on screen (with margin)
    if (sx > -100 && sx < width + 100 && sy > -100 && sy < height + 100) {
      attractors.push({
        x: sx,
        y: sy,
        radius: s.r * 10 * zoom, // Radius scales with zoom
        strength: 1.2,
        waveStrength: 0.5,
        waveFreq: 8.0
      });
    }
  }
  bg.setAttractors(attractors);

  // Update Skins
  if (window.skinManager) {
    window.skinManager.update();
  }

  bg.draw();

  // --- Camera Transform (REQUIRED for Game Objects) ---
  push();
  translate(width / 2, height / 2);
  let targetZoom = player.alive ? (16 / player.r) * zoomMultiplier : 1;
  zoom = lerp(zoom, targetZoom, 0.1);
  scale(zoom);
  translate(-camPos.x, -camPos.y);

  // Draw Textured Circular Boundary

  // Draw Textured Circular Boundary
  if (!window.borderTexture) {
    createBorderTexture();
  }

  let thickness = 50;

  // Use Native Canvas Pattern for 2D mode compatibility
  // texture() is WEBGL only
  let ctx = drawingContext;
  let pattern = ctx.createPattern(window.borderTexture.elt, 'repeat');

  push();
  noFill();
  strokeWeight(thickness);
  ctx.strokeStyle = pattern;

  // Draw the textured ring
  circle(0, 0, MAP_RADIUS * 2);

  // Inner solid edge for visibility
  stroke(255, 50, 50, 200);
  strokeWeight(5);
  circle(0, 0, MAP_RADIUS * 2 - thickness);

  // Outer solid edge
  stroke(255, 50, 50, 200);
  strokeWeight(5);
  circle(0, 0, MAP_RADIUS * 2 + thickness);
  pop();

  if (gameState === "PLAY") {
    // --- Update Player ---
    if (player.alive) {
      let mouseWorld = createVector((mouseX - width / 2) / zoom + camPos.x, (mouseY - height / 2) / zoom + camPos.y);
      player.boost = mouseIsPressed || keyIsDown(32);
      let drop = player.update(mouseWorld);
      if (drop) foods.push(drop);

      // Collisions
      let playerDeadFood = player.checkCollision([player, ...bots]);
      if (playerDeadFood) {
        for (let f of playerDeadFood) foods.push(f);
        gameOver();
      }

      eatFood(player);
    }
  }

  // --- Update Bots ---
  for (let b of bots) {
    // Always update bots even in menu for background life
    let drop = b.updateBot(foods, gameState === "PLAY" ? [player, ...bots] : [...bots]);
    if (drop) foods.push(drop);
    eatFood(b);

    let deadFood = b.checkCollision(gameState === "PLAY" ? [player, ...bots] : [...bots]);
    if (deadFood) {
      // Add all food from dead snake's body
      for (let f of deadFood) foods.push(f);
      // Screen Shake on big death
      if (b.len > 50 && player.pos.dist(b.pos) < width / zoom) {
        triggerShake(200);
      }
    }
  }

  // --- Update Food (Magnetic Effect) ---
  let allSnakes = gameState === "PLAY" ? [player, ...bots] : [...bots];
  for (let f of foods) {
    f.update(allSnakes);
  }

  // --- Render Objects ---
  let viewW = width / zoom;
  let viewH = height / zoom;

  // Food
  for (let f of foods) {
    if (abs(f.pos.x - camPos.x) < viewW && abs(f.pos.y - camPos.y) < viewH) {
      f.show();
    }
  }

  // Bots
  for (let i = bots.length - 1; i >= 0; i--) {
    if (!bots[i].alive) {
      bots.splice(i, 1);
      let pos = p5.Vector.random2D().mult(random(MAP_RADIUS));
      bots.push(new Bot(pos.x, pos.y));
    } else {
      bots[i].show(camPos);
    }
  }

  if (gameState === "PLAY" && player.alive) player.show(camPos);

  // --- HUD ---
  resetMatrix();
  if (gameState === "PLAY") {
    drawHUD();
    drawMinimap(camPos);
  } else if (gameState === "MENU") {
    // Show Menu UI (HTML handles this, just ensure visible)
    document.getElementById('start-menu').style.display = 'block';
  }
}

function gameOver() {
  console.log("Dead");
  gameState = "GAMEOVER";
  spawnFood(player.pos, player.len);
  triggerShake(500);

  // Update UI
  document.getElementById('game-over-menu').style.display = 'block';
  document.getElementById('final-score').innerText = "Length: " + floor(player.len);
}

function triggerShake(duration) {
  shakeEndTime = millis() + duration;
}

function eatFood(snake) {
  if (!snake.alive) return;
  for (let i = foods.length - 1; i >= 0; i--) {
    let f = foods[i];
    if (p5.Vector.dist(snake.pos, f.pos) < snake.r + f.size) {
      snake.grow(0.5);
      foods.splice(i, 1);
      if (random(1) < 0.2) spawnFood();
    }
  }
}

// drawHexGrid removed - replaced by shader background

function drawHexagon(cx, cy, r) {
  beginShape();
  for (let a = 0; a < 6; a++) {
    let angle = a * PI / 3 - PI / 6;
    vertex(cx + cos(angle) * r, cy + sin(angle) * r);
  }
  endShape(CLOSE);
}

function drawHUD() {
  // ===== Leaderboard (Top Right) =====
  let lbWidth = 180;
  let lbHeight = 220;
  let lbX = width - lbWidth - 15;
  let lbY = 15;

  // Background
  fill(0, 0, 0, 180);
  noStroke();
  rect(lbX, lbY, lbWidth, lbHeight, 8);

  // Title
  fill(255, 255, 255, 200);
  textAlign(LEFT, TOP);
  textSize(14);
  textStyle(BOLD);
  text("Leaderboard", lbX + 12, lbY + 10);
  textStyle(NORMAL);

  let all = [player, ...bots];
  all.sort((a, b) => b.len - a.len);

  textSize(12);
  for (let i = 0; i < min(10, all.length); i++) {
    let s = all[i];
    let yPos = lbY + 35 + i * 18;
    let txt = `${i + 1}. ${s.name.substring(0, 12)}`;
    let lenTxt = `${floor(s.len)}`;

    if (s === player) {
      fill(100, 255, 150);
    } else {
      fill(200, 200, 200, 180);
    }
    textAlign(LEFT);
    text(txt, lbX + 12, yPos);
    textAlign(RIGHT);
    text(lenTxt, lbX + lbWidth - 12, yPos);
  }

  // ===== Score (Bottom Left) =====
  textAlign(LEFT, BOTTOM);

  // Glow effect for score REMOVED
  // drawingContext.shadowBlur = 15;
  // drawingContext.shadowColor = 'rgba(0, 255, 200, 0.7)';

  fill(255);
  textSize(28);
  textStyle(BOLD);
  text(floor(player.len), 25, height - 25);

  drawingContext.shadowBlur = 0;

  textStyle(NORMAL);
  textSize(12);
  fill(200);
  text("LENGTH", 25, height - 55);

  // Rank
  let rank = all.indexOf(player) + 1;
  textSize(14);
  fill(180);
  text(`#${rank} of ${all.length}`, 25, height - 75);
}

function drawMinimap(camPos) {
  let mapSize = 120;
  let margin = 20;
  let cx = width - mapSize / 2 - margin;
  let cy = height - mapSize / 2 - margin;

  // Glow Border REMOVED
  // drawingContext.shadowBlur = 10;
  // drawingContext.shadowColor = 'rgba(0, 200, 255, 0.5)';

  // Background
  fill(0, 0, 0, 150);
  stroke(0, 200, 255, 100);
  strokeWeight(2);
  circle(cx, cy, mapSize);

  drawingContext.shadowBlur = 0;

  let scaleM = mapSize / (MAP_RADIUS * 2);

  noStroke();

  // Bots
  fill(150, 150, 150, 200);
  for (let b of bots) {
    let mx = cx + b.pos.x * scaleM;
    let my = cy + b.pos.y * scaleM;
    circle(mx, my, 3);
  }

  // Player
  fill(0, 255, 200);
  let px = cx + camPos.x * scaleM;
  let py = cy + camPos.y * scaleM;
  circle(px, py, 5);

  // Border indicator
  noFill();
  stroke(255, 50);
  strokeWeight(1);
  circle(cx, cy, mapSize); // Full map circle
}

// function windowResized() {
//   resizeCanvas(windowWidth, windowHeight);
//   if (bg) bg.resize(windowWidth, windowHeight);
// }

// Zoom Control - DISABLED
function mouseWheel(event) {
  // Manual zoom disabled to prevent glitches
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (bg) bg.resize(windowWidth, windowHeight);
}

function createBorderTexture() {
  let s = 64; // Texture tile size
  window.borderTexture = createGraphics(s, s);
  window.borderTexture.background(30, 30, 30); // Dark background base

  // Draw Hazard Stripes (Black and Yellow)
  window.borderTexture.stroke(255, 200, 0); // Yellow
  window.borderTexture.strokeWeight(10);

  // Diagonal lines
  for (let i = -s; i < s * 2; i += 20) {
    window.borderTexture.line(i, 0, i + s, s);
  }

  // Add some "grime" or noise effect
  window.borderTexture.noStroke();
  window.borderTexture.fill(0, 0, 0, 100);
  window.borderTexture.rect(0, 0, s, s);
}

// ============================================
// SPRITE CACHING SYSTEM FOR OPTIMIZATION
// ============================================

const spriteCache = new Map();

/**
 * Returns a cached p5.Graphics sprite for a body segment.
 * Includes baked-in glow for performance.
 */
function getSegmentSprite(c, radius, isBoosting) {
  // Round radius to reduce cache variants (e.g. 10.1 -> 11)
  let r = Math.ceil(radius);

  // Key: "r,g,b-radius-boost"
  let key = `${red(c)},${green(c)},${blue(c)}-${r}-${isBoosting}`;

  if (spriteCache.has(key)) {
    return spriteCache.get(key);
  }

  // Build and cache new sprite
  let sprite = buildSegmentSprite(c, r, isBoosting);
  spriteCache.set(key, sprite);
  return sprite;
}

/**
 * Generates a single segment sprite with soft glow.
 */
function buildSegmentSprite(c, r, isBoosting) {
  let padding = isBoosting ? 20 : 2;
  let size = (r + padding) * 2;
  let center = size / 2;

  let pg = createGraphics(size, size);

  // 1. Draw Glow (Soft Shadow) - ONLY IF BOOSTING
  if (isBoosting) {
    pg.drawingContext.shadowBlur = 15;
    pg.drawingContext.shadowColor = c;
  }

  pg.noStroke();
  pg.fill(c);

  // 2. Draw actual circle
  pg.circle(center, center, r * 2);

  return pg;
}