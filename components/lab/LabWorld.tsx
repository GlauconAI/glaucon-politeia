"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Float, PerspectiveCamera, Stars } from "@react-three/drei";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Mesh } from "three";

import { labWorldCards, nextCardId, type LabWorldCard } from "@/lib/lab/world";

export function LabWorld() {
  const [activeId, setActiveId] = useState(labWorldCards[0].id);
  const activeCard = labWorldCards.find((card) => card.id === activeId) ?? labWorldCards[0];
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        setActiveId((current) => nextCardId(current, 1));
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        setActiveId((current) => nextCardId(current, -1));
      }

      if (event.key === "Enter") {
        const current = labWorldCards.find((card) => card.id === activeId);
        if (current) router.push(current.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, router]);

  return (
    <section className="lab-world" aria-label="3D navigation lab">
      <div className="lab-world-canvas">
        <Canvas dpr={[1, 1.8]}>
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 2.4, 9.2]} fov={48} />
            <color attach="background" args={["#08111a"]} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[4, 5, 6]} intensity={1.7} />
            <Stars radius={80} depth={30} count={900} factor={3.4} fade speed={0.35} />
            <Environment preset="city" />
            <WorldCards
              activeId={activeId}
              onFocus={setActiveId}
              onOpen={(card) => router.push(card.href)}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="lab-world-overlay">
        <p className="eyebrow">3D Lab</p>
        <h1>Politeia World</h1>
        <p>{activeCard.label}</p>
        <div className="lab-world-actions">
          {labWorldCards.map((card) => (
            <button
              key={card.id}
              className={card.id === activeId ? "button-primary" : "button-secondary"}
              onClick={() => setActiveId(card.id)}
            >
              {card.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorldCards({
  activeId,
  onFocus,
  onOpen,
}: {
  activeId: string;
  onFocus: (id: string) => void;
  onOpen: (card: LabWorldCard) => void;
}) {
  const { size } = useThree();
  const compact = size.width < 640;

  return (
    <group scale={compact ? 0.58 : 1} position={compact ? [0, -0.4, 0] : [0, 0, 0]}>
      {labWorldCards.map((card) => (
        <WorldCard
          key={card.id}
          card={card}
          active={card.id === activeId}
          onFocus={() => onFocus(card.id)}
          onOpen={() => onOpen(card)}
        />
      ))}
    </group>
  );
}

function WorldCard({
  card,
  active,
  onFocus,
  onOpen,
}: {
  card: LabWorldCard;
  active: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const mesh = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    mesh.current.rotation.y = Math.sin(clock.elapsedTime * 0.45 + card.position[0]) * 0.18;
    mesh.current.scale.setScalar(active ? 1.18 : 1);
  });

  return (
    <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.45}>
      <group position={card.position}>
        <mesh
          ref={mesh}
          onPointerOver={onFocus}
          onClick={onOpen}
          aria-label={card.title}
        >
          <boxGeometry args={[1.8, 1.12, 0.08]} />
          <meshStandardMaterial
            color={card.color}
            emissive={card.color}
            emissiveIntensity={active ? 0.55 : 0.18}
            roughness={0.38}
            metalness={0.28}
          />
        </mesh>
      </group>
    </Float>
  );
}
