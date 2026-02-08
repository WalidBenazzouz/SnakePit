class Bot extends Snake {
    constructor(x, y) {
        // Pass random skinId (1-8) to parent Snake class
        super(x, y, Bot.getRandomName(), floor(random(1, 9)));
        this.grow(floor(random(5, 50)));

        // AI Personality / Skill (0.0 to 1.0)
        // 0.0 = Tourist (Passive, slow, wanders)
        // 0.5 = Casual (Normal, eats food, sometimes attacks)
        // 1.0 = Pro (Aggressive, boosts, intercepts)
        // AI Personality / Skill (0.0 to 1.0)
        // Squared random skews distribution towards 0 (More Noobs)
        this.skill = random(1) * random(1);

        // Determine stats based on skill
        if (this.skill < 0.3) {
            // NOOB
            // Name is already set by super()
            this.reactionTime = 60; // Very slow (1 sec)
            this.aggression = 0.0; // Coward
            this.avoidanceChance = 0.8; // 20% chance to fail avoidance
            this.mistakeChance = 0.0005; // 0.05% chance per frame (drastically reduced)
        } else if (this.skill < 0.7) {
            // CASUAL
            // Name is already set by super()
            this.reactionTime = 30; // Normal (0.5 sec)
            this.aggression = 0.2;
            this.avoidanceChance = 0.95; // 5% chance to fail
            this.mistakeChance = 0.0001; // 0.01% chance (very rare)
        } else {
            // PRO
            // Name is already set by super()
            this.reactionTime = 15; // Fast (0.25 sec)
            this.aggression = 0.8;
            this.avoidanceChance = 1.0; // Perfect avoidance
            this.mistakeChance = 0.0; // Never confused
        }

        this.mistakeTimer = 0;
        this.isConfused = false;

        this.target = createVector(x, y);
        this.state = "WANDER";
        this.targetSnake = null;

        // Wander Behavior Variables (Reynolds Style)
        this.wanderTheta = 0;
    }

    updateBot(foodList, otherSnakes) {
        if (!this.alive) return null;

        // Reaction delay based on skill
        if (frameCount % this.reactionTime === 0) {
            this.makeDecision(foodList, otherSnakes);
        }

        let steerTarget = this.target;

        if (this.state === "WANDER") {
            // Reynolds' Wander
            let wanderRadius = 50;         // Radius of the wander circle
            let wanderDistance = 100;      // Distance the circle is in front of the bot
            let change = 0.3;              // Maximum change in angle per frame

            this.wanderTheta += random(-change, change);

            // Calculate Circle Center (Relative to bot)
            // We use velocity heading to "project" the circle in front
            let circleCenter = this.vel.copy();
            circleCenter.setMag(wanderDistance);

            // Calculate Displacement on the circle
            // Offset logic: relative to the circle center, pointing "out"
            // The angle is relative to the bot's heading to keep it forward-focused
            let h = this.vel.heading();
            let displacement = createVector(wanderRadius * cos(this.wanderTheta + h), wanderRadius * sin(this.wanderTheta + h));

            // Target is Circle Center + Displacement
            let targetLocal = p5.Vector.add(circleCenter, displacement);

            // Convert to World Position for steering
            this.target = p5.Vector.add(this.pos, targetLocal);
            steerTarget = this.target;

            this.boost = false;
        }
        else if (this.state === "SEEK") {
            this.boost = false;
        }
        else if (this.state === "ATTACK") {
            if (this.targetSnake && this.targetSnake.alive) {
                // Pro bots predict better
                let lead = this.skill > 0.8 ? 30 : 10;
                let prediction = p5.Vector.add(this.targetSnake.pos, p5.Vector.mult(this.targetSnake.vel, lead));
                steerTarget = prediction;

                // Boost logic
                let d = p5.Vector.dist(this.pos, this.targetSnake.pos);
                // Only boost if skilled enough and close
                this.boost = (this.skill > 0.5) && (d < 400 && d > 100);
            } else {
                this.state = "WANDER";
            }
        }
        else if (this.state === "FLEE") {
            this.boost = true;
        }

        // Avoidance (Always active)
        let avoidVector = this.getAvoidVector(otherSnakes);
        if (avoidVector) {
            steerTarget = p5.Vector.add(this.pos, avoidVector);
            // Low skill bots might not react fast enough to flee visually, 
            // but we force the steering here for survival basics.
            // Maybe low skill bots panic less effectively?
            // Let's keep avoid strong for all for now so they don't just die instantly.
            this.state = "WANDER";
        }
        this.wanderAngle = random(TWO_PI);

        // Update physics
        return this.update(steerTarget);
    }

    update(target) {
        // Manage Mistake Timer
        if (this.mistakeTimer > 0) {
            this.mistakeTimer--;
            if (this.mistakeTimer <= 0) {
                this.isConfused = false;
                // Reset to wander after confusion
                this.state = "WANDER";
            }
        } else {
            // Chance to start a mistake
            if (random(1) < this.mistakeChance) {
                this.isConfused = true;
                this.mistakeTimer = floor(random(30, 90)); // Confused for 0.5 - 1.5 seconds
                this.state = "CONFUSED";
            }
        }

        super.update(target);
    }

    makeDecision(foodList, otherSnakes) {
        // If confused, do nothing (keep wandering blindly)
        if (this.isConfused) {
            this.state = "CONFUSED";
            return;
        }

        this.state = "WANDER";
        this.targetSnake = null;

        // 1. Attack Logic (Aggression check)
        // High skill = higher check rate
        if (random(1) < this.aggression) {
            let nearestSnake = null;
            let nearestDist = Infinity;

            for (let other of otherSnakes) {
                if (other === this || !other.alive) continue;
                let d = p5.Vector.dist(this.pos, other.pos);
                // Attack range
                if (d < 500 && d < nearestDist) {
                    nearestDist = d;
                    nearestSnake = other;
                }
            }

            if (nearestSnake) {
                // If I'm a Pro, I attack big snakes too. Tourist only smaller.
                if (this.skill > 0.8 || this.len > nearestSnake.len) {
                    this.state = "ATTACK";
                    this.targetSnake = nearestSnake;
                    return; // Focus on attack
                }
            }
        }

        // 2. Food Logic
        let closestFood = null;
        let bestScore = -Infinity;
        // Reduce vision so they wander more often
        let searchRadius = 150 + (this.r * 2);

        for (let f of foodList) {
            let d = p5.Vector.dist(this.pos, f.pos);
            if (d < searchRadius) {
                // Score = Size / Distance
                let score = (f.size * 10) - d;
                if (score > bestScore) {
                    bestScore = score;
                    closestFood = f;
                }
            }
        }

        if (closestFood) {
            this.state = "SEEK";
            this.target = closestFood.pos;

            // ARRIVAL BEHAVIOR
            // Calculate distance to food
            let d = p5.Vector.dist(this.pos, this.target);
            let arrivalRadius = 100;

            if (d < arrivalRadius) {
                // Slow down as we get closer to turn sharper
                // Map distance (0 to 100) to speed (0.3 to 1.0)
                this.speedMultiplier = map(d, 0, arrivalRadius, 0.3, 1.0);
            } else {
                this.speedMultiplier = 1.0;
            }
        } else {
            this.speedMultiplier = 1.0;
        }
    }

    getAvoidVector(otherSnakes) {
        // CONFUSION CHECK: If confused, bot is BLIND to danger!
        if (this.isConfused) return null;

        // Skill Check: Dumb bots might "miss" spotting a snake
        if (random(1) > this.avoidanceChance) return null;

        let steer = createVector(0, 0);
        let count = 0;
        let detectionRadius = this.r * 2 + 50;

        // Optimization: Only check local
        for (let other of otherSnakes) {
            if (other === this || !other.alive) continue;
            if (p5.Vector.dist(this.pos, other.pos) > 800) continue;

            for (let i = 0; i < other.history.length; i += 5) {
                let seg = other.history[i];
                let d = p5.Vector.dist(this.pos, seg);

                if (d < detectionRadius) {
                    let diff = p5.Vector.sub(this.pos, seg);
                    diff.normalize();
                    diff.div(d);
                    steer.add(diff);
                    count++;
                }
            }
        }

        if (count > 0) {
            steer.setMag(100);
            return steer;
        }
        return null;
    }



    show(camPos) {
        super.show(camPos); // Draw snake normally

        if (typeof debugMode !== 'undefined' && debugMode) {
            push();
            translate(this.pos.x, this.pos.y);

            // Vision Radius
            noFill();
            stroke(255, 50);
            circle(0, 0, 300 * 2); // Approx vision

            // State Text
            fill(255);
            noStroke();
            textAlign(CENTER);
            textSize(12);
            text(this.state, 0, -this.r * 3);

            // Target / Wander Visualization
            strokeWeight(2);
            if (this.state === "WANDER") {
                stroke(255, 100); // White-ish for structure
                noFill();

                // Re-calculate the local circle center for drawing
                // It's "wanderDistance" in front of the bot (which is at 0,0 here because of translate)
                // But remember we are rotating by this.angle in show usually? 
                // Wait, super.show() does NOT rotate the context, it draws from history.
                // BUT snake HEAD is at this.pos.
                // The `this.vel` defines the forward direction.

                // We need to rotate to align with velocity to draw the "front" circle easily, 
                // OR just calculate the vector in world space and subtract pos (which is 0,0 here).

                let wanderDistance = 100;
                let wanderRadius = 50;

                // Circle Center (Local)
                // Since we are at (0,0) = this.pos, we just need the velocity vector scaled
                let center = this.vel.copy();
                center.setMag(wanderDistance);

                // Draw "Rod" to circle center
                line(0, 0, center.x, center.y);

                // Draw Wander Circle
                stroke(50, 200, 255);
                circle(center.x, center.y, wanderRadius * 2);

                // Draw Target Point on Circle
                let targetLocal = p5.Vector.sub(this.target, this.pos);
                fill(0, 255, 0);
                noStroke();
                circle(targetLocal.x, targetLocal.y, 8);

                // Line from Circle Center to Target
                stroke(255, 100);
                line(center.x, center.y, targetLocal.x, targetLocal.y);

            } else if (this.state === "ATTACK" && this.targetSnake) {
                // Line to predicted target
                stroke(255, 0, 0);
                let targetLocal = p5.Vector.sub(this.target, this.pos);
                line(0, 0, targetLocal.x, targetLocal.y);

                // Draw Target Snake Highlight
                noFill();
                stroke(255, 0, 0, 100);
                let snakeLocal = p5.Vector.sub(this.targetSnake.pos, this.pos);
                circle(snakeLocal.x, snakeLocal.y, 50);
            } else if (this.state === "SEEK") {
                stroke(0, 255, 0);
                let targetLocal = p5.Vector.sub(this.target, this.pos);
                line(0, 0, targetLocal.x, targetLocal.y);
            }

            pop();
        }
    }
    static getRandomName() {
        let pres = [
            "Walid", "Benazzouz", "Michel Buffa", "Player", "Guest",
            "Snake", "Viper", "Cobra", "Mamba", "Boa", "Kaa", "Hydra",
            "Noodle", "Worm", "Snek", "Pro", "Noob", "King", "Queen",
            "Shadow", "Ghost", "Spectre", "Phantom", "Spirit", "Soul"
        ];
        return random(pres) + floor(random(999));
    }
}
