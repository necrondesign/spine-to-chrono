#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node spine-to-chrono.js <spine-animation.json> [output.json]");
  process.exit(1);
}

const outputFile = process.argv[3] || inputFile.replace(/\.json$/, "-chrono.json");
const spine = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

function buildBoneTree(bones) {
  const map = {};
  for (const b of bones) {
    map[b.name] = {
      parent: b.parent || null,
      x: b.x || 0,
      y: b.y || 0,
      rotation: b.rotation || 0,
      scaleX: b.scaleX ?? 1,
      scaleY: b.scaleY ?? 1,
    };
  }
  return map;
}

function slotInitialAlpha(slots) {
  const map = {};
  for (const s of slots) {
    const color = s.color || "ffffffff";
    map[s.name] = {
      bone: s.bone,
      attachment: s.attachment,
      alpha: parseInt(color.slice(6, 8), 16) / 255,
    };
  }
  return map;
}

function spineColorToRGBA(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = parseInt(hex.slice(6, 8), 16);
  return { r, g, b, alpha: +(a / 255).toFixed(4) };
}

function convertCurve(curve, t0, t1, v0, v1) {
  if (!curve) return { easing: "linear" };
  if (curve === "stepped") return { easing: "stepped" };

  if (Array.isArray(curve) && curve.length >= 4) {
    const dt = t1 - t0;
    const dv = v1 - v0;

    if (dt === 0) return { easing: "linear" };

    const x1 = +((curve[0] - t0) / dt).toFixed(4);
    const y1 = dv !== 0 ? +((curve[1] - v0) / dv).toFixed(4) : 0;
    const x2 = +((curve[2] - t0) / dt).toFixed(4);
    const y2 = dv !== 0 ? +((curve[3] - v0) / dv).toFixed(4) : 0;

    x1c = Math.max(0, Math.min(1, x1));
    x2c = Math.max(0, Math.min(1, x2));

    return {
      easing: "cubic-bezier",
      cubicBezier: [+x1c.toFixed(4), +y1.toFixed(4), +x2c.toFixed(4), +y2.toFixed(4)],
      cssEasing: `cubic-bezier(${x1c.toFixed(3)}, ${y1.toFixed(3)}, ${x2c.toFixed(3)}, ${y2.toFixed(3)})`,
    };
  }

  return { easing: "linear" };
}

function processTranslateKeyframes(keyframes) {
  const xTrack = [];
  const yTrack = [];

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const t = kf.time || 0;
    const x = kf.x || 0;
    const y = kf.y || 0;
    const next = keyframes[i + 1];

    const xEntry = { time: +t.toFixed(4), timeMs: Math.round(t * 1000), value: +x.toFixed(2) };
    const yEntry = { time: +t.toFixed(4), timeMs: Math.round(t * 1000), value: +y.toFixed(2) };

    if (next) {
      const nt = next.time || 0;
      const nx = next.x || 0;
      const ny = next.y || 0;

      if (kf.curve && Array.isArray(kf.curve) && kf.curve.length >= 8) {
        xEntry.easing = convertCurve(kf.curve.slice(0, 4), t, nt, x, nx);
        yEntry.easing = convertCurve(kf.curve.slice(4, 8), t, nt, y, ny);
      } else {
        const e = convertCurve(kf.curve, t, nt, x, nx);
        xEntry.easing = e;
        yEntry.easing = e;
      }
    }

    xTrack.push(xEntry);
    yTrack.push(yEntry);
  }

  return { translateX: xTrack, translateY: yTrack };
}

function processScaleKeyframes(keyframes) {
  const xTrack = [];
  const yTrack = [];

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const t = kf.time || 0;
    const sx = kf.x ?? 1;
    const sy = kf.y ?? 1;
    const next = keyframes[i + 1];

    const xEntry = { time: +t.toFixed(4), timeMs: Math.round(t * 1000), value: +sx.toFixed(4) };
    const yEntry = { time: +t.toFixed(4), timeMs: Math.round(t * 1000), value: +sy.toFixed(4) };

    if (next) {
      const nt = next.time || 0;
      const nsx = next.x ?? 1;
      const nsy = next.y ?? 1;

      if (kf.curve && Array.isArray(kf.curve) && kf.curve.length >= 8) {
        xEntry.easing = convertCurve(kf.curve.slice(0, 4), t, nt, sx, nsx);
        yEntry.easing = convertCurve(kf.curve.slice(4, 8), t, nt, sy, nsy);
      } else {
        const e = convertCurve(kf.curve, t, nt, sx, nsx);
        xEntry.easing = e;
        yEntry.easing = e;
      }
    }

    xTrack.push(xEntry);
    yTrack.push(yEntry);
  }

  return { scaleX: xTrack, scaleY: yTrack };
}

