// Pooled visual effects: tracers, impact sparks and explosions. Everything is
// pre-allocated and recycled — the hot loops make no new objects per frame. A tracer
// is one line segment that fades in 60 ms; sparks are points with velocity and life.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 240;
const MAX_BLASTS = 4;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.amber), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  const blasts = [];
  for (let i = 0; i < MAX_BLASTS; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 18, 1.6);
    scene.add(light);
    blasts.push({ mesh, light, life: 0 });
  }
  let blastNext = 0;

  function burst(point, count, speed, up) {
    for (let i = 0; i < count; i += 1) {
      const j = sparkNext;
      sparkNext = (sparkNext + 1) % MAX_SPARKS;
      sparkPos[j * 3] = point.x;
      sparkPos[j * 3 + 1] = point.y;
      sparkPos[j * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      sparkVel[j * 3] = Math.cos(a) * s;
      sparkVel[j * 3 + 1] = up + Math.random() * speed * 0.6;
      sparkVel[j * 3 + 2] = Math.sin(a) * s;
      sparkLife[j] = 0.35 + Math.random() * 0.3;
    }
  }

  return {
    tracer(from, to) {
      const slot = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % MAX_TRACERS;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.material.opacity = 0.85;
      slot.line.visible = true;
      slot.life = 0.07;
    },
    impact(point) {
      burst(point, 7, 2.4, 1.6);
    },
    hitFlesh(point) {
      burst(point, 9, 2, 1.2);
    },
    explosion(point) {
      const slot = blasts[blastNext];
      blastNext = (blastNext + 1) % MAX_BLASTS;
      slot.mesh.position.copy(point);
      slot.mesh.visible = true;
      slot.light.position.copy(point);
      slot.life = 0.5;
      burst(point, 42, 7, 4);
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.line.visible = false;
        else slot.line.material.opacity = slot.life / 0.07 * 0.85;
      }
      let anySpark = false;
      for (let j = 0; j < MAX_SPARKS; j += 1) {
        if (sparkLife[j] <= 0) continue;
        anySpark = true;
        sparkLife[j] -= dt;
        sparkVel[j * 3 + 1] -= 12 * dt;
        sparkPos[j * 3] += sparkVel[j * 3] * dt;
        sparkPos[j * 3 + 1] += sparkVel[j * 3 + 1] * dt;
        sparkPos[j * 3 + 2] += sparkVel[j * 3 + 2] * dt;
        if (sparkPos[j * 3 + 1] < 0.02) {
          sparkPos[j * 3 + 1] = 0.02;
          sparkVel[j * 3 + 1] *= -0.3;
        }
        if (sparkLife[j] <= 0) sparkPos[j * 3 + 1] = -50;
      }
      if (anySpark) sparkGeo.getAttribute('position').needsUpdate = true;
      for (const slot of blasts) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        const t = 1 - Math.max(0, slot.life) / 0.5;
        slot.mesh.scale.setScalar(0.6 + t * 5.4);
        slot.mesh.material.opacity = 0.75 * (1 - t);
        slot.light.intensity = 60 * (1 - t);
        if (slot.life <= 0) {
          slot.mesh.visible = false;
          slot.light.intensity = 0;
        }
      }
    },
    reset() {
      for (const slot of tracers) slot.line.visible = false;
      for (const slot of blasts) {
        slot.mesh.visible = false;
        slot.light.intensity = 0;
        slot.life = 0;
      }
      sparkLife.fill(0);
      for (let j = 0; j < MAX_SPARKS; j += 1) sparkPos[j * 3 + 1] = -50;
      sparkGeo.getAttribute('position').needsUpdate = true;
    },
  };
}
