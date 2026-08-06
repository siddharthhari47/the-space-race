import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import Aircraft from "./Aircraft";

// No external HDRI — a hemisphere light plus two directional lights gives a
// soft studio look without an extra network fetch, keeping this bundle
// self-contained and fast.
function Scene() {
  return (
    <>
      <hemisphereLight args={["#e8ecf5", "#05070f", 0.9]} />
      <directionalLight position={[4, 5, 3]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />

      <Aircraft />

      <ContactShadows position={[0, -1.4, 0]} opacity={0.45} scale={10} blur={2.5} far={2} />

      {/* autoRotate's built-in behavior already pauses while the user is
          dragging and resumes from wherever they left the camera — no
          custom interaction-state tracking needed */}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        enableZoom
        enablePan={false}
        minDistance={3}
        maxDistance={10}
        autoRotate
        autoRotateSpeed={0.8}
      />
    </>
  );
}

function mount() {
  const container = document.getElementById("aircraft-3d-root");
  if (!container) return;

  createRoot(container).render(
    <StrictMode>
      <Canvas shadows camera={{ position: [4.5, 1.8, 4.5], fov: 40 }} dpr={[1, 1.75]}>
        <color attach="background" args={["#05070f"]} />
        <Scene />
      </Canvas>
    </StrictMode>
  );
}

mount();