function processRGBAKeyframes(keyframes) {
  const alphaTrack = [];
  const colorTrack = [];

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const t = kf.time || 0;
    const rgba = spineColorToRGBA(kf.color);
    const next = keyframes[i + 1];

    const alphaEntry = {
      time: +t.toFixed(4),
      timeMs: Math.round(t * 1000),
      value: rgba.alpha,
    };

    const colorEntry = {
      time: +t.toFixed(4),
      timeMs: Math.round(t * 1000),
      r: rgba.r,
      g: rgba.g,
      b: rgba.b,
    };

    if (next) {
      const nt = next.time || 0;
      const nrgba = spineColorToRGBA(next.color);

      if (kf.curve && Array.isArray(kf.curve) && kf.curve.length >= 16) {
        alphaEntry.easing = convertCurve(kf.curve.slice(12, 16), t, nt, rgba.alpha, nrgba.alpha);
      } else if (kf.curve && Array.isArray(kf.curve) && kf.curve.length >= 4) {
        alphaEntry.easing = convertCurve(kf.curve.slice(0, 4), t, nt, rgba.alpha, nrgba.alpha);
      } else {
        alphaEntry.easing = convertCurve(kf.curve, t, nt, rgba.alpha, nrgba.alpha);
      }
      colorEntry.easing = alphaEntry.easing;
    }

    alphaTrack.push(alphaEntry);
    if (rgba.r !== 255 || rgba.g !== 255 || rgba.b !== 255) {
      colorTrack.push(colorEntry);
    }
  }

  const result = { opacity: alphaTrack };
  if (colorTrack.length > 0) result.color = colorTrack;
  return result;
}

function getAnimationDuration(anim) {
  let max = 0;
  const findMax = (obj) => {
    if (Array.isArray(obj)) {
      for (const kf of obj) {
        if (kf.time > max) max = kf.time;
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const v of Object.values(obj)) findMax(v);
    }
  };
  findMax(anim);
  return max;
}

const boneTree = buildBoneTree(spine.bones);
const slotInfo = slotInitialAlpha(spine.slots);

const output = {
  meta: {
    source: path.basename(inputFile),
    spineVersion: spine.skeleton.spine,
    canvasSize: { width: spine.skeleton.width, height: spine.skeleton.height },
    generatedAt: new Date().toISOString(),
  },
  elements: {},
  animations: {},
};

for (const s of spine.slots) {
  const bone = boneTree[s.bone];
  const color = s.color || "ffffffff";
  output.elements[s.name] = {
    bone: s.bone,
    attachment: s.attachment,
    initialAlpha: parseInt(color.slice(6, 8), 16) / 255,
    bonePosition: bone ? { x: bone.x, y: bone.y } : undefined,
  };
}

for (const [animName, anim] of Object.entries(spine.animations)) {
  const duration = getAnimationDuration(anim);
  const animOutput = {
    name: animName,
    duration: +duration.toFixed(4),
    durationMs: Math.round(duration * 1000),
    tracks: {},
  };

  if (anim.bones) {
    for (const [boneName, props] of Object.entries(anim.bones)) {
      if (!animOutput.tracks[boneName]) animOutput.tracks[boneName] = { type: "bone" };

      if (props.translate) {
        const { translateX, translateY } = processTranslateKeyframes(props.translate);
        animOutput.tracks[boneName].translateX = translateX;
        animOutput.tracks[boneName].translateY = translateY;
      }

      if (props.scale) {
        const { scaleX, scaleY } = processScaleKeyframes(props.scale);
        animOutput.tracks[boneName].scaleX = scaleX;
        animOutput.tracks[boneName].scaleY = scaleY;
      }

      if (props.rotate) {
        const rotTrack = [];
        for (let i = 0; i < props.rotate.length; i++) {
          const kf = props.rotate[i];
          const t = kf.time || 0;
          const v = kf.value || kf.angle || 0;
          const entry = { time: +t.toFixed(4), timeMs: Math.round(t * 1000), value: +v.toFixed(2) };
          const next = props.rotate[i + 1];
          if (next) {
            const nt = next.time || 0;
            const nv = next.value || next.angle || 0;
            entry.easing = convertCurve(kf.curve, t, nt, v, nv);
          }
          rotTrack.push(entry);
        }
        animOutput.tracks[boneName].rotation = rotTrack;
      }
    }
  }

  if (anim.slots) {
    for (const [slotName, props] of Object.entries(anim.slots)) {
      if (!animOutput.tracks[slotName]) animOutput.tracks[slotName] = { type: "slot" };

      if (props.rgba) {
        const { opacity, color } = processRGBAKeyframes(props.rgba);
        animOutput.tracks[slotName].opacity = opacity;
        if (color) animOutput.tracks[slotName].color = color;
      }

      if (props.attachment) {
        animOutput.tracks[slotName].attachment = props.attachment.map((kf) => ({
          time: +(kf.time || 0).toFixed(4),
          timeMs: Math.round((kf.time || 0) * 1000),
          name: kf.name,
        }));
      }
    }
  }

  output.animations[animName] = animOutput;
}

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
console.log(`Chrono file written: ${outputFile}`);
console.log(`Animations: ${Object.keys(output.animations).join(", ")}`);
for (const [name, anim] of Object.entries(output.animations)) {
  console.log(`  "${name}": ${anim.durationMs}ms, ${Object.keys(anim.tracks).length} tracks`);
}
