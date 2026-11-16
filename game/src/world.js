// Cinder Yard: a decommissioned rail freight yard at dusk, 56 x 44 m. Two charge
// sites — A, the gantry crane in the north-west, and B, the fuel depot in the east —
// joined by three lanes (west rail line, mid concourse, east yard road) and cross
// connectors. Every wall and crate is a box: a collider for bodies and a surface a
// bullet stops on. The nav graph is hand-placed so bot routes never cross a wall.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { id: 'A', name: 'Gantry', x: -17, z: -14, radius: 4.5 },
  B: { id: 'B', name: 'Fuel Depot', x: 19, z: 8, radius: 4.5 },
};

export const SPAWNS = {
  ember: [[-22, 16, 0], [-20, 17.5, -0.3], [-24, 14.5, 0.3]],
  warden: [[20, -14, Math.PI], [22, -16, Math.PI - 0.3], [18, -12.5, Math.PI + 0.3]],
};

// Waypoint graph for the bots: [x, z] nodes, edges that never cross a wall.
export const NAV_NODES = [
  [-22, 16], [-18, 13], [-22, 8], [-21, 0], [-21, -6], [-20, -12],
  [-17, -14], [-14, -16], [-10, 12], [-4, 10], [2, 12], [8, 10],
  [-3, 4], [2, 2], [6, 4.5], [-6, -2], [0, -4], [6, -2],
  [-2, -8], [4, -8], [-12, 0], [12, 0], [-12, -4], [12, -4],
  [18, 14], [20, 10], [19, 8], [21, 2], [20, -4], [22, -10],
  [-8, -16], [0, -16], [8, -16], [14, -15], [20, -14], [24, -10],
  [15.5, 8], [16, 6], [-8, -12], [10, -12], [12, 16],
];
export const NAV_EDGES = [
  [0, 1], [0, 2], [1, 8], [2, 3], [3, 4], [4, 5], [4, 22], [5, 6], [6, 7],
  [7, 30], [7, 38], [8, 9], [9, 10], [9, 12], [10, 11], [10, 40], [12, 13],
  [12, 15], [13, 14], [13, 16], [14, 21], [15, 16], [15, 20], [15, 22],
  [16, 17], [16, 18], [17, 23], [18, 19], [20, 22], [21, 23], [21, 27],
  [23, 28], [24, 25], [24, 40], [25, 26], [25, 36], [26, 27], [26, 37],
  [27, 28], [27, 37], [28, 29], [29, 34], [29, 35], [30, 31], [30, 38],
  [31, 32], [31, 38], [31, 39], [32, 33], [32, 39], [33, 34], [33, 39],
  [34, 35], [36, 37],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'amber' || name === 'teal' ? 0.5 : 0.92,
      metalness: name === 'rust' ? 0.45 : 0.04,
    });
  }
  const colliders = [];
  const shootables = [];
  const mapRects = []; // footprints for the HUD minimap: [x, z, w, d]

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      mapRects.push([x, z, w, d]);
    }
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(r, h, x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), materials[mat]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // AABBs only: a tank collides as the square that holds it.
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, h, z + r)));
    mapRects.push([x, z, r * 2, r * 2]);
    shootables.push(mesh);
    return mesh;
  }

  function flat(w, d, x, z, mat, y = 0.02) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[mat]), transparent: true, opacity: 0.85 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Ground: the yard slab, then a dark skirt out to the fog so the horizon is not void.
  box(56.8, 0.4, 44.8, 0, -0.2, 0, 'surface', false);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 1 }));
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.06;
  group.add(skirt);

  // Perimeter walls, 5 m, open to the dusk sky.
  box(0.6, 5, 44.8, -28.3, 2.5, 0, 'wall');
  box(0.6, 5, 44.8, 28.3, 2.5, 0, 'wall');
  box(56.8, 5, 0.6, 0, 2.5, -22.3, 'wall');
  box(56.8, 5, 0.6, 0, 2.5, 22.3, 'wall');

  // Interior walls that cut the three lanes, each with a gap for a connector.
  box(12, 4, 0.6, -8, 2, -6, 'wall'); // north mid wall, west half (gap x -2..4)
  box(10, 4, 0.6, 9, 2, -6, 'wall'); // north mid wall, east half
  box(10, 4, 0.6, -9, 2, 6, 'wall'); // south mid wall, west half (gap x -4..2)
  box(12, 4, 0.6, 8, 2, 6, 'wall'); // south mid wall, east half
  box(0.6, 4, 10, -14, 2, 3, 'wall'); // west lane divider (gap z -2..-6 side)
  box(0.6, 4, 12, 14, 2, 8, 'wall'); // east lane divider (gap z -6..2)
  box(18, 4, 0.6, 3, 2, -10, 'wall'); // north corridor wall (gaps x <-6 and x >12)

  // Site A — the gantry crane: two rusted pillars and a beam, hook hanging over the pad.
  box(0.8, 7, 0.8, -20, 3.5, -17.5, 'rust');
  box(0.8, 7, 0.8, -13.5, 3.5, -17.5, 'rust');
  box(7.3, 1, 1.2, -16.75, 7, -17.5, 'rust');
  box(0.15, 2.2, 0.15, -17, 5.6, -15.4, 'hairline', false);
  box(0.7, 0.7, 0.7, -17, 4.4, -15.4, 'amber', false);

  // Site B — the fuel depot: three tanks behind a low bund wall.
  cylinder(1.6, 3, 17, 5, 'rust');
  cylinder(1.6, 3, 22, 11, 'wall');
  cylinder(1.6, 3, 16, 11, 'rust');
  box(8, 0.9, 0.5, 19, 0.45, 13.6, 'wall');

  // Containers: the mid concourse's cover, and one on the west lane.
  box(4.8, 2.4, 2.4, -1, 1.2, 1, 'teal');
  box(4.8, 2.4, 2.4, 8, 1.2, -0.5, 'rust');
  box(4.8, 2.4, 2.4, -8, 1.2, -9, 'wall');
  box(4.8, 2.4, 2.4, -18.5, 1.2, 10.5, 'amber');
  box(4.8, 2.4, 2.4, 2, 1.2, 18, 'wall');

  // Crates: crouch-height cover, placed clear of the nav graph's edges.
  const crates = [
    [-24.5, 2, 'hairline'], [-19, -3.5, 'surface'], [-24, -9, 'hairline'],
    [3.5, -5.5, 'surface'], [4, 5, 'hairline'], [-7, 7, 'surface'], [9, 7, 'hairline'],
    [23, 4, 'surface'], [24, -6, 'hairline'], [-14.5, -16.5, 'surface'],
    [-21.5, -10.5, 'hairline'], [22.5, 11, 'surface'], [16, 11.5, 'hairline'],
    [-2, -18, 'surface'], [6, -18.5, 'hairline'], [-8, 19, 'surface'], [10, 17, 'hairline'],
  ];
  for (const [x, z, mat] of crates) box(1.2, 1.1, 1.2, x, 0.55, z, mat);
  // A double-height crate stack near mid, for a sightline over the low cover.
  box(1.2, 1.1, 1.2, -6.5, 0.55, 8.5, 'rust');
  box(1.2, 1.1, 1.2, -6.5, 1.65, 8.5, 'rust');

  // Barrels: small round cover, scattered at the edges.
  const barrels = [[-26, 12], [-26, -16], [26, 16], [26, -18], [-6, -18], [12, -18], [24, 14], [-26, -2]];
  for (const [x, z] of barrels) cylinder(0.45, 1, x, z, 'rust');

  // Rails along the west lane, flush with the ground: visual only, never a collider.
  box(0.25, 0.06, 34, -24, 0.03, -2, 'hairline', false);
  box(0.25, 0.06, 34, -22.6, 0.03, -2, 'hairline', false);
  for (let z = -18; z <= 14; z += 2.4) box(1.9, 0.05, 0.5, -23.3, 0.025, z, 'deck', false);

  // Site pads: an amber ring and a beacon post at each site.
  const beacons = [];
  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.55, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.28 }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.x, 0.025, site.z);
    group.add(letter);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), materials.deck);
    post.position.set(site.x + site.radius - 0.4, 1.7, site.z - site.radius + 0.4);
    post.castShadow = true;
    group.add(post);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber) }),
    );
    lamp.position.set(site.x + site.radius - 0.4, 3.55, site.z - site.radius + 0.4);
    group.add(lamp);
    beacons.push(lamp);
  }

  // Spawn pads, team-coloured, so each side knows its ground.
  flat(4, 4, -22, 16, 'amber', 0.015);
  flat(4, 4, 20, -14, 'teal', 0.015);
  // Faded yard markings down the mid lane.
  flat(0.5, 30, -1, 0, 'sand', 0.012);
  flat(0.5, 30, 1, 0, 'sand', 0.012);

  // Light: a low warm key from the south-west, a cool fill, a sky/ground gradient,
  // and one lamp over each site so the objective reads at a glance.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a93b8'), new THREE.Color('#1a1512'), 0.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  key.position.set(-18, 26, 20);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34;
  key.shadow.camera.right = 34;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7fa8c9'), 0.5);
  fill.position.set(20, 14, -18);
  scene.add(fill);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 14, 1.8);
    lamp.position.set(site.x, 4.5, site.z);
    scene.add(lamp);
  }

  return {
    colliders,
    shootables,
    mapRects,
    sites: SITES,
    spawns: SPAWNS,
    navNodes: NAV_NODES,
    navEdges: NAV_EDGES,
    update(t) {
      // The site beacons breathe: a slow pulse that marks the objective.
      const pulse = 0.65 + 0.35 * Math.sin(t * 2.4);
      for (const lamp of beacons) lamp.scale.setScalar(pulse);
    },
  };
}
