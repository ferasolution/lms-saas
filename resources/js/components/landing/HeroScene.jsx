import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Hero scene: ruled exercise-book pages drifting through the dark, and a paper
 * plane folded from the same paper looping through them, leaving a dashed
 * pencil trail. Light enough for phones; pauses when off screen.
 */

const RULE = '#c9d8f2';
const MARGIN = '#e5484d';

function makePageTexture(seed) {
    const w = 512;
    const h = 660;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfcfe';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = RULE;
    g.lineWidth = 2;
    for (let y = 90; y < h; y += 34) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
    }
    g.strokeStyle = MARGIN;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(72, 0);
    g.lineTo(72, h);
    g.stroke();

    // "Handwriting": soft ink strokes of varying length on some lines.
    let r = seed * 9301 + 49297;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    g.strokeStyle = 'rgba(27,58,140,.55)';
    g.lineCap = 'round';
    g.lineWidth = 6;
    for (let y = 90 + 34; y < h - 40; y += 34) {
        if (rand() < 0.28) continue;
        let x = 92;
        const end = 92 + rand() * (w - 140);
        while (x < end) {
            const len = 18 + rand() * 60;
            g.beginPath();
            g.moveTo(x, y - 10);
            g.lineTo(Math.min(x + len, end), y - 10);
            g.stroke();
            x += len + 14;
        }
    }
    // A tick mark on some pages, like a marked answer.
    if (rand() > 0.5) {
        g.strokeStyle = '#1f9d63';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(w - 110, 70);
        g.lineTo(w - 90, 92);
        g.lineTo(w - 52, 40);
        g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function Pages({ count, small }) {
    const group = useRef();
    const pages = useMemo(() => Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return {
            tex: makePageTexture(i + 1),
            // Keep pages on the right so the headline on the left stays readable.
            // On phones the text sits below the scene, so pages spread across the top.
            base: small
                ? new THREE.Vector3(-0.8 + Math.cos(angle) * 2.4 + 1, (Math.random() - 0.5) * 6, -1.5 - (i % 4) * 1.5)
                : new THREE.Vector3(2.2 + Math.abs(Math.cos(angle)) * 3.4 + (i % 3) * 0.6, (Math.random() - 0.5) * 6, -1.5 - (i % 4) * 1.5),
            rot: new THREE.Euler((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8),
            spin: (Math.random() - 0.5) * 0.25,
            speed: 0.18 + Math.random() * 0.22,
            phase: Math.random() * Math.PI * 2,
            scale: 0.9 + Math.random() * 0.7,
        };
    }), [count, small]);

    useEffect(() => () => pages.forEach((p) => p.tex.dispose()), [pages]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        group.current.children.forEach((mesh, i) => {
            const p = pages[i];
            // Drift upward and wrap, with a gentle sway.
            const y = ((p.base.y + t * p.speed + 5) % 10) - 5;
            mesh.position.set(p.base.x + Math.sin(t * 0.3 + p.phase) * 0.35, y, p.base.z);
            mesh.rotation.set(p.rot.x + Math.sin(t * 0.4 + p.phase) * 0.15, p.rot.y + t * p.spin, p.rot.z + Math.cos(t * 0.35 + p.phase) * 0.1);
        });
    });

    return (
        <group ref={group}>
            {pages.map((p, i) => (
                <mesh key={i} scale={[p.scale, p.scale, p.scale]}>
                    <planeGeometry args={[1, 1.29]} />
                    <meshStandardMaterial map={p.tex} emissiveMap={p.tex} emissive="#ffffff" emissiveIntensity={0.28} side={THREE.DoubleSide} roughness={0.95} metalness={0} transparent opacity={0.9} />
                </mesh>
            ))}
        </group>
    );
}

