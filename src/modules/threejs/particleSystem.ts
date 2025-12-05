import * as THREE from "three";

// ========================
// Type Definitions
// ========================

export interface ParticleConfig {
  count: number;
  size: number;
  color: THREE.Color;
  glowColor: THREE.Color;
  spread: number;
  speed: number;
}

export interface ParticleState {
  isExploding: boolean;
  isDragging: boolean;
  isPulsing: boolean;
  scale: number;
  dragOffset: { x: number; y: number };
  explosionOrigin: THREE.Vector3 | null;
  explosionProgress: number;
}

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: ParticleConfig = {
  count: 5000,
  size: 2,
  color: new THREE.Color(0x00d4ff),
  glowColor: new THREE.Color(0x66e5ff),
  spread: 50,
  speed: 0.5,
};

// ========================
// Particle System Class
// ========================

export class ParticleSystem {
  private particles: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private config: ParticleConfig;
  private state: ParticleState;
  private originalPositions: Float32Array | null = null;
  private velocities: Float32Array | null = null;
  private time: number = 0;

  constructor(config: Partial<ParticleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isExploding: false,
      isDragging: false,
      isPulsing: false,
      scale: 1,
      dragOffset: { x: 0, y: 0 },
      explosionOrigin: null,
      explosionProgress: 0,
    };
  }

  // ========================
  // Initialization
  // ========================

  create(): THREE.Points {
    const { count, spread } = this.config;

    // Create geometry
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);

    this.originalPositions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Spherical distribution
      const radius = Math.random() * spread;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Store original positions
      this.originalPositions[i3] = positions[i3];
      this.originalPositions[i3 + 1] = positions[i3 + 1];
      this.originalPositions[i3 + 2] = positions[i3 + 2];

      // Initialize velocities
      this.velocities[i3] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;

      // Colors with variation
      const colorVariation = 0.8 + Math.random() * 0.4;
      colors[i3] = this.config.color.r * colorVariation;
      colors[i3 + 1] = this.config.color.g * colorVariation;
      colors[i3 + 2] = this.config.color.b * colorVariation;

      // Random sizes
      sizes[i] = this.config.size * (0.5 + Math.random() * 1.5);

      // Random value for shader
      randoms[i] = Math.random();
    }

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("random", new THREE.BufferAttribute(randoms, 1));

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uPulseIntensity: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float random;
        
        uniform float uTime;
        uniform float uScale;
        uniform float uPulseIntensity;
        uniform float uPixelRatio;
        
        varying vec3 vColor;
        varying float vRandom;
        
        void main() {
          vColor = color;
          vRandom = random;
          
          vec3 pos = position;
          
          // Subtle floating animation
          float floatOffset = sin(uTime * 0.5 + random * 6.28) * 0.5;
          pos.y += floatOffset;
          
          // Pulse effect
          float pulseScale = 1.0 + uPulseIntensity * sin(uTime * 5.0 + random * 3.14) * 0.1;
          pos *= pulseScale;
          
          // Apply global scale
          pos *= uScale;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Size attenuation
          float sizeScale = 1.0 + uPulseIntensity * 0.5;
          gl_PointSize = size * sizeScale * uPixelRatio * (300.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vRandom;
        
        void main() {
          // Create circular particle with soft edge
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          
          if (dist > 0.5) discard;
          
          // Soft glow effect
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha *= 0.8 + vRandom * 0.2;
          
          // Add core brightness
          float core = 1.0 - smoothstep(0.0, 0.2, dist);
          vec3 finalColor = vColor + vec3(core * 0.5);
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.particles = new THREE.Points(this.geometry, this.material);
    return this.particles;
  }

  // ========================
  // Animation & Effects
  // ========================

  update(deltaTime: number): void {
    if (!this.material || !this.geometry) return;

    this.time += deltaTime;
    this.material.uniforms.uTime.value = this.time;

    // Handle explosion animation
    if (this.state.isExploding) {
      this.updateExplosion(deltaTime);
    }

    // Handle drag effect
    if (this.state.isDragging) {
      this.updateDrag();
    }

    // Update scale
    this.material.uniforms.uScale.value = this.state.scale;

    // Update pulse intensity based on speaking
    const targetPulse = this.state.isPulsing ? 1 : 0;
    const currentPulse = this.material.uniforms.uPulseIntensity.value;
    this.material.uniforms.uPulseIntensity.value +=
      (targetPulse - currentPulse) * 0.1;
  }

  // ========================
  // Explosion Effect
  // ========================

  triggerExplosion(origin: THREE.Vector3): void {
    if (!this.geometry || !this.originalPositions || !this.velocities) return;

    this.state.isExploding = true;
    this.state.explosionOrigin = origin;
    this.state.explosionProgress = 0;

    const positions = this.geometry.attributes.position.array as Float32Array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Calculate direction from origin
      const dx = positions[i3] - origin.x;
      const dy = positions[i3 + 1] - origin.y;
      const dz = positions[i3 + 2] - origin.z;

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;

      // Set velocity away from origin
      const speed = 20 / dist;
      this.velocities[i3] = (dx / dist) * speed;
      this.velocities[i3 + 1] = (dy / dist) * speed;
      this.velocities[i3 + 2] = (dz / dist) * speed;
    }
  }

  private updateExplosion(deltaTime: number): void {
    if (!this.geometry || !this.velocities || !this.originalPositions) return;

    const positions = this.geometry.attributes.position.array as Float32Array;
    const count = positions.length / 3;

    this.state.explosionProgress += deltaTime;

    // Explosion phase
    if (this.state.explosionProgress < 1) {
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3] += this.velocities[i3] * deltaTime * 2;
        positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime * 2;
        positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime * 2;

        // Damping
        this.velocities[i3] *= 0.98;
        this.velocities[i3 + 1] *= 0.98;
        this.velocities[i3 + 2] *= 0.98;
      }
    }
    // Return phase
    else if (this.state.explosionProgress < 3) {
      const returnSpeed = (this.state.explosionProgress - 1) / 2;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3] +=
          (this.originalPositions[i3] - positions[i3]) *
          returnSpeed *
          deltaTime;
        positions[i3 + 1] +=
          (this.originalPositions[i3 + 1] - positions[i3 + 1]) *
          returnSpeed *
          deltaTime;
        positions[i3 + 2] +=
          (this.originalPositions[i3 + 2] - positions[i3 + 2]) *
          returnSpeed *
          deltaTime;
      }
    }
    // End explosion
    else {
      this.state.isExploding = false;
      this.state.explosionOrigin = null;

      // Snap to original positions
      for (let i = 0; i < positions.length; i++) {
        positions[i] = this.originalPositions[i];
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  // ========================
  // Drag Effect
  // ========================

  setDragging(isDragging: boolean, dx: number = 0, dy: number = 0): void {
    this.state.isDragging = isDragging;
    if (isDragging) {
      this.state.dragOffset.x += dx * 0.1;
      this.state.dragOffset.y += dy * 0.1;
    }
  }

  private updateDrag(): void {
    if (!this.geometry || !this.originalPositions) return;

    const positions = this.geometry.attributes.position.array as Float32Array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const dist = Math.sqrt(
        positions[i3] * positions[i3] +
          positions[i3 + 1] * positions[i3 + 1] +
          positions[i3 + 2] * positions[i3 + 2]
      );

      // Particles closer to center move more with drag
      const influence = 1 - Math.min(dist / this.config.spread, 1);

      positions[i3] =
        this.originalPositions[i3] + this.state.dragOffset.x * influence;
      positions[i3 + 1] =
        this.originalPositions[i3 + 1] - this.state.dragOffset.y * influence;
    }

    // Gradually return to original
    this.state.dragOffset.x *= 0.95;
    this.state.dragOffset.y *= 0.95;

    if (
      Math.abs(this.state.dragOffset.x) < 0.01 &&
      Math.abs(this.state.dragOffset.y) < 0.01
    ) {
      this.state.isDragging = false;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  // ========================
  // Scale Effect
  // ========================

  setScale(scale: number): void {
    this.state.scale = Math.max(0.1, Math.min(3, scale));
  }

  // ========================
  // Pulse Effect (Speaking)
  // ========================

  setPulsing(isPulsing: boolean): void {
    this.state.isPulsing = isPulsing;
  }

  // ========================
  // Color Management
  // ========================

  setColors(primary: THREE.Color, glow: THREE.Color): void {
    if (!this.geometry) return;

    this.config.color = primary;
    this.config.glowColor = glow;

    const colors = this.geometry.attributes.color.array as Float32Array;
    const count = colors.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const variation = 0.8 + Math.random() * 0.4;
      colors[i3] = primary.r * variation;
      colors[i3 + 1] = primary.g * variation;
      colors[i3 + 2] = primary.b * variation;
    }

    this.geometry.attributes.color.needsUpdate = true;
  }

  // ========================
  // Getters
  // ========================

  getParticles(): THREE.Points | null {
    return this.particles;
  }

  getState(): ParticleState {
    return { ...this.state };
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    this.particles = null;
    this.geometry = null;
    this.material = null;
  }
}
