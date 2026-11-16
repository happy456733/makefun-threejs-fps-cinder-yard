// The player's body: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows the
// player. Health and armour live here too: armour absorbs half of every hit until it
// runs out. Movement speed is what the weapon's spread reads — the gunplay contract.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.58;
const CROUCH_EYE = 1.0;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 10;
const FRICTION = 10;
const GRAVITY = 21;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();
  const eyeOut = new THREE.Vector3();
  let health = 100;
  let armor = 0;
  let alive = true;
  // Recoil is a separate layer on top of the aim: it kicks the view and then
  // settles back, so a burst climbs and recovers instead of walking the player's
  // aim permanently skyward. The aim itself (body.pitch/yaw) only moves by mouse.
  let recoilPitch = 0;
  let recoilYaw = 0;

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    recoilPitch = Math.min(0.45, recoilPitch + pitchKick);
    recoilYaw = Math.max(-0.25, Math.min(0.25, recoilYaw + yawKick));
  }

  function step(dt, keys, frozen) {
    // Recoil settles back to the aim within about half a second.
    const decay = Math.exp(-6 * dt);
    recoilPitch *= decay;
    recoilYaw *= decay;
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    body.eye += ((body.crouching ? CROUCH_EYE : STAND_EYE) - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if ((forward || strafe) && !frozen) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = body.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, ((body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.onGround && !frozen) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  // Returns true when this hit kills. Armour takes half the damage first.
  function damage(amount) {
    if (!alive) return false;
    let rest = amount;
    if (armor > 0) {
      const absorbed = Math.min(armor, Math.ceil(amount / 2));
      armor -= absorbed;
      rest = amount - absorbed;
    }
    health = Math.max(0, health - rest);
    if (health <= 0) alive = false;
    return !alive;
  }

  return {
    body,
    step,
    look,
    recoil,
    // What the camera shows: the aim plus the unsettled recoil on top of it.
    viewPitch() {
      return body.pitch + recoilPitch;
    },
    viewYaw() {
      return body.yaw + recoilYaw;
    },
    damage,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    eyePosition() {
      return eyeOut.set(body.position.x, body.position.y + body.eye, body.position.z);
    },
    get health() {
      return health;
    },
    get armor() {
      return armor;
    },
    get alive() {
      return alive;
    },
    setArmor(value) {
      armor = value;
    },
    reset(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      recoilPitch = 0;
      recoilYaw = 0;
      body.crouching = false;
      body.height = STAND_HEIGHT;
      body.eye = STAND_EYE;
      body.onGround = true;
      health = 100;
      alive = true;
    },
  };
}
