/**
 * Low-poly alpine scenery. Call createSceneryAssets(THREE) once per scene.
 * Every returned Group is grounded at y=0 and faces -z. Instance clones share
 * their immutable geometries and materials; dispose only when the scene ends.
 */
export function createSceneryAssets(THREE) {
  const geometries = new Map();
  const templates = new Map();
  const materials = {};
  const palette = {
    timber: 0x886047, timberLight: 0xb58b61, timberDark: 0x4f3a30,
    barn: 0xa76143, stone: 0xaaa69a, stoneDark: 0x777b79,
    roofOrange: 0xad6747, roofBlue: 0x526e80, roofDark: 0x535961,
    glass: 0x9dc7d3, windowGlow: 0xf3d7a0, snow: 0xf2f5f4,
    rock: 0x69767c, rockDark: 0x56636b, rockLight: 0x829096,
    squirrel: 0xb76235, squirrelTail: 0x954526, squirrelBelly: 0xe1b082,
    marmot: 0xa18b63, marmotBelly: 0xc8b994, paw: 0x614b37,
    black: 0x242b30, jacket: 0xdd7850, pants: 0x394b60,
    helmet: 0x709b89, skin: 0xdbb394, ski: 0xcbb56c, pole: 0x859598,
  };
  for (const [name, color] of Object.entries(palette)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color, roughness: name === 'glass' ? 0.3 : 0.92,
      metalness: name === 'pole' ? 0.25 : 0,
      flatShading: true,
    });
    if (name === 'windowGlow') {
      materials[name].emissive.setHex(0xc48636);
      materials[name].emissiveIntensity = 0.15;
    }
  }

  function cached(key, make) {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  }
  const box = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  const sphere = () => cached('sphere', () => new THREE.SphereGeometry(1, 8, 6));
  const cylinder = () => cached('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const cone = () => cached('cone', () => new THREE.ConeGeometry(1, 1, 10));
  const pyramid = () => cached('pyramid', () => new THREE.ConeGeometry(1, 1, 4));
  const part = (geometry, material, position, scale, rotation = [0, 0, 0]) =>
    ({ geometry, material: materials[material], position, scale, rotation });
  const cube = (mat, xyz, size, rotation) => part(box(), mat, xyz, size, rotation);
  const oval = (mat, xyz, size, rotation) => part(sphere(), mat, xyz, size, rotation);

  // Merge static shapes per material without a dependency on BufferGeometryUtils.
  // Houses use 7-8 meshes, even when they contain dozens of architectural details.
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
      const geometry = item.geometry;
      const pos = geometry.getAttribute('position');
      const nor = geometry.getAttribute('normal');
      const index = geometry.index;
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

  function mesh(geometry, material) {
    const result = new THREE.Mesh(geometry, material);
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
    for (const [material, materialParts] of grouped) {
      const merged = mesh(mergeParts(materialParts), material);
      merged.name = `${name}_surface_${group.children.length}`;
      group.add(merged);
    }
    return group;
  }

  function dimensions(group) {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    return { width: size.x, height: size.y, length: size.z };
  }

  function triangularPrism() {
    return cached('triangularPrism', () => {
      const v = [
        [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
        [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5],
      ];
      const triangles = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3,
        1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap(i => v[i]), 3));
      geometry.computeVertexNormals();
      return geometry;
    });
  }

  function gable(parts, width, depth, eaves, rise, mat, x = 0, z = 0, yaw = 0) {
    const slope = Math.atan2(rise, width / 2);
    const length = Math.hypot(width / 2, rise);
    for (const side of [-1, 1]) {
      const localX = side * width / 4;
      const offsetX = localX * Math.cos(yaw);
      const offsetZ = -localX * Math.sin(yaw);
      // A composed transform keeps the roof ridge aligned when the barn rotates.
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * slope)));
      const e = new THREE.Euler().setFromQuaternion(q);
      parts.push(cube(mat, [x + offsetX, eaves + rise / 2, z + offsetZ],
        [length, 0.2, depth], [e.x, e.y, e.z]));
    }
  }

  function door(parts, x, y, z, width = 1.15, height = 2.05, yaw = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const front = new THREE.Vector3(0, 0, -0.035).applyQuaternion(q);
    parts.push(cube('timberDark', [x, y + height / 2, z], [width + 0.14, height + 0.12, 0.09], [0, yaw, 0]));
    parts.push(cube('timberLight', [x + front.x, y + height / 2, z + front.z],
      [width, height, 0.045], [0, yaw, 0]));
    const knob = new THREE.Vector3(width * 0.32, 0, -0.082).applyQuaternion(q);
    parts.push(oval('timberDark', [x + knob.x, y + height * 0.48, z + knob.z], [0.055, 0.055, 0.055]));
  }

  function window(parts, x, y, z, width = 1.0, height = 1.0, yaw = 0, warm = false) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const outer = new THREE.Vector3(0, 0, -0.04).applyQuaternion(q);
    const mullion = new THREE.Vector3(0, 0, -0.09).applyQuaternion(q);
    parts.push(cube('timberDark', [x, y, z], [width + 0.18, height + 0.18, 0.11], [0, yaw, 0]));
    parts.push(cube(warm ? 'windowGlow' : 'glass', [x + outer.x, y, z + outer.z],
      [width, height, 0.06], [0, yaw, 0]));
    parts.push(cube('timberLight', [x + mullion.x, y, z + mullion.z],
      [0.065, height, 0.04], [0, yaw, 0]));
    parts.push(cube('timberLight', [x + mullion.x, y, z + mullion.z],
      [width, 0.065, 0.04], [0, yaw, 0]));
  }

  function makeHouse(style) {
    const parts = [];
    if (style === 0) {
      // Broad alpine chalet: deep eaves, stone footing and timber gables.
      parts.push(cube('stone', [0, 0.26, 0], [8, 0.52, 7]));
      parts.push(cube('timber', [0, 2.08, 0], [7.8, 3.12, 6.7]));
      parts.push(part(triangularPrism(), 'timberLight', [0, 3.64, 0], [7.8, 2.35, 6.7]));
      gable(parts, 8.6, 7.6, 3.62, 2.5, 'roofBlue');
      door(parts, 0, 0.53, -3.4);
      for (const x of [-2.65, 2.65]) window(parts, x, 2.25, -3.4, 1.35, 1.15);
      window(parts, 0, 4.7, -3.4, 1.1, 0.8, 0, true);
      for (const z of [-1.5, 1.5]) window(parts, 3.95, 2.2, z, 1.05, 1.1, -Math.PI / 2);
      parts.push(cube('stone', [0, 0.14, -3.92], [2.7, 0.28, 1]));
      parts.push(cube('stoneDark', [2.45, 5.2, 1.25], [0.7, 2.2, 0.8]));
    } else if (style === 1) {
      // A-frame: the steep roof reaches almost to the ground.
      parts.push(cube('stone', [0, 0.17, 0], [6.9, 0.34, 7.3]));
      parts.push(part(triangularPrism(), 'timberLight', [0, 0.34, 0], [6.6, 6.56, 6.9]));
      gable(parts, 7.15, 7.65, 0.35, 6.7, 'roofOrange');
      door(parts, 0, 0.35, -3.5, 1.08, 2.15);
      window(parts, 0, 3.86, -3.5, 1.4, 1.35, 0, true);
      for (const x of [-1.82, 1.82]) window(parts, x, 1.35, -3.5, 0.65, 0.95);
      parts.push(cube('timber', [0, 0.12, -3.89], [4.8, 0.24, 1.05]));
      parts.push(cube('timberDark', [0, 6.64, -3.57], [0.12, 0.64, 0.13]));
    } else if (style === 2) {
      // Round hut: circular masonry and an unmistakable conical roof.
      parts.push(part(cylinder(), 'stoneDark', [0, 0.2, 0], [3.55, 0.4, 3.55]));
      parts.push(part(cylinder(), 'timber', [0, 1.98, 0], [3.42, 3.16, 3.42]));
      parts.push(part(cone(), 'roofBlue', [0, 4.72, 0], [3.96, 2.5, 3.96]));
      door(parts, 0, 0.4, -3.45, 1.12, 2.08);
      for (const angle of [-0.9, 0.9, -1.9, 1.9]) {
        window(parts, Math.sin(angle) * 3.42, 2.25, -Math.cos(angle) * 3.42,
          0.86, 1.0, -angle, true);
      }
      parts.push(cube('stone', [0, 0.12, -3.74], [1.7, 0.24, 0.75]));
    } else if (style === 3) {
      // Two-storey lodge with a square tower above the main ridge.
      parts.push(cube('stone', [-0.9, 0.24, 0], [6.4, 0.48, 6.55]));
      parts.push(cube('timber', [-0.9, 2.82, 0], [6.2, 4.68, 6.35]));
      parts.push(part(triangularPrism(), 'timberLight', [-0.9, 5.16, 0], [6.2, 1.8, 6.35]));
      gable(parts, 6.7, 7.05, 5.15, 1.9, 'roofDark', -0.9);
      parts.push(cube('stone', [2.8, 3.6, 0.6], [2.5, 7.2, 3.1]));
      parts.push(part(pyramid(), 'roofOrange', [2.8, 7.98, 0.6], [2.1, 1.56, 2.1], [0, Math.PI / 4, 0]));
      door(parts, -0.9, 0.49, -3.23, 1.2, 2.1);
      for (const x of [-2.75, 0.95]) {
        window(parts, x, 1.93, -3.23, 1.05, 1.05);
        window(parts, x, 4.13, -3.23, 1.05, 1.1, 0, true);
      }
      for (const y of [2.5, 4.65, 6.3]) window(parts, 2.8, y, -0.99, 0.58, 0.92, 0, true);
      parts.push(cube('timberDark', [-0.9, 2.95, -3.3], [6.25, 0.14, 0.12]));
    } else {
      // Long low barn: ridge runs across the wide frontage and double doors.
      parts.push(cube('stone', [0, 0.18, 0], [9.3, 0.36, 5.05]));
      parts.push(cube('barn', [0, 1.74, 0], [9.1, 2.76, 4.85]));
      parts.push(part(triangularPrism(), 'timber', [0, 3.12, 0], [4.85, 1.6, 9.1], [0, Math.PI / 2, 0]));
      gable(parts, 5.4, 9.8, 3.12, 1.65, 'roofOrange', 0, 0, Math.PI / 2);
      door(parts, -0.66, 0.36, -2.48, 1.23, 2.37);
      door(parts, 0.66, 0.36, -2.48, 1.23, 2.37);
      for (const x of [-3.2, 3.2]) window(parts, x, 2.13, -2.48, 1.15, 0.82);
      parts.push(cube('timberLight', [0, 2.94, -2.53], [9.0, 0.14, 0.1]));
      for (const x of [-4.43, 4.43]) parts.push(cube('timberLight', [x, 1.75, -2.53], [0.15, 2.78, 0.1]));
    }
    const group = staticGroup(parts, ['chalet', 'aframe', 'hut', 'lodge', 'barn'][style]);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    group.userData = {
      style: group.name,
      dimensions: { width: size.x, height: size.y, length: size.z },
      collider: {
        type: 'box', halfExtents: [size.x / 2, size.y / 2, size.z / 2],
        offsetY: center.y, offset: [center.x, center.y, center.z],
      },
    };
    return group;
  }

  function hashSeed(seed) {
    const value = String(seed ?? 1);
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  function rng(seed) {
    let state = hashSeed(seed);
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One closed-outline triangulated surface per peak. Rock and snow share
  // exactly the same boundary vertices; there is no overlapping snow shell.
  function peakSurface(variant) {
    const key = `peak-${variant}`;
    if (!geometries.has(key)) {
      const random = rng(`rock-${variant}`);
      const count = 7;
      const spread = Array.from({ length: count }, () => 0.79 + random() * 0.42);
      const skewX = -0.13 + random() * 0.2;
      const skewZ = -0.08 + random() * 0.18;
      const point = (i, y) => {
        const angle = i * Math.PI * 2 / count;
        const radius = Math.pow(1 - y, 0.86) * spread[i];
        return [Math.cos(angle) * radius + skewX * y,
          y, Math.sin(angle) * radius * (0.77 + variant * 0.019) + skewZ * y];
      };
      function surface(rings) {
        const vertices = [], colors = [];
        const rockColors = [0x56636b, 0x69767c, 0x829096].map(c => new THREE.Color(c));
        const snowColors = [0xf2f5f4, 0xe5eef1].map(c => new THREE.Color(c));
        const triangle = (a, b, c, snow, i) => {
          vertices.push(...a, ...b, ...c);
          const color = snow ? snowColors[i % 2] : rockColors[(i + variant) % 3];
          for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
        };
        for (let ring = 0; ring < rings.length - 1; ring++) {
          for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            const a = rings[ring][i], b = rings[ring][j];
            const c = rings[ring + 1][i], d = rings[ring + 1][j];
            triangle(a, c, b, ring >= 3, i);
            triangle(b, c, d, ring >= 3, i + 1);
          }
        }
        const last = rings[rings.length - 1];
        const summit = [skewX, 1, skewZ];
        for (let i = 0; i < count; i++) triangle(last[i], summit, last[(i + 1) % count], true, i);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
      }
      const rings = [0, 0.22, 0.53].map((level, ring) =>
        Array.from({ length: count }, (_, i) => point(i, Math.max(0, level + (ring ? (random() - 0.5) * 0.065 : 0)))));
      rings.push(Array.from({ length: count }, (_, i) => point(i, 0.69 + random() * 0.14)));
      rings.push(Array.from({ length: count }, (_, i) => point(i, 0.91)));
      geometries.set(key, surface(rings));
    }
    return geometries.get(key);
  }

  function mountain(seed = 1) {
    const random = rng(seed);
    const height = 130 + random() * 150;
    const baseWidth = height * (0.54 + random() * 0.23);
    const group = new THREE.Group();
    group.name = 'jagged_mountain_cluster';
    const peaks = [
      { x: 0, z: 0, h: height, radius: baseWidth, variant: Math.floor(random() * 8) },
      { x: -baseWidth * 0.66, z: baseWidth * 0.26, h: height * 0.71, radius: baseWidth * 0.68, variant: Math.floor(random() * 8) },
      { x: baseWidth * 0.71, z: -baseWidth * 0.13, h: height * 0.54, radius: baseWidth * 0.65, variant: Math.floor(random() * 8) },
      { x: baseWidth * 0.2, z: baseWidth * 0.72, h: height * 0.8, radius: baseWidth * 0.71, variant: Math.floor(random() * 8) },
      { x: -baseWidth * 0.27, z: -baseWidth * 0.65, h: height * 0.43, radius: baseWidth * 0.61, variant: Math.floor(random() * 8) },
    ];
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i];
      const geometry = peakSurface(p.variant);
      const peak = new THREE.Group();
      peak.name = `peak_${i}`;
      peak.position.set(p.x, 0, p.z);
      peak.rotation.y = random() * Math.PI * 2;
      peak.scale.set(p.radius, p.h, p.radius * (0.82 + random() * 0.3));
      if (!materials.mountainSurface) materials.mountainSurface = new THREE.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, roughness: 0.94, flatShading: true,
      });
      const surface = mesh(geometry, materials.mountainSurface);
      // Very large mountains do not need to contribute to the expensive shadow map.
      surface.castShadow = false;
      peak.add(surface);
      group.add(peak);
    }
    group.userData = { seed, height, dimensions: dimensions(group), singleSurface: true };
    return group;
  }

  function tailGeometry(kind) {
    return cached(`tail-${kind}`, () => {
      const rings = kind === 'squirrel'
        ? [[0, 0, 0, 0.075], [0, 0.16, 0.13, 0.15], [0, 0.43, 0.16, 0.18],
          [0, 0.68, 0.1, 0.15], [0, 0.75, -0.07, 0.085], [0, 0.64, -0.16, 0.035]]
        : [[0, 0, 0, 0.07], [0, -0.03, 0.1, 0.065], [0, -0.05, 0.19, 0.025]];
      const vertices = [];
      const sides = 7;
      const at = (ring, side) => {
        const [x, y, z, radius] = rings[ring];
        const previous = rings[Math.max(0, ring - 1)];
        const next = rings[Math.min(rings.length - 1, ring + 1)];
        const tangent = new THREE.Vector3(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]).normalize();
        const first = new THREE.Vector3(1, 0, 0);
        const second = new THREE.Vector3().crossVectors(tangent, first).normalize();
        const angle = side * Math.PI * 2 / sides;
        return new THREE.Vector3(x, y, z)
          .addScaledVector(first, Math.cos(angle) * radius * 0.8)
          .addScaledVector(second, Math.sin(angle) * radius).toArray();
      };
      for (let r = 0; r < rings.length - 1; r++) {
        for (let i = 0; i < sides; i++) {
          const j = (i + 1) % sides;
          vertices.push(...at(r, i), ...at(r, j), ...at(r + 1, i),
            ...at(r, j), ...at(r + 1, j), ...at(r + 1, i));
        }
      }
      for (let i = 0; i < sides; i++) {
        vertices.push(...rings[0].slice(0, 3), ...at(0, (i + 1) % sides), ...at(0, i));
        const last = rings.length - 1;
        vertices.push(...rings[last].slice(0, 3), ...at(last, i), ...at(last, (i + 1) % sides));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      return geometry;
    });
  }

  function makeAnimal(kind) {
    const squirrel = kind === 'squirrel';
    const fur = squirrel ? 'squirrel' : 'marmot';
    const parts = [
      oval(fur, [0, 0.28, 0], squirrel ? [0.17, 0.2, 0.29] : [0.235, 0.24, 0.335]),
      oval(squirrel ? 'squirrelBelly' : 'marmotBelly', [0, 0.255, -0.18], squirrel ? [0.125, 0.145, 0.16] : [0.17, 0.18, 0.19]),
      oval(fur, [0, 0.41, -0.275], squirrel ? [0.155, 0.15, 0.17] : [0.18, 0.16, 0.18]),
      oval(squirrel ? 'squirrelBelly' : 'marmotBelly', [0, 0.365, -0.405], [0.105, 0.075, 0.1]),
      oval('black', [0, 0.386, -0.493], [0.043, 0.033, 0.031]),
    ];
    for (const side of [-1, 1]) {
      parts.push(oval(fur, [side * 0.115, squirrel ? 0.554 : 0.532, -0.245],
        squirrel ? [0.052, 0.102, 0.042] : [0.061, 0.052, 0.035], [0, 0, side * -0.13]));
      parts.push(oval('black', [side * (squirrel ? 0.125 : 0.147), 0.45, -0.376], [0.025, 0.028, 0.026]));
    }
    const group = staticGroup(parts, kind);
    const legRadius = squirrel ? 0.047 : 0.059;
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Group();
      leg.name = `leg_${i}`;
      leg.position.set((i % 2 ? 1 : -1) * (squirrel ? 0.118 : 0.166), 0.245, i < 2 ? -0.15 : 0.18);
      const shape = cached(`animal-leg-${kind}`, () => mergeParts([
        oval(fur, [0, -0.106, 0], [legRadius, 0.115, legRadius]),
        oval(fur, [0, -0.209, -0.03], [legRadius * 1.25, 0.036, 0.075]),
      ]));
      leg.add(mesh(shape, materials[fur]));
      group.add(leg);
    }
    const tail = new THREE.Group();
    tail.name = 'tail_root';
    tail.position.set(0, squirrel ? 0.22 : 0.16, squirrel ? 0.12 : 0.26);
    tail.add(mesh(tailGeometry(kind), materials[squirrel ? 'squirrelTail' : 'marmot']));
    group.add(tail);
    group.userData = { kind, dimensions: dimensions(group), forward: [0, 0, -1] };
    return group;
  }

  function segment(mat, from, to, radius, secondRadius = radius) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const center = a.clone().add(b).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);
    const geometry = cached(`segment-${radius}-${secondRadius}`, () =>
      new THREE.CylinderGeometry(secondRadius, radius, 1, 7));
    return part(geometry, mat, center.toArray(), [1, direction.length(), 1], [rotation.x, rotation.y, rotation.z]);
  }

  function makeSkier() {
    const parts = [];
    for (const side of [-1, 1]) {
      const x = side * 0.19;
      // Ski noses rise in the forward (-z) direction.
      parts.push(cube('ski', [x, 0.036, 0.07], [0.135, 0.055, 2.18]));
      parts.push(cube('ski', [x, 0.097, -1.085], [0.13, 0.055, 0.22], [-0.43, 0, 0]));
      parts.push(cube('snow', [x, 0.067, 0.15], [0.034, 0.012, 1.4]));
      parts.push(cube('black', [x, 0.169, -0.065], [0.15, 0.22, 0.32], [-0.08, 0, 0]));
      const knee = [x, 0.69, -0.27];
      const hip = [x * 0.75, 1.00, 0.11];
      parts.push(segment('pants', [x, 0.29, -0.02], knee, 0.084, 0.105));
      parts.push(segment('pants', knee, hip, 0.107, 0.13));
      parts.push(oval('pants', knee, [0.11, 0.11, 0.11]));
      const shoulder = [side * 0.23, 1.36, -0.18];
      const elbow = [side * 0.35, 1.12, -0.42];
      const hand = [side * 0.42, 0.96, -0.55];
      parts.push(segment('jacket', shoulder, elbow, 0.098, 0.087));
      parts.push(segment('jacket', elbow, hand, 0.087, 0.071));
      parts.push(oval('black', hand, [0.08, 0.08, 0.08]));
      const poleEnd = [side * 0.49, 0.085, 0.2];
      parts.push(segment('pole', hand, poleEnd, 0.012));
      parts.push(part(cylinder(), 'black', poleEnd, [0.07, 0.025, 0.07]));
    }
    parts.push(segment('jacket', [0, 0.99, 0.11], [0, 1.43, -0.21], 0.235, 0.255));
    parts.push(oval('jacket', [0, 1.37, -0.2], [0.245, 0.14, 0.15]));
    parts.push(oval('skin', [0, 1.58, -0.3], [0.137, 0.151, 0.136]));
    parts.push(oval('helmet', [0, 1.67, -0.273], [0.17, 0.142, 0.163]));
    parts.push(cube('black', [0, 1.61, -0.421], [0.225, 0.074, 0.056], [-0.11, 0, 0]));
    parts.push(cube('glass', [0, 1.615, -0.454], [0.183, 0.046, 0.022], [-0.11, 0, 0]));
    const group = staticGroup(parts, 'crouching_skier');
    const groundOffset = new THREE.Box3().setFromObject(group).min.y;
    for (const child of group.children) child.geometry.translate(0, -groundOffset, 0);
    group.userData = { dimensions: dimensions(group), forward: [0, 0, -1] };
    return group;
  }

  const aliases = {
    chalet: 0, alpine: 0, alpinechalet: 0,
    aframe: 1, cabin: 1, aframecabin: 1,
    hut: 2, round: 2, roundhut: 2,
    lodge: 3, tower: 3, talllodge: 3,
    barn: 4, longbarn: 4,
  };
  function house(style = 0) {
    const named = typeof style === 'string' ? aliases[style.toLowerCase().replace(/[ _-]/g, '')] : undefined;
    const numeric = Number.isFinite(Number(style)) ? Math.floor(Number(style)) : 0;
    const id = named === undefined ? ((numeric % 5) + 5) % 5 : named;
    const key = `house-${id}`;
    if (!templates.has(key)) templates.set(key, makeHouse(id));
    return templates.get(key).clone(true);
  }

  function animal(kind = 'squirrel') {
    kind = String(kind).toLowerCase() === 'marmot' ? 'marmot' : 'squirrel';
    const key = `animal-${kind}`;
    if (!templates.has(key)) templates.set(key, makeAnimal(kind));
    const group = templates.get(key).clone(true);
    // These references belong to the clone; rotating x animates a walking gait.
    group.userData.legs = [0, 1, 2, 3].map(i => group.getObjectByName(`leg_${i}`));
    group.userData.tail = group.getObjectByName('tail_root');
    return group;
  }

  function skier() {
    if (!templates.has('skier')) templates.set('skier', makeSkier());
    return templates.get('skier').clone(true);
  }

  return { house, mountain, animal, skier };
}
