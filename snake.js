class Snake {
    constructor(x, y, name = "Player", skinId = 1) {
        this.pos = createVector(x, y);
        this.vel = createVector(1, 0); // Start moving
        this.r = 12; // Base radius
        this.name = name;
        this.history = []; // Trail of positions
        this.len = 20; // Initial length (number of segments)
        this.baseSpacing = 3; // Tight spacing for tube effect
        this.segmentSpacing = 3; // Initialize to prevent undefined error

        // Smooth turning
        this.angle = 0;

        // State
        this.alive = true;
        this.boost = false;
        this.speedMultiplier = 1.0;

        // Skin ID (1-8)
        this.skinId = skinId;

        // Color (fallback)
        this.color = color(random(100, 255), random(50, 200), random(100, 255));
    }

    update(target) {
        if (!this.alive) return null;

        // Calculate desired angle
        let desired = p5.Vector.sub(target, this.pos);

        // Add Boundary Repulsion (Reynolds Containment)
        let repulsion = this.getBoundaryRepulsion();
        if (repulsion) {
            desired.add(repulsion); // Steer towards center if near wall
        }

        let targetAngle = desired.heading();

        // Smooth turn (lerp angle)
        let diff = targetAngle - this.angle;
        if (diff > PI) diff -= TWO_PI;
        if (diff < -PI) diff += TWO_PI;
        this.angle += diff * 0.1;

        // Speed logic
        let speed = (this.boost ? 8 : 4) * this.speedMultiplier;

        // Mass Loss Logic
        let drop = null;
        if (this.boost && this.len > 10) {
            if (frameCount % 6 === 0) {
                this.len -= 1;
                if (this.history.length > 0) {
                    let tailPos = this.history[this.history.length - 1];
                    drop = new Food(tailPos.x, tailPos.y);
                    drop.size = random(8, 14);
                    drop.color = this.color;
                }
            }
        } else if (this.boost && this.len <= 10) {
            this.boost = false;
        }

        this.vel = p5.Vector.fromAngle(this.angle);
        this.vel.setMag(speed);

        // Move head
        this.history.unshift(this.pos.copy());
        this.pos.add(this.vel);

        // Map Boundaries (Circular)
        if (typeof MAP_RADIUS !== 'undefined') {
            let dist = this.pos.mag();
            let limit = MAP_RADIUS - this.r;
            if (dist > limit) {
                this.pos.setMag(limit);
            }
        }

        // History Management
        let count = floor(this.len * this.segmentSpacing);
        while (this.history.length > count) {
            this.history.pop();
        }

        return drop;
    }

    show(camPos) {
        if (!this.alive) return;

        noStroke();

        // Get RGB for shading
        let r = red(this.color);
        let g = green(this.color);
        let b = blue(this.color);

        // Boost Glow Effect REMOVED
        /*
        if (this.boost) {
            drawingContext.shadowBlur = 25;
            drawingContext.shadowColor = this.color;
        }
        */

        // OPTIMIZATION: Calculate View Bounds for Culling
        // Global camPos is available.
        // Screen bounds in World Coordinates:
        let viewportW = width / zoom;
        let viewportH = height / zoom;
        let leftBound = camPos.x - viewportW / 2 - 100; // 100px margin
        let rightBound = camPos.x + viewportW / 2 + 100;
        let topBound = camPos.y - viewportH / 2 - 100;
        let bottomBound = camPos.y + viewportH / 2 + 100;

        // Draw segments
        let maxSegments = floor(this.history.length / this.segmentSpacing);
        let segmentsToDraw = min(this.len, maxSegments);

        // Check if skinManager is available
        let useShader = window.skinManager && window.skinManager.ready;

        // Update shader texture for this snake's skin
        if (useShader) {
            window.skinManager.update(this.skinId);
        }

        for (let i = segmentsToDraw - 1; i >= 0; i--) {
            let index = i * this.segmentSpacing;
            if (index >= this.history.length || index < 0) continue;

            let pos = this.history[index];
            if (!pos) continue;

            // OPTIMIZATION: Frustum Culling
            if (pos.x < leftBound || pos.x > rightBound || pos.y < topBound || pos.y > bottomBound) {
                continue; // Skip off-screen segment
            }

            let radius = this.r;

            // Draw segment
            if (useShader) {
                // Draw shader texture
                let tex = window.skinManager.getTexture();
                if (tex) {
                    image(tex, pos.x - radius, pos.y - radius, radius * 2, radius * 2);
                } else {
                    fill(this.color);
                    circle(pos.x, pos.y, radius * 2);
                }
            } else {
                // Fallback: simple circle
                fill(this.color);
                circle(pos.x, pos.y, radius * 2);
            }
        }

        // ===== HEAD =====
        let headRadius = this.r * 1.15;

        // Shadow
        fill(r * 0.5, g * 0.5, b * 0.5);
        circle(this.pos.x, this.pos.y, headRadius * 2.2);

        // Main
        fill(r, g, b);
        circle(this.pos.x, this.pos.y - headRadius * 0.1, headRadius * 2);

        // ===== EYES =====
        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.angle);

        let eyeSpacing = headRadius * 0.55;
        let eyeSize = headRadius * 0.9;
        let eyeX = headRadius * 0.4;

        // White of eyes
        fill(255);
        circle(eyeX, -eyeSpacing, eyeSize);
        circle(eyeX, eyeSpacing, eyeSize);

        // Pupils - follow mouse for player, forward for bots
        fill(0);
        let pupilSize = eyeSize * 0.5;
        let pupilOffset = pupilSize * 0.25; // Max pupil movement

        // Calculate pupil offset based on look direction
        let lookOffsetX = pupilOffset; // Default: look forward
        let lookOffsetY = 0;

        // For player: calculate direction to mouse in local coordinates
        let isPlayer = (typeof player !== 'undefined' && this === player);
        if (isPlayer) {
            // Get mouse position in world coordinates
            let worldMouseX = (mouseX - width / 2) / zoom + camPos.x;
            let worldMouseY = (mouseY - height / 2) / zoom + camPos.y;

            // Direction from head to mouse
            let toMouseX = worldMouseX - this.pos.x;
            let toMouseY = worldMouseY - this.pos.y;

            // Rotate to local coordinates (undo head rotation)
            let cosA = cos(-this.angle);
            let sinA = sin(-this.angle);
            let localX = toMouseX * cosA - toMouseY * sinA;
            let localY = toMouseX * sinA + toMouseY * cosA;

            // Normalize and apply offset
            let dist = sqrt(localX * localX + localY * localY);
            if (dist > 1) {
                lookOffsetX = (localX / dist) * pupilOffset;
                lookOffsetY = (localY / dist) * pupilOffset;
            }
        }

        // Draw pupils with offset
        circle(eyeX + lookOffsetX, -eyeSpacing + lookOffsetY, pupilSize);
        circle(eyeX + lookOffsetX, eyeSpacing + lookOffsetY, pupilSize);

        pop();

        // Name tag
        fill(255);
        textAlign(CENTER);
        textSize(10);
        text(this.name, this.pos.x, this.pos.y - this.r * 2.2);
    }

    grow(amount = 1) {
        this.len += amount;
        this.r = min(25, 12 + this.len * 0.05); // Cap radius
    }

    // Called when snake dies - spawns food along body
    die() {
        this.alive = false;
        let foodDropped = [];

        // Spawn food along the body trail
        for (let i = 0; i < this.history.length; i += 4) {
            let pos = this.history[i];
            if (pos) {
                let f = new Food(pos.x + random(-5, 5), pos.y + random(-5, 5));
                f.size = random(8, 14);
                f.color = this.color;
                foodDropped.push(f);
            }
        }

        return foodDropped;
    }

    checkCollision(others) {
        // Check if head touches any other snake's body
        for (let other of others) {
            if (other === this) continue;
            if (!other.alive) continue;

            for (let i = 0; i < other.history.length; i += 5) {
                let segPos = other.history[i];
                if (!segPos) continue;
                let d = p5.Vector.dist(this.pos, segPos);
                if (d < this.r + other.r) {
                    return this.die(); // Return dropped food array
                }
            }
        }
        return null;
    }

    getBoundaryRepulsion() {
        if (typeof MAP_RADIUS === 'undefined') return null;

        let margin = 50; // Contact distance for repulsion
        let dist = this.pos.mag();

        // If close to edge (or outside for some reason)
        if (dist > MAP_RADIUS - margin) {
            // Force points opposite to current position (inwards)
            let force = p5.Vector.mult(this.pos, -1);
            force.setMag(1000); // Strong repulsion
            return force;
        }
        return null;
    }
}
