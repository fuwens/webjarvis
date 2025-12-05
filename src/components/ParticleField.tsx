import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useJarvisStore } from "../stores/useJarvisStore";

interface ParticleFieldProps {
  count?: number;
  spread?: number;
}

export function ParticleField({
  count = 5000,
  spread = 50,
}: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { isSpeaking, currentGesture, pinchScale, dragDelta, pointerPosition } =
    useJarvisStore();

  // Store for animation state
  const stateRef = useRef({
    time: 0,
    targetScale: 1,
    currentScale: 1,
    explosionProgress: 0,
    isExploding: false,
    dragOffset: { x: 0, y: 0 },
  });

  // Generate particle data
  const { positions, colors, sizes, randoms, originalPositions } =
    useMemo(() => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const randoms = new Float32Array(count);
      const originalPositions = new Float32Array(count * 3);

      const color = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Spherical distribution
        const radius = Math.random() * spread;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        // Store original
        originalPositions[i3] = positions[i3];
        originalPositions[i3 + 1] = positions[i3 + 1];
        originalPositions[i3 + 2] = positions[i3 + 2];

        // Colors - will be updated by CSS variables
        color.setHSL(
          0.55 + Math.random() * 0.1,
          0.8,
          0.5 + Math.random() * 0.3
        );
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;

        sizes[i] = 1.5 + Math.random() * 2;
        randoms[i] = Math.random();
      }

      return { positions, colors, sizes, randoms, originalPositions };
    }, [count, spread]);

  // Shader material
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
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
          
          // Horizontal drift
          pos.x += sin(uTime * 0.3 + random * 4.0) * 0.3;
          pos.z += cos(uTime * 0.4 + random * 5.0) * 0.3;
          
          // Pulse effect when speaking
          float pulseScale = 1.0 + uPulseIntensity * sin(uTime * 8.0 + random * 3.14) * 0.15;
          pos *= pulseScale;
          
          // Apply global scale
          pos *= uScale;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          // Size with pulse
          float sizeScale = 1.0 + uPulseIntensity * 0.5;
          gl_PointSize = size * sizeScale * uPixelRatio * (200.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vRandom;
        
        void main() {
          // Circular particle with soft edge
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          
          if (dist > 0.5) discard;
          
          // Soft glow
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha *= 0.7 + vRandom * 0.3;
          
          // Core brightness
          float core = 1.0 - smoothstep(0.0, 0.15, dist);
          vec3 finalColor = vColor + vec3(core * 0.6);
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
  }, []);

  // Handle explosion trigger
  useEffect(() => {
    if (currentGesture === "click" && !stateRef.current.isExploding) {
      stateRef.current.isExploding = true;
      stateRef.current.explosionProgress = 0;
    }
  }, [currentGesture, pointerPosition]);

  // Handle drag
  useEffect(() => {
    if (currentGesture === "drag") {
      stateRef.current.dragOffset.x += dragDelta.dx * 0.1;
      stateRef.current.dragOffset.y -= dragDelta.dy * 0.1;
    }
  }, [currentGesture, dragDelta]);

  // Handle scale
  useEffect(() => {
    stateRef.current.targetScale = pinchScale;
  }, [pinchScale]);

  // Animation loop
  useFrame((_, delta) => {
    if (!pointsRef.current || !materialRef.current) return;

    const state = stateRef.current;
    state.time += delta;

    // Update uniforms
    materialRef.current.uniforms.uTime.value = state.time;

    // Smooth scale
    state.currentScale += (state.targetScale - state.currentScale) * 0.1;
    materialRef.current.uniforms.uScale.value = state.currentScale;

    // Pulse when speaking
    const targetPulse = isSpeaking ? 1 : 0;
    const currentPulse = materialRef.current.uniforms.uPulseIntensity.value;
    materialRef.current.uniforms.uPulseIntensity.value +=
      (targetPulse - currentPulse) * 0.1;

    // Handle explosion animation
    const geometry = pointsRef.current.geometry;
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute;
    const posArray = positionAttr.array as Float32Array;

    if (state.isExploding) {
      state.explosionProgress += delta;

      if (state.explosionProgress < 0.5) {
        // Explosion outward
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const dx = posArray[i3] - 0;
          const dy = posArray[i3 + 1] - 0;
          const dz = posArray[i3 + 2] - 0;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;

          posArray[i3] += (dx / dist) * delta * 50;
          posArray[i3 + 1] += (dy / dist) * delta * 50;
          posArray[i3 + 2] += (dz / dist) * delta * 50;
        }
      } else if (state.explosionProgress < 2) {
        // Return to original
        const returnSpeed = (state.explosionProgress - 0.5) / 1.5;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          posArray[i3] +=
            (originalPositions[i3] - posArray[i3]) * returnSpeed * delta * 2;
          posArray[i3 + 1] +=
            (originalPositions[i3 + 1] - posArray[i3 + 1]) *
            returnSpeed *
            delta *
            2;
          posArray[i3 + 2] +=
            (originalPositions[i3 + 2] - posArray[i3 + 2]) *
            returnSpeed *
            delta *
            2;
        }
      } else {
        // Reset
        state.isExploding = false;
        for (let i = 0; i < posArray.length; i++) {
          posArray[i] = originalPositions[i];
        }
      }
      positionAttr.needsUpdate = true;
    }

    // Handle drag offset
    if (
      Math.abs(state.dragOffset.x) > 0.01 ||
      Math.abs(state.dragOffset.y) > 0.01
    ) {
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const dist = Math.sqrt(
          originalPositions[i3] ** 2 +
            originalPositions[i3 + 1] ** 2 +
            originalPositions[i3 + 2] ** 2
        );
        const influence = 1 - Math.min(dist / spread, 1);

        posArray[i3] = originalPositions[i3] + state.dragOffset.x * influence;
        posArray[i3 + 1] =
          originalPositions[i3 + 1] + state.dragOffset.y * influence;
      }

      state.dragOffset.x *= 0.95;
      state.dragOffset.y *= 0.95;
      positionAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-random"
          count={count}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <primitive object={shaderMaterial} ref={materialRef} attach="material" />
    </points>
  );
}
