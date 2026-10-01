/**
 * Curled animal wheels. The roll origin is the axle: local X.
 * The wheel lies in the YZ plane, with a 1.05m nominal collision radius.
 * character({species, variant: 0..4, furColor, color}) -> {roll, tintMaterials, species, variant}.
 * Fur materials are unique per returned character. Immutable geometry and other
 * materials are cached by this factory; dispose shared assets only at scene end.
 */
export function createCharacterAssets(THREE) {
  const geometryCache = new Map(), materialCache = new Map(), templates = new Map();
  const cached = (key, make) => {
    if (!geometryCache.has(key)) geometryCache.set(key, make());
    return geometryCache.get(key);
  };
  const ball = () => cached('ball', () => new THREE.SphereGeometry(1, 9, 6));
  const cube = () => cached('cube', () => new THREE.BoxGeometry(1, 1, 1));
  const cone = () => cached('cone', () => new THREE.ConeGeometry(1, 1, 7));
  const torus = (radius, tube, key = 'body') => cached(`${key}_${radius}_${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 20));
  const cylinder = ratio => cached(`cylinder_${ratio}`, () => new THREE.CylinderGeometry(ratio, 1, 1, 7));
  function tone(role, color, tint = false) {
    const hex = new THREE.Color(color).getHex(), key = `${role}_${hex}_${tint}`;
    if (!materialCache.has(key)) {
      const material = new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.9 });
      material.name = role;
      material.userData.characterTint = tint;
      material.userData.isHorn = role === 'horn' || role === 'antler';
      materialCache.set(key, material);
    }
    return materialCache.get(key);
  }
  const black = tone('black', 0x252925), hoof = tone('hoof', 0x4b4034), shine = tone('eye_glint', 0xffffff);
  const part = (geometry, material, position, scale, rotation = [0, 0, 0]) => ({ geometry, material, position, scale, rotation });
  const oval = (material, position, scale, rotation) => part(ball(), material, position, scale, rotation);
  const box = (material, position, scale, rotation) => part(cube(), material, position, scale, rotation);
  const pointed = (material, position, scale, rotation) => part(cone(), material, position, scale, rotation);
  function segment(material, a, b, radius, endRadius = radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const ratio = Math.round(endRadius / radius * 100) / 100;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    return part(cylinder(ratio), material, start.add(end).multiplyScalar(0.5).toArray(), [radius, direction.length(), radius], [e.x, e.y, e.z]);
  }
  function chain(parts, material, points, radius) {
    for (let i = 1; i < points.length; i++) {
      const a = radius * (1 - (i - 1) / points.length * 0.6), b = radius * (1 - i / points.length * 0.6);
      parts.push(segment(material, points[i - 1], points[i], a, b));
    }
  }
  function merge(parts) {
    const positions = [], normals = [], p = new THREE.Vector3(), n = new THREE.Vector3();
    const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), q = new THREE.Quaternion();
    for (const item of parts) {
      q.setFromEuler(new THREE.Euler(...item.rotation));
      matrix.compose(new THREE.Vector3(...item.position), q, new THREE.Vector3(...item.scale));
      normalMatrix.getNormalMatrix(matrix);
      const pos = item.geometry.getAttribute('position'), nor = item.geometry.getAttribute('normal'), index = item.geometry.index;
      for (let j = 0, count = index ? index.count : pos.count; j < count; j++) {
        const i = index ? index.getX(j) : j;
        p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
        positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
  function staticGroup(parts, name) {
    const grouped = new Map(), group = new THREE.Group(); group.name = name;
    for (const p of parts) { if (!grouped.has(p.material)) grouped.set(p.material, []); grouped.get(p.material).push(p); }
    for (const [material, items] of grouped) {
      const mesh = new THREE.Mesh(merge(items), material);
      mesh.name = `${name}_${material.name}_${group.children.length}`;
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    return group;
  }
  const coats = {
    goat: [
      {fur: 0xf1e9d4, face: 0xe7d7b4, patch: 0xcfbc95, horn: 0xb8a27a},
      {fur: 0x755340, face: 0xb59975, patch: 0xe5d5b7, horn: 0xbdb399},
      {fur: 0xa1a8a5, face: 0xe2d9c7, patch: 0x5c635d, horn: 0x9d8d74},
      {fur: 0xc37c43, face: 0xf2c998, patch: 0x784b31, horn: 0xc7b599},
      {fur: 0xf7f2df, face: 0xd9c6a1, patch: 0x464c48, horn: 0xa6977f},
    ],
    cow: [
      {fur: 0xf5f1df, face: 0xdba9a1, patch: 0x292e2b, horn: 0xd0bf9a},
      {fur: 0x353b36, face: 0xd6a1a0, patch: 0xf0ebd7, horn: 0xd9c9ab},
      {fur: 0xdecfa8, face: 0xbe8981, patch: 0x3b332b, horn: 0xa88e6c},
      {fur: 0xc4c8bf, face: 0xe2aba1, patch: 0x303732, horn: 0xe5d5b4},
      {fur: 0xf5ead2, face: 0xc49486, patch: 0x625043, horn: 0xbbaa8d},
    ],
    deer: [
      {fur: 0xc89554, face: 0xe9c895, patch: 0xf9e8c8, horn: 0xb59a70},
      {fur: 0x8b6548, face: 0xd3b98e, patch: 0xcfb58c, horn: 0xc7b389},
      {fur: 0xb86b3f, face: 0xeac39a, patch: 0xf0d0a6, horn: 0x9a805b},
      {fur: 0xd7ad66, face: 0xf1d7aa, patch: 0xffefd0, horn: 0xb5a181},
      {fur: 0x92988e, face: 0xd7d7c7, patch: 0xc9cbb9, horn: 0x8d826b},
    ],
    moose: [
      {fur: 0x795b42, face: 0x9c7957, patch: 0x57432f, horn: 0xb8a174},
      {fur: 0x514e42, face: 0x897e62, patch: 0xa19678, horn: 0xc8b58b},
      {fur: 0x9b6b43, face: 0xc69664, patch: 0x694a31, horn: 0xaa9168},
      {fur: 0x6b756b, face: 0x9ca391, patch: 0x414b41, horn: 0xcec2a1},
      {fur: 0xb1a285, face: 0xd0bd96, patch: 0x786a51, horn: 0x96876b},
    ],
  };

  function patch(parts, material, angle, side, radial = 0.70, length = 0.27, thickness = 0.16) {
    parts.push(oval(material, [side * 0.307, Math.cos(angle) * radial, Math.sin(angle) * radial], [0.037, thickness, length], [angle, 0, 0]));
  }
  function foldedLegs(parts, fur, species) {
    const slim = species === 'deer' ? 0.085 : species === 'moose' ? 0.115 : 0.105;
    for (const side of [-1, 1]) {
      const x = side * 0.265;
      chain(parts, fur, [[x, 0.15, -0.53], [x, -0.17, -0.36], [x, -0.19, -0.035]], slim);
      parts.push(box(hoof, [x, -0.19, 0.015], [slim * 1.9, 0.145, 0.17], [0.10, 0, 0]));
      chain(parts, fur, [[x, -0.18, 0.54], [x, -0.35, 0.28], [x, -0.06, 0.12]], slim);
      parts.push(box(hoof, [x, -0.035, 0.055], [slim * 1.9, 0.15, 0.17], [-0.24, 0, 0]));
    }
  }
  function face(parts, species, fur, muzzle, patchMaterial, variant) {
    const moose = species === 'moose', cow = species === 'cow', deer = species === 'deer';
    const headWidth = moose ? 0.39 : cow ? 0.37 : deer ? 0.29 : 0.34;
    parts.push(oval(fur, [0, 0.42, -0.54], [headWidth, 0.35, 0.28]));
    const muzzleSize = moose ? [0.42, 0.22, 0.24] : cow ? [0.35, 0.185, 0.18] : deer ? [0.21, 0.155, 0.19] : [0.265, 0.175, 0.20];
    parts.push(oval(muzzle, [0, moose ? 0.23 : 0.22, moose ? -0.75 : -0.81], muzzleSize));
    const eyeX = headWidth * 0.83;
    for (const side of [-1, 1]) {
      parts.push(oval(black, [side * eyeX, 0.50, -0.703], [0.070, 0.072, 0.050]));
      parts.push(oval(shine, [side * (eyeX + 0.020), 0.524, -0.738], [0.021, 0.026, 0.017]));
      if (deer) {
        parts.push(oval(fur, [side * 0.39, 0.64, -0.43], [0.15, 0.215, 0.10], [0.08, 0, -side * (0.4 + variant * 0.035)]));
        parts.push(oval(patchMaterial, [side * 0.411, 0.66, -0.521], [0.083, 0.15, 0.027], [0.08, 0, -side * 0.4]));
      } else {
        parts.push(oval(fur, [side * (moose ? 0.47 : 0.43), 0.54, -0.49], [moose ? 0.21 : 0.19, moose ? 0.135 : 0.105, 0.135], [0, 0.12 * side, side * 0.12]));
        parts.push(oval(muzzle, [side * (moose ? 0.47 : 0.43), 0.55, -0.607], [0.12, 0.060, 0.022], [0, 0.12 * side, side * 0.12]));
      }
    }
    if (cow || moose) {
      for (const side of [-1, 1]) parts.push(oval(black, [side * (moose ? 0.19 : 0.145), 0.262, -0.971], [moose ? 0.075 : 0.056, 0.044, 0.030]));
      parts.push(box(black, [0, 0.135, -0.968], [moose ? 0.47 : 0.36, 0.032, 0.024]));
    } else {
      parts.push(oval(black, [0, 0.22, -0.987], [deer ? 0.10 : 0.14, 0.084, 0.033]));
      parts.push(box(black, [0, 0.12, -0.945], [0.19, 0.025, 0.023]));
    }
    if (species === 'goat') {
      parts.push(pointed(variant % 2 ? patchMaterial : fur, [0, -0.06, -0.78], [0.11 + variant * 0.008, 0.34, 0.13], [0.16, 0, Math.PI]));
    }
    if (moose) parts.push(oval(patchMaterial, [0, -0.07, -0.70], [0.12, 0.25, 0.11], [-0.18, 0, 0]));
  }

  function goatHorns(parts, material, variant) {
    for (const side of [-1, 1]) {
      const short = variant === 1 ? 0.77 : variant === 2 ? 1.12 : 1;
      const baseY = 0.72, baseZ = -0.42;
      let path;
      if (variant >= 3) {
        path = [[side * 0.23, baseY, baseZ], [side * 0.47, 0.95, -0.32], [side * 0.62, 1.01, -0.04], [side * 0.66, 0.83, 0.20], [side * 0.54, 0.66, 0.17], [side * 0.43, 0.65, -0.03]];
      } else {
        path = [[side * 0.22, baseY, baseZ], [side * 0.25, baseY + 0.29 * short, -0.34], [side * 0.29, baseY + 0.46 * short, -0.06], [side * 0.32, baseY + 0.42 * short, 0.20], [side * 0.33, baseY + 0.20 * short, 0.35]];
      }
      if (variant === 4) path = path.map(([x, y, z]) => [x * 1.08, 0.69 + (y - 0.69) * 0.91, z * 0.88]);
      chain(parts, material, path, variant >= 3 ? 0.115 : 0.080);
    }
  }
  function cowHorns(parts, material, variant) {
    for (const side of [-1, 1]) {
      const wide = 0.82 + variant * 0.075, rise = variant === 3 ? 0.23 : 0.15 + variant * 0.012;
      chain(parts, material, [[side * 0.27, 0.71, -0.40], [side * 0.45 * wide, 0.78 + rise * 0.45, -0.33], [side * 0.55 * wide, 0.79 + rise, -0.22]], 0.065);
    }
  }
  function deerAntlers(parts, material, variant) {
    for (const side of [-1, 1]) {
      const rise = 0.88 + variant * 0.065, wide = 0.88 + ((variant + 2) % 3) * 0.09;
      const points = [[side * 0.22, 0.70, -0.43], [side * 0.29 * wide, 0.92, -0.32], [side * 0.42 * wide, 0.74 + 0.41 * rise, -0.14], [side * 0.57 * wide, 0.76 + 0.57 * rise, 0.09]];
      chain(parts, material, points, 0.052 + variant * 0.003);
      chain(parts, material, [points[1], [side * 0.32 * wide, 0.72 + 0.53 * rise, -0.57]], 0.040);
      chain(parts, material, [points[2], [side * 0.51 * wide, 0.75 + 0.62 * rise, -0.34]], 0.037);
      if (variant !== 0) chain(parts, material, [points[3], [side * 0.69 * wide, 0.80 + 0.65 * rise, 0.24]], 0.029);
      if (variant >= 2) chain(parts, material, [points[2], [side * 0.63 * wide, 0.87 + 0.39 * rise, -0.05]], 0.032);
    }
  }
  function palmGeometry(side, variant) {
    return cached(`palm_${side}_${variant}`, () => {
      const outline = [[-0.09, 0], [0.14, -0.025], [0.37, 0.035], [0.57, 0.18], [0.43, 0.17], [0.61, 0.34], [0.44, 0.28], [0.45, 0.51], [0.32, 0.40], [0.27, 0.61], [0.17, 0.43], [0.11, 0.55], [0.06, 0.32], [-0.055, 0.40], [-0.10, 0.17]];
      const width = 0.91 + variant * 0.06, rise = 0.78 + ((variant + 1) % 3) * 0.11;
      const shape = new THREE.Shape();
      outline.forEach(([x, y], i) => { const px = side * x * width, py = y * rise; if (i) shape.lineTo(px, py); else shape.moveTo(px, py); });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: false, curveSegments: 1 });
      geometry.translate(0, 0, -0.0425); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      return geometry;
    });
  }
  function mooseAntlers(parts, material, variant) {
    for (const side of [-1, 1]) {
      chain(parts, material, [[side * 0.26, 0.72, -0.40], [side * 0.40, 0.89, -0.24], [side * 0.51, 0.98, -0.13]], 0.088);
      parts.push(part(palmGeometry(side, variant), material, [side * 0.48, 0.94 + (variant % 2) * 0.06, -0.10], [1, 1, 1], [0.13, side * 0.12, side * 0.08]));
    }
  }

  function makeCharacter(species, variant, color, furColor) {
    const cfg = coats[species][variant], p = [];
    const fur = tone('fur', furColor ?? cfg.fur, true), faceFur = tone('muzzle', cfg.face, true), patches = tone('coat_pattern', cfg.patch, true);
    const horns = tone(species === 'deer' || species === 'moose' ? 'antler' : 'horn', cfg.horn);
    const bodyRadius = species === 'deer' ? 0.74 : species === 'moose' ? 0.68 : 0.70;
    const bodyTube = species === 'deer' ? 0.275 : species === 'moose' ? 0.325 : 0.305;
    p.push(part(torus(bodyRadius, bodyTube), fur, [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]));
    if (species === 'goat') {
      for (let i = 0; i < 11; i++) {
        const angle = i / 11 * Math.PI * 2;
        const fluffy = variant === 2 ? 0.34 : variant === 3 ? 0.32 : 0.305;
        p.push(oval(fur, [0, Math.cos(angle) * 0.68, Math.sin(angle) * 0.68], [0.36, fluffy, fluffy], [angle, 0, 0]));
      }
      for (const side of [-1, 1]) {
        if (variant === 1) { patch(p, patches, 0.18, side, 0.7, 0.31, 0.2); patch(p, patches, 2.65, side, 0.7, 0.20, 0.15); }
        if (variant >= 2) for (const a of [0.12 + variant * 0.12, 2.10, 3.50]) patch(p, patches, a, side, 0.70, 0.22 + variant * 0.015, 0.15);
      }
      goatHorns(p, horns, variant);
    } else if (species === 'cow') {
      for (const side of [-1, 1]) for (let i = 0; i < 3 + variant % 3; i++) {
        const a = i * 1.65 + 0.35 + variant * 0.38;
        patch(p, patches, a, side, 0.70, 0.25 + (i % 2) * 0.07, 0.18);
        if (i % 2 === 0) patch(p, patches, a + 0.26, side, 0.72, 0.11, 0.13);
      }
      p.push(oval(patches, [0, 0.63, -0.52], [0.21, 0.16, 0.20]));
      for (const side of [-1, 1]) {
        patch(p, tone('cow_black_spot', 0x2b302a, true), 3.0 + variant * 0.22, side, 0.71, 0.16, 0.12);
        if (variant >= 2) patch(p, tone('cow_white_spot', 0xf7f2df, true), 1.1 + variant * 0.27, side, 0.71, 0.20, 0.13);
      }
      cowHorns(p, horns, variant);
      chain(p, patches, [[0.34, 0.31, 0.66], [0.38, 0.10, 0.90], [0.39, -0.28, 0.77], [0.35, -0.42, 0.54]], 0.043);
      p.push(oval(patches, [0.35, -0.43, 0.51], [0.09, 0.16, 0.10]));
    } else if (species === 'deer') {
      for (const side of [-1, 1]) {
        patch(p, faceFur, 3.0, side, 0.73, 0.36, 0.17);
        if (variant === 0 || variant === 3) for (let i = 0; i < 7; i++) {
          const a = 0.15 + i * 0.65, radial = i % 2 ? 0.78 : 0.65;
          patch(p, patches, a, side, radial, 0.053 + (i % 3) * 0.006, 0.044);
        }
        if (variant === 2 || variant === 4) patch(p, patches, 0.2 + variant * 0.10, side, 0.73, 0.23, 0.16);
      }
      deerAntlers(p, horns, variant);
      p.push(oval(patches, [0, 0.15, 0.83], [0.11, 0.16, 0.11], [-0.2, 0, 0]));
    } else {
      for (const side of [-1, 1]) {
        patch(p, patches, 0.3 + variant * 0.25, side, 0.68, 0.32, 0.22);
        if (variant % 2) patch(p, faceFur, 2.75, side, 0.68, 0.26, 0.16);
      }
      mooseAntlers(p, horns, variant);
      p.push(oval(patches, [0, 0.13, 0.83], [0.12, 0.12, 0.11]));
    }
    foldedLegs(p, species === 'deer' ? faceFur : fur, species);
    face(p, species, fur, faceFur, patches, variant);
    if (species === 'goat') p.push(oval(fur, [0, 0.24, 0.79], [0.13, 0.14, 0.12], [0.35, 0, 0]));
    const scarf = tone('scarf', color);
    p.push(part(torus(0.275, 0.056, 'collar'), scarf, [0, 0.285, -0.56], [1, 0.86, 1]));
    p.push(box(scarf, [0.33, 0.07, -0.48], [0.095, 0.30, 0.145], [0.08, 0, -0.12]));
    const roll = staticGroup(p, `wheel_${species}_${variant}`);
    roll.userData = { species, variant, axle: [1, 0, 0], collisionRadius: 1.05, wheelPlane: 'YZ', facing: [0, 0, -1] };
    return roll;
  }

  return {
    character(def = {}) {
      const requested = String(def.species || def.kind || def.type || 'goat').toLowerCase();
      const aliases = { goats: 'goat', cows: 'cow', elk: 'moose', stags: 'deer' };
      const species = coats[requested] ? requested : aliases[requested] || 'goat';
      const numeric = Number(def.variant ?? def.style ?? 0);
      const variant = Number.isFinite(numeric) ? ((Math.floor(numeric) % 5) + 5) % 5 : 0;
      const color = new THREE.Color(def.color ?? 0xd6fc64).getHex();
      const furColor = def.furColor == null ? undefined : new THREE.Color(def.furColor).getHex();
      const key = `${species}_${variant}_${color}_${furColor ?? 'default'}`;
      if (!templates.has(key)) templates.set(key, makeCharacter(species, variant, color, furColor));
      const roll = templates.get(key).clone(true), copies = new Map(), tintMaterials = [];
      roll.traverse(mesh => {
        if (!mesh.isMesh || !mesh.material.userData.characterTint) return;
        const original = mesh.material;
        if (!copies.has(original)) {
          const material = original.clone();
          copies.set(original, material);
          tintMaterials.push({ material, base: material.color.clone() });
        }
        mesh.material = copies.get(original);
      });
      roll.userData.tintMaterials = tintMaterials;
      return { roll, tintMaterials, species, variant };
    },
  };
}
