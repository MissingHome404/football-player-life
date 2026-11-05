// Model 3D pemain di beranda (Three.js). Badan low-poly sederhana dari bentuk dasar:
// jersey dan celana mengikuti warna klub, sepatu, aksesori, kendaraan, dan suasana
// rumah mengikuti barang yang sudah dibeli. Bisa diputar dengan menggeser.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Rng } from '../game/rng';

export interface AvatarLook {
  seed: string;
  shirt: string;
  trim: string;
  shorts: string;
  boots: string;
  wear: string[];
  car: { id: string; color: string } | null;
  house: 'ortu' | 'kos' | 'apartemen' | 'rumah' | 'mewah';
  heightCm: number;
}

const SKIN = ['#f1d0b5', '#e0b18f', '#c68b62', '#a0673f', '#6f4529'];
const HAIR = ['#1b1410', '#3b2a1e', '#6b4a2b', '#c9a15e', '#2a2a2a'];
const ROOM: Record<AvatarLook['house'], { bg: string; floor: string; wall: string }> = {
  ortu: { bg: '#262a33', floor: '#3a3f4b', wall: '#4a4036' },
  kos: { bg: '#24272e', floor: '#353943', wall: '#3d434f' },
  apartemen: { bg: '#141c2e', floor: '#2a3550', wall: '#1d2a44' },
  rumah: { bg: '#2a2219', floor: '#4a3b2a', wall: '#5a4630' },
  mewah: { bg: '#1e1a10', floor: '#d8d2c4', wall: '#3b3220' },
};

function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

function buildPlayer(look: AvatarLook): THREE.Group {
  const rng = new Rng(`look:${look.seed}`);
  const skin = mat(rng.pick(SKIN));
  const hair = mat(rng.pick(HAIR), { roughness: 0.9 });
  const hairStyle = rng.pick(['short', 'short', 'buzz', 'curly', 'long']);
  const shirt = mat(look.shirt);
  const trim = mat(look.trim);
  const shorts = mat(look.shorts);
  const boots = mat(look.boots, { roughness: 0.4, metalness: look.boots === '#e8c84a' ? 0.6 : 0.1 });
  const gold = mat('#e2b84a', { metalness: 0.9, roughness: 0.25 });
  const g = new THREE.Group();

  for (const s of [-1, 1]) {
    const x = s * 0.11;
    g.add(mesh(new THREE.BoxGeometry(0.11, 0.08, 0.27), boots, x, 0.04, 0.04));
    g.add(mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.4, 14), trim, x, 0.28, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.16, 14), skin, x, 0.55, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.064, 0.16, 14), skin, x, 0.68, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.16, 14), shorts, x, 0.8, 0));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.14, 20), shorts, 0, 0.91, 0));

  const torso = mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.54, 22), shirt, 0, 1.24, 0);
  torso.scale.z = 0.62;
  g.add(torso);
  const waist = mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.04, 22), trim, 0, 0.99, 0);
  waist.scale.z = 0.62;
  g.add(waist);
  const collar = mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20), trim, 0, 1.5, 0);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  g.add(mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.1, 14), skin, 0, 1.54, 0));

  for (const s of [-1, 1]) {
    const sleeve = mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.22, 14), shirt, s * 0.29, 1.38, 0);
    sleeve.rotation.z = s * 0.18;
    g.add(sleeve);
    const arm = mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.44, 14), skin, s * 0.33, 1.06, 0);
    arm.rotation.z = s * 0.06;
    g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.055, 14, 10), skin, s * 0.345, 0.82, 0));
  }

  const head = mesh(new THREE.SphereGeometry(0.13, 24, 18), skin, 0, 1.7, 0);
  head.scale.set(0.95, 1.1, 1);
  g.add(head);
  const eye = mat('#1a1a1a');
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), eye, s * 0.045, 1.72, 0.118));
  if (hairStyle !== 'buzz' || rng.chance(0.7)) {
    const thick = hairStyle === 'buzz' ? 0.134 : 0.142;
    const cap = mesh(new THREE.SphereGeometry(thick, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), hair, 0, 1.72, -0.008);
    cap.scale.set(0.97, 1.05, 1.02);
    g.add(cap);
  }
  if (hairStyle === 'curly') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), hair, Math.cos(a) * 0.11, 1.8 + (i % 2) * 0.02, Math.sin(a) * 0.11 - 0.01));
    }
  }
  if (hairStyle === 'long') g.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 0.06), hair, 0, 1.62, -0.11));

  if (look.wear.includes('ikat_kepala')) {
    const band = mesh(new THREE.TorusGeometry(0.128, 0.016, 8, 28), mat('#f2f2f2'), 0, 1.75, 0);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }
  if (look.wear.includes('kalung')) {
    const chain = mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 24), gold, 0, 1.47, 0.03);
    chain.rotation.x = Math.PI / 2.4;
    g.add(chain);
  }
  if (look.wear.includes('jam')) g.add(mesh(new THREE.BoxGeometry(0.07, 0.035, 0.075), gold, -0.335, 0.9, 0));

  const scale = look.heightCm / 180;
  g.scale.setScalar(scale);
  return g;
}

