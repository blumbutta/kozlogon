/**
 * Reusable, low-poly downhill hazards. Call createHazardAssets(THREE) once.
 * Bears and hunters look uphill along +z. The bomber nose points along -z.
 * Ramp approach is +z, and takeoff is -z. Ramp profile z values descend.
 * Returned objects own their transforms and share immutable geometries/materials.
 * Keep the factory alive until the scene is disposed; do not dispose a clone.
 */
export function createHazardAssets(THREE) {
  const geometries = new Map();
  const templates = new Map();
  const materials = {};
  const palette = {
    fur: 0x805035, furDark: 0x482c20, muzzle: 0xbd8c61,
    black: 0x171b1d, angryRed: 0xff2922, ivory: 0xffecd0,
    jacket: 0x6d7e43, jacketDark: 0x465335, skin: 0xe6ac7d,
    leather: 0x5d4434, steel: 0x56646a, wood: 0x9c653e,
    rampTop: 0xc78b50, rampSide: 0x75472d, rampRail: 0xe0ac6a,
    warning: 0xffda55, planeBody: 0xbac5c4, planeWing: 0x75968e,
    planeDark: 0x445c5b, planeTrim: 0xf0c96c, glass: 0x75c6e1,
    pit: 0x1b1a19, spike: 0xc5c4b4, spikeBase: 0x4a463c,
    smoke: 0x433b3a,
  };
  for (const [name, color] of Object.entries(palette)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: name === 'steel' ? 0.5 : 0.86,
      metalness: name === 'steel' || name === 'spike' ? 0.25 : 0,
    });
  }
  materials.angryRed.emissive.setHex(0xdb160c);
  materials.angryRed.emissiveIntensity = 0.65;
  materials.glass.roughness = 0.22;
  materials.glass.metalness = 0.1;
  materials.boltCore = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  materials.boltGlow = new THREE.MeshBasicMaterial({
    color: 0x54dcff, transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  materials.fireCore = new THREE.MeshBasicMaterial({ color: 0xfff3a2, toneMapped: false });
  materials.fireOrange = new THREE.MeshBasicMaterial({ color: 0xff8d22, toneMapped: false });
  materials.fireRed = new THREE.MeshBasicMaterial({ color: 0xef431b, toneMapped: false });

  const cached = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  };
  const box = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sphere = () => cached('sphere', () => new THREE.SphereGeometry(1, 10, 7));
  const cylinder = () => cached('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const cone = () => cached('cone', () => new THREE.ConeGeometry(1, 1, 7));
  const boltCylinder = () => cached('boltCylinder', () => new THREE.CylinderGeometry(1, 1, 1, 6));

  const part = (geometry, material, position, scale, rotation = [0, 0, 0]) => ({
    geometry, material: materials[material], position, scale, rotation,
  });
  const cube = (material, position, scale, rotation) => part(box(), material, position, scale, rotation);
  const oval = (material, position, scale, rotation) => part(sphere(), material, position, scale, rotation);
  const peg = (material, position, scale, rotation) => part(cylinder(), material, position, scale, rotation);
  const tip = (material, position, scale, rotation) => part(cone(), material, position, scale, rotation);

  // All static details sharing a material become a single draw call.
  function mergeParts(parts) {
    const positions = [];
    const normals = [];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const quaternion = new THREE.Quaternion();
    for (const item of parts) {
      quaternion.setFromEuler(new THREE.Euler(...item.rotation));
      matrix.compose(new THREE.Vector3(...item.position), quaternion, new THREE.Vector3(...item.scale));
      normalMatrix.getNormalMatrix(matrix);
      const pos = item.geometry.getAttribute('position');
      const nor = item.geometry.getAttribute('normal');
      const index = item.geometry.index;
      const count = index ? index.count : pos.count;
      for (let j = 0; j < count; j++) {
        const i = index ? index.getX(j) : j;
        p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function mesh(geometry, material, name = '') {
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    result.castShadow = true;
    result.receiveShadow = true;
    return result;
  }

  function staticGroup(parts, name) {
    const grouped = new Map();
    for (const p of parts) {
      if (!grouped.has(p.material)) grouped.set(p.material, []);
      grouped.get(p.material).push(p);
    }
    const group = new THREE.Group();
    group.name = name;
    for (const [material, sameMaterialParts] of grouped) {
      group.add(mesh(mergeParts(sameMaterialParts), material, `${name}_surface_${group.children.length}`));
    }
    return group;
  }

  function cloneTemplate(key, make) {
    if (!templates.has(key)) templates.set(key, make());
    return templates.get(key).clone(true);
  }

  function triangleGeometry(vertices, triangles) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap(i => vertices[i]), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeBear() {
    const p = [];
    // A broad 2.5 m body, massive forward muzzle and splayed clawed paws.
    p.push(oval('fur', [0, 1.24, -0.34], [1.1, 0.97, 1.25]));
    p.push(oval('furDark', [0, 1.67, 0.5], [1.01, 0.83, 0.79]));
    p.push(oval('fur', [0, 2.15, 1.09], [0.95, 0.77, 0.77]));
    p.push(oval('muzzle', [0, 1.98, 1.79], [0.75, 0.36, 0.52]));
    p.push(oval('black', [0, 2.08, 2.245], [0.27, 0.18, 0.15]));
    // Dark mouth remains visible beneath the upper snout; two rows of fangs.
    p.push(oval('black', [0, 1.695, 2.10], [0.64, 0.265, 0.20]));
    p.push(oval('muzzle', [0, 1.50, 1.98], [0.65, 0.165, 0.36]));
    for (const x of [-0.49, -0.18, 0.18, 0.49]) {
      p.push(tip('ivory', [x, 1.76, 2.255], [0.09, Math.abs(x) > 0.3 ? 0.31 : 0.21, 0.07], [0, 0, Math.PI]));
    }
    for (const x of [-0.42, 0.42]) p.push(tip('ivory', [x, 1.575, 2.24], [0.09, 0.22, 0.07]));
    for (const side of [-1, 1]) {
      p.push(oval('fur', [side * 0.70, 2.77, 0.95], [0.29, 0.32, 0.24]));
      p.push(oval('furDark', [side * 0.70, 2.78, 1.16], [0.15, 0.18, 0.04]));
      p.push(oval('black', [side * 0.405, 2.35, 1.73], [0.205, 0.16, 0.105]));
      p.push(oval('angryRed', [side * 0.405, 2.355, 1.817], [0.15, 0.075, 0.045]));
      p.push(oval('black', [side * 0.405, 2.35, 1.86], [0.035, 0.064, 0.025]));
      // Outer eyebrow corners rise: this reads as a furious scowl from +z.
      p.push(cube('furDark', [side * 0.42, 2.535, 1.785], [0.56, 0.145, 0.15], [0, 0, side * 0.39]));
      for (const z of [-1.1, 0.80]) {
        p.push(oval('furDark', [side * 0.76, 0.57, z], [0.38, 0.59, 0.42]));
        p.push(oval('furDark', [side * 0.78, 0.23, z + 0.16], [0.46, 0.23, 0.53]));
        for (const clawX of [-0.22, 0, 0.22]) {
          p.push(tip('ivory', [side * 0.78 + clawX, 0.16, z + 0.66], [0.064, 0.36, 0.064], [Math.PI / 2, 0, 0]));
        }
      }
    }
    p.push(oval('furDark', [0, 1.19, -1.57], [0.23, 0.26, 0.23]));
    const group = staticGroup(p, 'furious_bear');
    group.userData.forward = [0, 0, 1];
    group.userData.bodyLength = 2.5;
    return group;
  }

  function makeHunter() {
    const p = [];
    p.push(cube('jacket', [0, 1.43, 0], [0.98, 1.10, 0.64]));
    p.push(cube('jacketDark', [0, 1.48, -0.43], [0.7, 0.89, 0.3]));
    p.push(cube('leather', [0, 0.94, 0.02], [1.02, 0.15, 0.69]));
    p.push(cube('ivory', [0.03, 0.94, 0.39], [0.18, 0.14, 0.045]));
    p.push(cube('jacketDark', [-0.28, 1.43, 0.345], [0.24, 0.26, 0.07]));
    p.push(cube('leather', [0.34, 1.4, 0.36], [0.09, 1.03, 0.035], [0, 0, -0.18]));
    for (const side of [-1, 1]) {
      p.push(cube('jacketDark', [side * 0.26, 0.58, 0], [0.32, 0.75, 0.40], [0, 0, -side * 0.08]));
      p.push(cube('leather', [side * 0.30, 0.135, 0.10], [0.43, 0.27, 0.63]));
      p.push(oval('skin', [side * 0.405, 2.24, 0.03], [0.13, 0.2, 0.11]));
    }
    p.push(oval('skin', [0, 2.24, 0], [0.43, 0.48, 0.37]));
    p.push(oval('skin', [0, 2.245, 0.385], [0.095, 0.12, 0.10]));
    p.push(cube('black', [0, 2.04, 0.362], [0.30, 0.06, 0.037], [0, 0, 0.08]));
    p.push(cube('ivory', [-0.018, 2.055, 0.386], [0.20, 0.035, 0.015], [0, 0, 0.08]));
    for (const side of [-1, 1]) {
      p.push(oval('black', [side * 0.165, 2.34, 0.328], [0.12, 0.09, 0.045]));
      p.push(oval('angryRed', [side * 0.165, 2.34, 0.366], [0.07, 0.044, 0.019]));
      p.push(cube('black', [side * 0.175, 2.445, 0.337], [0.30, 0.073, 0.058], [0, 0, side * 0.34]));
    }
    p.push(peg('jacketDark', [0, 2.635, 0], [0.62, 0.10, 0.55]));
    p.push(oval('jacket', [0, 2.75, -0.035], [0.45, 0.26, 0.4]));
    p.push(cube('leather', [0, 2.69, 0.345], [0.55, 0.1, 0.06]));
    // Elbows project clearly to the sides; both forearms reach toward the rifle.
    p.push(cube('jacket', [0.57, 1.53, 0.15], [0.31, 0.78, 0.31], [0.2, 0, -0.3]));
    p.push(cube('jacket', [-0.50, 1.50, 0.25], [0.32, 0.78, 0.31], [0.4, 0, 0.35]));
    p.push(cube('jacket', [-0.19, 1.40, 0.66], [0.74, 0.27, 0.3], [0, 0.3, 0.12]));
    p.push(oval('skin', [0.37, 1.65, 0.40], [0.16, 0.17, 0.16]));
    p.push(oval('skin', [0.28, 1.48, 0.87], [0.16, 0.14, 0.16]));
    const group = staticGroup(p, 'angry_hunter');

    const gunParts = [];
    gunParts.push(cube('wood', [0, -0.03, -0.05], [0.25, 0.30, 0.79], [-0.08, 0, 0]));
    gunParts.push(cube('steel', [0, 0.07, 0.5], [0.23, 0.18, 0.60]));
    gunParts.push(peg('steel', [0, 0.1, 1.13], [0.07, 1.07, 0.07], [Math.PI / 2, 0, 0]));
    gunParts.push(peg('black', [0, 0.1, 1.66], [0.091, 0.07, 0.091], [Math.PI / 2, 0, 0]));
    gunParts.push(peg('black', [0, 0.22, 0.5], [0.09, 0.44, 0.09], [Math.PI / 2, 0, 0]));
    gunParts.push(cube('black', [0, -0.13, 0.28], [0.10, 0.16, 0.24]));
    const weapon = staticGroup(gunParts, 'hunter_weapon');
    weapon.position.set(0.38, 1.66, 0.13);
    group.add(weapon);
    group.userData.forward = [0, 0, 1];
    return group;
  }

  function rampDefinition(style) {
    if (style === 1) {
      const length = 17.4;
      const height = 3.3;
      const profile = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        profile.push({ z: length / 2 - t * length, y: 0.04 + (height - 0.04) * t * t });
      }
      return { style: 'quarterpipe', width: 5.4, length, height, profile };
    }
    if (style === 2) {
      return {
        style: 'twin_kicker', width: 5.8, length: 15.8, height: 4.45,
        profile: [{ z: 7.9, y: 0.04 }, { z: 1.9, y: 1.2 }, { z: -0.7, y: 1.2 }, { z: -7.9, y: 4.45 }],
      };
    }
    return {
      style: 'straight_wedge', width: 5.6, length: 12.4, height: 3.35,
      profile: [{ z: 6.2, y: 0.04 }, { z: -6.2, y: 3.35 }],
    };
  }

  function profileHeight(profile, z) {
    if (z >= profile[0].z) return profile[0].y;
    if (z <= profile[profile.length - 1].z) return profile[profile.length - 1].y;
    for (let i = 1; i < profile.length; i++) {
      if (z >= profile[i].z) {
        const a = profile[i - 1];
        const b = profile[i];
        const t = (a.z - z) / (a.z - b.z);
        return a.y + (b.y - a.y) * t;
      }
    }
    return 0;
  }

  function rampSurface(profile, x0, x1) {
    const v = [];
    const indices = [];
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      const j = v.length;
      v.push([x0, a.y, a.z], [x1, a.y, a.z], [x0, b.y, b.z], [x1, b.y, b.z]);
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
    return triangleGeometry(v, indices);
  }

  function rampSides(profile, width) {
    const v = [];
    const indices = [];
    const pushQuad = (a, b, c, d) => {
      const j = v.length;
      v.push(a, b, c, d);
      indices.push(j, j + 1, j + 2, j, j + 2, j + 3);
    };
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      pushQuad([-width / 2, 0, a.z], [-width / 2, a.y, a.z], [-width / 2, b.y, b.z], [-width / 2, 0, b.z]);
      pushQuad([width / 2, 0, b.z], [width / 2, b.y, b.z], [width / 2, a.y, a.z], [width / 2, 0, a.z]);
    }
    const a = profile[0];
    const b = profile[profile.length - 1];
    pushQuad([-width / 2, 0, a.z], [width / 2, 0, a.z], [width / 2, a.y, a.z], [-width / 2, a.y, a.z]);
    pushQuad([width / 2, 0, b.z], [-width / 2, 0, b.z], [-width / 2, b.y, b.z], [width / 2, b.y, b.z]);
    return triangleGeometry(v, indices);
  }

  function deckChevron(profile, z, x = 0, size = 1) {
    const points = [
      [x - 0.26 * size, z + 0.85 * size], [x + 0.26 * size, z + 0.85 * size],
      [x + 0.26 * size, z - 0.15 * size], [x + 0.69 * size, z - 0.15 * size],
      [x, z - 1.15 * size], [x - 0.69 * size, z - 0.15 * size], [x - 0.26 * size, z - 0.15 * size],
    ];
    const vertices = points.map(([px, pz]) => [px, profileHeight(profile, pz) + 0.035, pz]);
    return triangleGeometry(vertices, [0, 1, 2, 0, 2, 6, 5, 3, 4]);
  }

  function makeRamp(style) {
    const def = rampDefinition(style);
    const { width, length, profile } = def;
    const p = [];
    p.push(part(rampSides(profile, width), 'rampSide', [0, 0, 0], [1, 1, 1]));
    p.push(part(rampSurface(profile, -width / 2, width / 2), 'rampTop', [0, 0, 0], [1, 1, 1]));
    if (style === 2) {
      p.push(part(rampSurface(profile, -0.17, 0.17), 'rampSide', [0, 0.018, 0], [1, 1, 1]));
    }
    for (let z = length / 2 - 0.5; z > -length / 2 + 0.4; z -= 0.8) {
      const y = profileHeight(profile, z);
      const slope = (profileHeight(profile, z - 0.08) - profileHeight(profile, z + 0.08)) / 0.16;
      p.push(cube('rampSide', [0, y + 0.012, z], [width - 0.06, 0.025, 0.025], [Math.atan(slope), 0, 0]));
    }
    for (const side of [-1, 1]) {
      // Low edge boards define the silhouette without obstructing the deck.
      for (let i = 1; i < profile.length; i++) {
        const a = profile[i - 1];
        const b = profile[i];
        const dy = b.y - a.y;
        const dz = a.z - b.z;
        p.push(cube('rampRail', [side * (width / 2 - 0.055), (a.y + b.y) / 2 + 0.055, (a.z + b.z) / 2],
          [0.13, 0.11, Math.hypot(dz, dy) + 0.025], [Math.atan2(dy, dz), 0, 0]));
      }
      for (const fraction of [0.18, 0.48, 0.77, 0.98]) {
        const z = length / 2 - fraction * length;
        const h = profileHeight(profile, z);
        p.push(cube('rampRail', [side * (width / 2 + 0.015), h / 2, z], [0.09, h, 0.15]));
        p.push(cube('steel', [side * (width / 2 + 0.066), Math.max(0.1, h * 0.75), z], [0.03, 0.13, 0.25]));
      }
    }
    if (style === 2) {
      for (const x of [-width / 4, width / 4]) {
        p.push(part(deckChevron(profile, length * 0.18, x, 0.85), 'warning', [0, 0, 0], [1, 1, 1]));
      }
    } else {
      for (const z of [length * 0.22, -length * 0.16]) p.push(part(deckChevron(profile, z), 'warning', [0, 0, 0], [1, 1, 1]));
    }
    const group = staticGroup(p, `ramp_${def.style}`);
    group.userData = { ...def, approach: [0, 0, 1], takeoff: [0, 0, -1] };
    return group;
  }

  function wingGeometry(span, chord, sweep = 1, thickness = 0.15) {
    // Broad tapered wings with a swept trailing edge, axis -z.
    const v = [
      [-span / 2, -thickness / 2, sweep], [span / 2, -thickness / 2, sweep],
      [-span / 2, -thickness / 2, sweep - chord * 0.58], [span / 2, -thickness / 2, sweep - chord * 0.58],
      [-1.0, -thickness / 2, -chord / 2], [1.0, -thickness / 2, -chord / 2],
      [-span / 2, thickness / 2, sweep], [span / 2, thickness / 2, sweep],
      [-span / 2, thickness / 2, sweep - chord * 0.58], [span / 2, thickness / 2, sweep - chord * 0.58],
      [-1.0, thickness / 2, -chord / 2], [1.0, thickness / 2, -chord / 2],
    ];
    return triangleGeometry(v, [
      6, 10, 8, 6, 7, 10, 7, 11, 10, 7, 9, 11,
      0, 2, 4, 0, 4, 1, 1, 4, 5, 1, 5, 3,
      0, 6, 8, 0, 8, 2, 2, 8, 10, 2, 10, 4,
      4, 10, 11, 4, 11, 5, 5, 11, 9, 5, 9, 3,
      3, 9, 7, 3, 7, 1, 1, 7, 6, 1, 6, 0,
    ]);
  }

  function makeBomber() {
    const p = [];
    p.push(oval('planeBody', [0, 0, 0], [1.35, 1.1, 6.0]));
    p.push(oval('planeTrim', [0, 0.02, -5.72], [0.56, 0.52, 0.70]));
    p.push(oval('glass', [0, 0.89, -3.31], [0.91, 0.63, 1.55]));
    p.push(cube('planeDark', [0, 1.375, -3.28], [0.075, 0.09, 2.30]));
    p.push(part(wingGeometry(20, 4.4, 1.25, 0.22), 'planeWing', [0, 0.19, -0.65], [1, 1, 1]));
    // A second shorter upper wing makes the cartoon bomber unmistakable.
    p.push(part(wingGeometry(15.4, 2.6, 1.0, 0.15), 'planeBody', [0, 2.12, 0.16], [1, 1, 1]));
    for (const side of [-1, 1]) {
      p.push(cube('planeDark', [side * 4.8, 1.19, 0.04], [0.16, 1.88, 0.17], [0.04, 0, side * 0.10]));
      p.push(oval('planeDark', [side * 4.60, -0.14, -1.56], [0.87, 0.8, 2.29]));
      p.push(peg('planeTrim', [side * 4.60, -0.14, -3.7], [0.81, 0.26, 0.81], [Math.PI / 2, 0, 0]));
      p.push(oval('planeBody', [side * 4.60, -0.14, -3.99], [0.23, 0.23, 0.32]));
      // Two crossed propeller blades are visible from both ends of the course.
      p.push(cube('black', [side * 4.60, -0.14, -4.05], [0.20, 3.4, 0.12], [0, 0, side * 0.18]));
      p.push(cube('black', [side * 4.60, -0.14, -4.055], [3.4, 0.20, 0.12], [0, 0, side * 0.18]));
      p.push(cube('planeTrim', [side * 8.77, 0.23, 0.0], [0.88, 0.27, 1.70]));
    }
    p.push(part(wingGeometry(7.2, 2.15, 0.7, 0.16), 'planeWing', [0, 0.25, 4.45], [1, 1, 1]));
    const fin = triangleGeometry(
      [[-0.11, 0, 3.68], [-0.11, 2.95, 4.30], [-0.11, 0.38, 5.72], [0.11, 0, 3.68], [0.11, 2.95, 4.30], [0.11, 0.38, 5.72]],
      [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5],
    );
    p.push(part(fin, 'planeDark', [0, 0.25, 0], [1, 1, 1]));
    p.push(cube('planeTrim', [0, -0.75, 0.3], [1.5, 0.23, 3.2]));
    const group = staticGroup(p, 'cartoon_twin_engine_bomber');
    group.userData.forward = [0, 0, -1];
    group.userData.wingspan = 20;
    group.userData.fuselageLength = 12;
    return group;
  }

  function makeSpikePit(radius) {
    const group = new THREE.Group();
    group.name = 'crater_spike_floor';
    const floor = mesh(cylinder(), materials.pit, 'pit_floor');
    floor.scale.set(radius * 0.78, 0.08, radius * 0.78);
    floor.position.y = -0.04;
    group.add(floor);
    const points = [[0, 0]];
    for (let ring = 1; ring <= 2; ring++) {
      const count = ring === 1 ? 7 : 12;
      const r = radius * (ring === 1 ? 0.40 : 0.82);
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + ring * 0.23;
        points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
      }
    }
    points.forEach(([x, z], index) => {
      const height = 1.55 + ((index * 7) % 5) * 0.12;
      const spike = mesh(cone(), materials.spike, `pit_spike_${index}`);
      spike.scale.set(0.23 + (index % 3) * 0.025, height, 0.23 + (index % 3) * 0.025);
      spike.position.set(x, height / 2, z);
      spike.userData.basePosition = { x, y: 0, z };
      spike.userData.height = height;
      group.add(spike);
    });
    group.userData.radius = radius;
    group.userData.floorAt = 0;
    return group;
  }

  const vec = (p) => p.isVector3 ? p.clone() : Array.isArray(p) ? new THREE.Vector3(...p) : new THREE.Vector3(p.x, p.y, p.z);

  function lightning(points) {
    const path = (points || [[0, 15, 0], [1.2, 10, 0.4], [-0.7, 6, -0.3], [0, 0, 0]]).map(vec);
    if (path.length < 2 || path.some(p => !Number.isFinite(p.x + p.y + p.z))) {
      throw new Error('lightning(points) requires at least two finite 3D points');
    }
    const segments = [];
    for (let i = 1; i < path.length; i++) segments.push({ a: path[i - 1], b: path[i], branch: false });
    for (let i = 1; i < path.length - 1; i += 2) {
      const p = path[i];
      const side = i % 4 < 2 ? 1 : -1;
      const extent = Math.min(3.4, Math.max(1.0, path[0].distanceTo(path[path.length - 1]) * 0.13));
      const bend = p.clone().add(new THREE.Vector3(side * extent * 0.52, -extent * 0.25, extent * 0.23));
      const end = p.clone().add(new THREE.Vector3(side * extent, -extent * 0.85, -extent * 0.1));
      segments.push({ a: p, b: bend, branch: true }, { a: bend, b: end, branch: true });
    }
    const group = new THREE.Group();
    group.name = 'lightning_strike';
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    for (const layer of ['glow', 'core']) {
      const bolt = new THREE.InstancedMesh(boltCylinder(), materials[layer === 'core' ? 'boltCore' : 'boltGlow'], segments.length);
      bolt.name = `lightning_${layer}`;
      segments.forEach(({ a, b, branch }, i) => {
        const direction = b.clone().sub(a);
        const length = direction.length();
        q.setFromUnitVectors(up, length > 0 ? direction.divideScalar(length) : up);
        const radius = layer === 'core' ? (branch ? 0.16 : 0.48) : (branch ? 0.30 : 0.86);
        scale.set(radius, Math.max(0.001, length + radius * 0.8), radius);
        matrix.compose(a.clone().add(b).multiplyScalar(0.5), q, scale);
        bolt.setMatrixAt(i, matrix);
      });
      bolt.instanceMatrix.needsUpdate = true;
      bolt.computeBoundingSphere();
      bolt.frustumCulled = false;
      group.add(bolt);
    }
    group.userData.points = path.map(p => [p.x, p.y, p.z]);
    group.userData.flashMaterial = materials.boltGlow;
    group.userData.core = group.getObjectByName('lightning_core');
    group.userData.glow = group.getObjectByName('lightning_glow');
    return group;
  }

  function makeExplosion() {
    const p = [];
    p.push(oval('fireCore', [0, 1.0, 0], [1.25, 1.05, 1.25]));
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const y = 0.4 + (i % 3) * 0.6;
      p.push(oval('fireOrange', [Math.cos(a) * 1.13, y, Math.sin(a) * 1.13], [0.79, 0.78, 0.79]));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.52, Math.sin(a)).normalize());
      const e = new THREE.Euler().setFromQuaternion(q);
      p.push(tip('fireRed', [Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6], [0.34, 1.8, 0.34], [e.x, e.y, e.z]));
    }
    for (let i = 0; i < 4; i++) p.push(oval('smoke', [Math.sin(i * 1.7) * 0.8, 2.7 + i * 0.65, Math.cos(i * 1.7) * 0.6], [0.91 + i * 0.08, 0.8, 0.91 + i * 0.08]));
    return staticGroup(p, 'cartoon_explosion');
  }

  return {
    bear: () => cloneTemplate('bear', makeBear),
    hunter: () => {
      const group = cloneTemplate('hunter', makeHunter);
      group.userData.weapon = group.getObjectByName('hunter_weapon');
      return group;
    },
    ramp: (style = 0) => {
      const names = { straight: 0, wedge: 0, quarterpipe: 1, curved: 1, twin: 2, kicker: 2, kink: 2 };
      const selected = typeof style === 'string' ? names[style] ?? 0 : ((Math.trunc(style) % 3) + 3) % 3;
      return cloneTemplate(`ramp_${selected}`, () => makeRamp(selected));
    },
    bomber: () => cloneTemplate('bomber', makeBomber),
    spikePit: (radius = 3.2) => {
      const safeRadius = Number.isFinite(Number(radius)) ? Math.max(0.75, Number(radius) || 3.2) : 3.2;
      const group = cloneTemplate(`spikePit_${safeRadius}`, () => makeSpikePit(safeRadius));
      group.userData.spikes = group.children.filter(child => child.name.startsWith('pit_spike_'));
      group.userData.floor = group.getObjectByName('pit_floor');
      return group;
    },
    lightning,
    explosion: () => cloneTemplate('explosion', makeExplosion),
  };
}
