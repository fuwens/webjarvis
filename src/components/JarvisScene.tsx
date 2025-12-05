import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { ParticleField } from './ParticleField'
import { useJarvisStore } from '../stores/useJarvisStore'

// Rotating ring component
function HolographicRing({ radius, speed, color }: { radius: number; speed: number; color: string }) {
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * speed
      ringRef.current.rotation.x += delta * speed * 0.3
    }
  })

  return (
    <mesh ref={ringRef}>
      <torusGeometry args={[radius, 0.05, 16, 100]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  )
}

// Ambient particles (small background particles)
function AmbientParticles() {
  const ref = useRef<THREE.Points>(null)
  const count = 500

  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200
  }

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.02
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        color="#00d4ff"
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  )
}

// Grid floor
function GridFloor() {
  return (
    <group position={[0, -30, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <gridHelper args={[200, 40, '#003366', '#001a33']} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  )
}

// Scene content
function SceneContent() {
  const { theme } = useJarvisStore()
  
  // Get theme colors
  const getThemeColor = () => {
    switch (theme) {
      case 'neon-purple': return '#bf00ff'
      case 'holo-green': return '#00ff88'
      default: return '#00d4ff'
    }
  }

  const primaryColor = getThemeColor()

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 0, 80]} fov={60} />
      
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color={primaryColor} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color={primaryColor} />
      
      {/* Main particle system */}
      <ParticleField count={5000} spread={45} />
      
      {/* Holographic rings */}
      <HolographicRing radius={35} speed={0.2} color={primaryColor} />
      <HolographicRing radius={40} speed={-0.15} color={primaryColor} />
      <HolographicRing radius={45} speed={0.1} color={primaryColor} />
      
      {/* Background particles */}
      <AmbientParticles />
      
      {/* Grid floor */}
      <GridFloor />
      
      {/* Controls - disabled by default, can enable for debug */}
      <OrbitControls 
        enableZoom={false} 
        enablePan={false} 
        enableRotate={false}
        // enableRotate={true} // Uncomment for debug
      />
    </>
  )
}

// Loading fallback
function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[2, 32, 32]} />
      <meshBasicMaterial color="#00d4ff" wireframe />
    </mesh>
  )
}

// Main scene component
export function JarvisScene() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}

