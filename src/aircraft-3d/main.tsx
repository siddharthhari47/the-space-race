import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Lightformer, Stars } from "@react-three/drei";
import Aircraft from "./Aircraft";

// Auto-rotates when idle, pauses the moment the user grabs the model, and
// resumes from the exact camera angle they left after a few seconds —
// the Apple-product-viewer feel, done with OrbitControls events plus one
// timeout rather than any custom camera code.
function IdleAutoRotateControls() {
  const [autoRotate, setAutoRotate] = useState(true);
  const resumeTimer = useRef<number | undefined>(undefined);

  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.9}
      enableZoom
      enablePan
      panSpeed={0.4}
      minDistance={3.5}
      maxDistance={11}
      autoRotate={autoRotate}
      autoRotateSpeed={0.7}
      onStart={() => {
        window.clearTimeout(resumeTimer.current);
        setAutoRotate(false);
      }}
      onEnd={() => {
        window.clearTimeout(resumeTimer.current);
        resumeTimer.current = window.setTimeout(() => setAutoRotate(true), 4000);
      }}
    />
  );
}

function Scene() {
  return (
    <>
      {/* procedural studio environment: Lightformers rendered into an env
          map give real reflections on the fuselage with no external HDRI
          fetch — the bundle stays self-contained */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.8} position={[0, 4, 0]} scale={[9, 4, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={0.9} position={[-4, 1.5, 3]} scale={[4, 2.2, 1]} rotation-y={Math.PI / 3} />
        <Lightformer intensity={0.6} position={[4, 1, -3]} scale={[4, 2, 1]} rotation-y={-Math.PI / 3} />
        <Lightformer intensity={0.35} color="#5eead4" position={[0, -3, 0]} scale={[8, 3, 1]} rotation-x={-Math.PI / 2} />
      </Environment>

      <directionalLight position={[5, 6, 3]} intensity={0.7} castShadow shadow-mapSize={[1024, 1024]} />
      <ambientLight intensity={0.12} />

      <Aircraft />

      <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={12} blur={2.8} far={2.2} />

      <Stars radius={40} depth={25} count={900} factor={2.2} saturation={0} fade speed={0.4} />

      <IdleAutoRotateControls />
    </>
  );
}

function mount() {
  const container = document.getElementById("aircraft-3d-root");
  if (!container) return;

  createRoot(container).render(
    <StrictMode>
      <Canvas shadows camera={{ position: [4.6, 1.4, 5.2], fov: 35 }} dpr={[1, 2]}>
        <color attach="background" args={["#05070f"]} />
        <fog attach="fog" args={["#05070f", 18, 42]} />
        <Scene />
      </Canvas>
    </StrictMode>
  );
}

mount();