function buildCar(id: string, color: string): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color, { metalness: 0.5, roughness: 0.35 });
  const dark = mat('#141414', { roughness: 0.6 });
  const glass = mat('#9fc3e6', { metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.7 });
  const wheel = (x: number, z: number, r = 0.16, w = 0.12) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, w, 18), dark, x, r, z);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  if (id === 'motor') {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.18, 0.14), body, 0, 0.42, 0));
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.08, 0.2), dark, -0.1, 0.55, 0));
    g.add(wheel(-0.38, 0, 0.2, 0.08), wheel(0.38, 0, 0.2, 0.08));
    return g;
  }
  const low = id === 'sport' || id === 'super';
  const h = low ? 0.28 : 0.42;
  g.add(mesh(new THREE.BoxGeometry(1.7, h, 0.8), body, 0, 0.18 + h / 2, 0));
  g.add(mesh(new THREE.BoxGeometry(low ? 0.7 : 0.95, low ? 0.2 : 0.3, 0.72), glass, low ? -0.05 : -0.1, 0.18 + h + (low ? 0.1 : 0.15), 0));
  for (const x of [-0.55, 0.55]) for (const z of [-0.4, 0.4]) g.add(wheel(x, z));
  return g;
}

function buildRoom(house: AvatarLook['house']): THREE.Group {
  const r = ROOM[house];
  const g = new THREE.Group();
  const floor = mesh(new THREE.CircleGeometry(2.6, 48), mat(r.floor, { roughness: house === 'mewah' ? 0.3 : 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const wall = mesh(new THREE.PlaneGeometry(7, 4), mat(r.wall, { roughness: 1 }), 0, 2, -1.9);
  g.add(wall);
  if (house === 'apartemen') {
    const lit = mat('#f6d98b', { emissive: '#f6d98b', emissiveIntensity: 0.6 });
    const dim = mat('#2b3a5a');
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      g.add(mesh(new THREE.PlaneGeometry(0.22, 0.3), (i * 3 + j) % 4 === 1 ? lit : dim, -1.6 + i * 0.38, 1.6 + j * 0.42, -1.89));
    }
  } else if (house === 'rumah') {
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.35, 12), mat('#8a5a3a'), -1.3, 0.18, -1.2));
    g.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), mat('#3f7d4a'), -1.3, 0.6, -1.2));
  } else if (house === 'mewah') {
    const pool = mesh(new THREE.PlaneGeometry(2.4, 0.9), mat('#3aa7d9', { roughness: 0.1, metalness: 0.3 }), 0, 0.005, -1.35);
    pool.rotation.x = -Math.PI / 2;
    g.add(pool);
    for (const x of [-2, 2]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 16), mat('#e6d3a3'), x, 1.5, -1.8));
  } else if (house === 'kos') {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), mat('#5a4a3a'), -1.4, 0.23, -1.5));
  }
  return g;
}

export default function Avatar3D({ look, height = 260 }: { look: AvatarLook; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(look);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    } catch {
      setFailed(true);
      return;
    }
    const width = el.clientWidth || 320;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ROOM[look.house].bg);
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    camera.position.set(0, 1.2, 4.6);
    camera.lookAt(0.15, 0.92, 0);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3530', 1.3));
    const sun = new THREE.DirectionalLight('#ffffff', 1.8);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    scene.add(buildRoom(look.house));
    const shadow = mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3 }), 0, 0.006, 0);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    const player = buildPlayer(look);
    scene.add(player);
    if (look.car) {
      const car = buildCar(look.car.id, look.car.color);
      car.position.set(1.35, 0, -0.9);
      car.rotation.y = -0.55;
      scene.add(car);
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let angle = -0.35;
    let dragging = false;
    let lastX = 0;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (!dragging && !reduce) angle += dt * 0.45;
      player.rotation.y = angle;
      player.position.y = reduce ? 0 : Math.sin(now / 700) * 0.006;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const canvas = renderer.domElement;
    canvas.style.touchAction = 'pan-y';
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      angle += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    const up = () => (dragging = false);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || width;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      canvas.remove();
    };
    // look dibandingkan lewat key supaya tidak dibangun ulang tiap render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height]);

  if (failed) return <div className="avatar-fallback muted small">Browser ini tidak mendukung tampilan 3D.</div>;
  return <div className="avatar3d" ref={host} style={{ height }} role="img" aria-label="Model 3D pemainmu, geser untuk memutar" />;
}