function planeGeometry() {
    // A classic dart: nose at +z, two wings and a keel, folded from one sheet.
    const v = [
        // left wing
        0, 0, 1.2, -0.75, 0.08, -0.6, 0, 0.02, -0.5,
        // right wing
        0, 0, 1.2, 0, 0.02, -0.5, 0.75, 0.08, -0.6,
        // left keel
        0, 0, 1.2, 0, 0.02, -0.5, -0.02, -0.28, -0.45,
        // right keel
        0, 0, 1.2, 0.02, -0.28, -0.45, 0, 0.02, -0.5,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    return geo;
}

function PaperPlane() {
    const plane = useRef();
    const trail = useRef();
    const geo = useMemo(planeGeometry, []);
    const curve = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(3.6, 0.8, 0.6),
        new THREE.Vector3(2.0, 2.0, -1.0),
        new THREE.Vector3(0.4, 1.2, -0.6),
        new THREE.Vector3(1.4, -1.0, 1.0),
        new THREE.Vector3(3.4, -1.8, 0.2),
        new THREE.Vector3(5.6, -0.6, -1.4),
        new THREE.Vector3(5.4, 1.6, -0.4),
    ], true, 'catmullrom', 0.5), []);
    const N = 90;
    const points = useMemo(() => new Float32Array(N * 3), []);
    const tmp = useMemo(() => ({ pos: new THREE.Vector3(), ahead: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), m: new THREE.Matrix4(), q: new THREE.Quaternion(), roll: new THREE.Quaternion() }), []);

    useFrame((state) => {
        const t = (state.clock.elapsedTime * 0.045) % 1;
        curve.getPointAt(t, tmp.pos);
        curve.getPointAt((t + 0.004) % 1, tmp.ahead);
        tmp.m.lookAt(tmp.ahead, tmp.pos, tmp.up);
        tmp.q.setFromRotationMatrix(tmp.m);
        // Bank into turns.
        const tangent = curve.getTangentAt(t);
        const next = curve.getTangentAt((t + 0.02) % 1);
        const bank = THREE.MathUtils.clamp((tangent.x * next.z - tangent.z * next.x) * 18, -0.8, 0.8);
        tmp.roll.setFromAxisAngle(new THREE.Vector3(0, 0, 1), bank);
        plane.current.position.copy(tmp.pos);
        plane.current.quaternion.copy(tmp.q).multiply(tmp.roll);

        // Trail: the path just behind the plane.
        for (let i = 0; i < N; i++) {
            const p = curve.getPointAt(((t - i * 0.0022) % 1 + 1) % 1);
            points[i * 3] = p.x;
            points[i * 3 + 1] = p.y;
            points[i * 3 + 2] = p.z;
        }
        const attr = trail.current.geometry.attributes.position;
        attr.needsUpdate = true;
        trail.current.computeLineDistances();
    });

    return (
        <>
            <mesh ref={plane} geometry={geo} scale={0.55} castShadow>
                <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} flatShading roughness={0.7} />
            </mesh>
            <line ref={trail}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[points, 3]} />
                </bufferGeometry>
                <lineDashedMaterial color="#ffffff" dashSize={0.08} gapSize={0.08} transparent opacity={0.45} />
            </line>
        </>
    );
}

function Rig() {
    const { camera, pointer } = useThree();
    useFrame(() => {
        camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.03;
        camera.position.y += (pointer.y * 0.4 - camera.position.y) * 0.03;
        camera.lookAt(1, 0, 0);
    });
    return null;
}

export default function HeroScene({ reduced = false }) {
    const wrap = useRef(null);
    const [visible, setVisible] = useState(true);
    const small = typeof window !== 'undefined' && window.innerWidth < 768;

    useEffect(() => {
        const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
        if (wrap.current) io.observe(wrap.current);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={wrap} className="absolute inset-0" aria-hidden>
            <Canvas
                dpr={small ? [1, 1.5] : [1, 2]}
                camera={{ position: [0, 0, 7], fov: 45 }}
                frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
                gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
            >
                <ambientLight intensity={1.1} />
                <directionalLight position={[3, 5, 6]} intensity={1.6} />
                <directionalLight position={[-4, -2, 2]} intensity={0.4} color="#9fb6ff" />
                <fog attach="fog" args={['#0d1d4a', 7, 15]} />
                <Pages count={small ? 7 : 12} small={small} />
                <PaperPlane />
                {!small && <Rig />}
            </Canvas>
        </div>
    );
}
