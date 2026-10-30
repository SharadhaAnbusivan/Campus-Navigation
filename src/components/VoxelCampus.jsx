
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function Block({ position, size, color }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshLambertMaterial color={color} flatShading />
    </mesh>
  );
}

function Tree({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <Block position={[0, 0.7, 0]} size={[0.35, 1.4, 0.35]} color="#795548" />
      <Block position={[0, 1.8, 0]} size={[1.2, 1.1, 1.2]} color="#27834a" />
      <Block position={[0, 2.5, 0]} size={[0.8, 0.8, 0.8]} color="#39a85b" />
    </group>
  );
}

function Building({ position, width, depth, height, color, label }) {
  return (
    <group position={position}>
      <Block
        position={[0, height / 2, 0]}
        size={[width, height, depth]}
        color={color}
      />
      <Block
        position={[0, height + 0.15, 0]}
        size={[width + 0.3, 0.3, depth + 0.3]}
        color="#64748b"
      />
      {Array.from({ length: Math.max(2, Math.floor(width / 1.2)) }).map(
        (_, i, arr) => {
          const x = (i - (arr.length - 1) / 2) * (width / arr.length);
          return (
            <Block
              key={i}
              position={[x, height * 0.62, depth / 2 + 0.015]}
              size={[0.35, 0.5, 0.05]}
              color="#93d5f5"
            />
          );
        }
      )}
      <Block
        position={[0, 0.8, depth / 2 + 0.04]}
        size={[0.55, 1.5, 0.08]}
        color="#4b3529"
      />
    </group>
  );
}

function CampusWorld() {
  const trees = useMemo(
    () => [
      [-8, -6], [-7, -2], [-8, 3], [-6, 7],
      [8, -6], [7, -2], [8, 3], [6, 7],
      [-3, -8], [2, -8], [-3, 8], [3, 8],
    ],
    []
  );

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[10, 15, 8]} intensity={2} castShadow />

      {/* Ground */}
      <Block
        position={[0, -0.25, 0]}
        size={[22, 0.5, 22]}
        color="#79b85b"
      />

      {/* Main paths — temporary layout */}
      <Block position={[0, 0.02, 0]} size={[2, 0.05, 19]} color="#d8c79b" />
      <Block position={[0, 0.03, 0]} size={[17, 0.06, 2]} color="#d8c79b" />
      <Block position={[-4, 0.04, 3]} size={[2, 0.07, 6]} color="#d8c79b" />
      <Block position={[4, 0.04, -3]} size={[2, 0.07, 6]} color="#d8c79b" />

      {/* Placeholder buildings — not yet mapped to real campus coordinates */}
      <Building position={[-4, 0, -3]} width={3.2} depth={2.5} height={2.8} color="#e8d5b5" />
      <Building position={[4, 0, -3]} width={3.4} depth={2.5} height={3.6} color="#d6c5ac" />
      <Building position={[-4, 0, 4]} width={3.6} depth={2.8} height={2.5} color="#e4c9a1" />
      <Building position={[4, 0, 4]} width={3.1} depth={2.7} height={3} color="#c9d6dc" />

      {trees.map(([x, z], i) => (
        <Tree key={i} x={x} z={z} />
      ))}

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
        maxDistance={30}
      />
    </>
  );
}

export default function VoxelCampus() {
  return (
    <div className="voxel-campus">
      <Canvas
        shadows
        camera={{ position: [14, 13, 16], fov: 45 }}
        dpr={1}
      >
        <color attach="background" args={["#b9ddf5"]} />
        <CampusWorld />
      </Canvas>
      <div className="voxel-map-label">
        CAMPUS EXPLORER · PROTOTYPE
      </div>
    </div>
  );
}