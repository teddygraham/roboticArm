/**
 * ArmViewer — loads the MechArm 270 Pi URDF and reflects real-time joint angles.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import URDFLoader from "urdf-loader";
import type { URDFRobot } from "urdf-loader";

// ── Module-level robot cache (survives React remounts) ────────────────────────
let _robot: URDFRobot | null = null;
let _loadPromise: Promise<URDFRobot> | null = null;

function getRobot(): Promise<URDFRobot> {
  if (_robot) return Promise.resolve(_robot);
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve, reject) => {
    const loader = new URDFLoader();

    loader.loadMeshCb = (path, manager, done) => {
      const colladaLoader = new ColladaLoader(manager);
      colladaLoader.load(
        path,
        (collada) => {
          if (!collada) return;
          const mesh = collada.scene;
          // Undo ColladaLoader's auto Rx(-π/2): robot.rotation.x handles it below.
          mesh.rotation.set(0, 0, 0);
          mesh.updateMatrix();
          mesh.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = new THREE.MeshPhongMaterial({
                color: 0xaaaaaa,
                specular: 0x333333,
                shininess: 30,
                side: THREE.DoubleSide,
              });
              (child as THREE.Mesh).frustumCulled = false;
            }
          });
          done(mesh);
        },
        undefined,
        (err) => {
          const geo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
          const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
          done(new THREE.Mesh(geo, mat), err as Error);
        },
      );
    };

    loader.load(
      "/mecharm/mecharm_270_pi_web.urdf?v=2",
      (robot) => {
        robot.rotation.x = -Math.PI / 2;
        robot.traverse((obj) => { obj.frustumCulled = false; });
        _robot = robot;
        resolve(robot);
      },
      undefined,
      reject,
    );
  });

  return _loadPromise;
}

// ── URDF joint names J1→J6 ────────────────────────────────────────────────────
const JOINT_NAMES = [
  "joint1_to_base",
  "joint2_to_joint1",
  "joint3_to_joint2",
  "joint4_to_joint3",
  "joint5_to_joint4",
  "joint6_to_joint5",
];

function applyAngles(robot: URDFRobot, angles: number[]) {
  JOINT_NAMES.forEach((name, i) => {
    const joint = robot.joints[name];
    if (!joint) return;
    const deg = Number(angles[i] ?? 0);
    if (isFinite(deg)) joint.setJointValue((deg * Math.PI) / 180);
  });
}

// ── Scene component ───────────────────────────────────────────────────────────
function RobotScene({ angles }: { angles: number[] }) {
  const robotRef = useRef<URDFRobot | null>(_robot);

  useEffect(() => {
    getRobot().then((robot) => {
      robotRef.current = robot;
    });
  }, []);

  useEffect(() => {
    if (robotRef.current) applyAngles(robotRef.current, angles);
  }, [angles]);

  useFrame(({ scene }) => {
    const robot = robotRef.current;
    if (!robot) return;
    if (!robot.parent) scene.add(robot);
    // Force every node visible — urdf-loader may hide links at joint limits.
    robot.traverse((obj) => {
      if (!obj.visible) obj.visible = true;
    });
    robot.updateMatrixWorld(true);
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[1.5, 3, 2]} intensity={1.2} />
      <directionalLight position={[-1.5, 1, -2]} intensity={0.3} />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface ArmViewerProps {
  angles: number[];
  gripper?: number;
  className?: string;
}

export function ArmViewer({ angles, className = "" }: ArmViewerProps) {
  return (
    <div className={`relative w-full h-full ${className}`}>
      <Canvas
        camera={{ position: [0.45, 0.1, 0.55], fov: 80, near: 0.001, far: 50 }}
        style={{ background: "transparent" }}
      >
        <RobotScene angles={angles} />
        <OrbitControls
          enablePan={false}
          minDistance={0.15}
          maxDistance={2.0}
          target={[0, 0, 0]}
        />
        <gridHelper args={[0.4, 8, "#cbd5e1", "#e2e8f0"]} position={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
