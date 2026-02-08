class Food {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.size = random(6, 12); // Smaller, like Slither.io

        // Slither.io-style palette (more pastel/vibrant)
        let colors = [
            color(255, 100, 100),  // Soft Red
            color(100, 255, 100),  // Soft Green
            color(100, 100, 255),  // Soft Blue
            color(255, 255, 100),  // Yellow
            color(255, 100, 255),  // Pink
            color(100, 255, 255),  // Cyan
            color(255, 180, 100)   // Orange
        ];
        this.color = random(colors);
        this.phase = random(TWO_PI);

        // Magnetic effect properties
        this.vel = createVector(0, 0);
        this.magnetStrength = 0.5; // How strong the pull is
        this.magnetRange = 80; // Distance at which food starts being attracted
    }

    update(snakes) {
        if (!snakes || snakes.length === 0) return;

        // Find closest snake
        let closest = null;
        let closestDist = Infinity;

        for (let snake of snakes) {
            if (!snake.alive) continue;
            let d = p5.Vector.dist(this.pos, snake.pos);
            if (d < closestDist) {
                closestDist = d;
                closest = snake;
            }
        }

        // Apply magnetic force if snake is close enough
        if (closest && closestDist < this.magnetRange) {
            // Calculate direction to snake
            let force = p5.Vector.sub(closest.pos, this.pos);

            // Normalize and scale by distance (closer = stronger pull)
            let strength = map(closestDist, 0, this.magnetRange, this.magnetStrength * 2, 0);
            force.setMag(strength);

            // Apply force with easing
            this.vel.add(force);
            this.vel.mult(0.85); // Damping for smooth curve

            // Update position
            this.pos.add(this.vel);
        } else {
            // Gradually stop moving when no snake nearby
            this.vel.mult(0.9);
            this.pos.add(this.vel);
        }
    }

    show() {
        // Strong glow effect REMOVED
        // drawingContext.shadowBlur = 15;
        // drawingContext.shadowColor = this.color;

        noStroke();
        fill(this.color);

        // Gentle pulse
        let s = this.size + sin(frameCount * 0.08 + this.phase) * 1.5;
        circle(this.pos.x, this.pos.y, s);

        // Inner bright core
        fill(255, 255, 255, 150);
        circle(this.pos.x, this.pos.y, s * 0.4);

        // drawingContext.shadowBlur = 0;
    }
}
