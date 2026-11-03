// @ts-nocheck — shader-heavy WebGL module; its public surface is typed in HeroBackground.tsx.
/**
 * 3D hero brain (web only).
 *
 * ~70k points sampled from the outer cortex, cerebellum and brainstem of the
 * HuBMAP Human Reference Atlas brain (Allen atlas; CC BY 4.0, see
 * tools/brain-points). Brightness follows surface curvature, so gyral crowns
 * glow and sulci stay dark; orange veins flicker in the grooves; a fresnel rim
 * defines the silhouette. Behind it, a domain-warped fbm shader draws wispy
 * blue/orange gas that turns into a full multicolour nebula on hover, while
 * sparks stream off the surface. Bloom adds the glow.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export async function startBrain(container, opts = {}) {
  const P = Object.assign({ yaw: 0, hover: 0, still: false, compact: false }, opts);
  const W = () => container.clientWidth, H = () => container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(W(), H());
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.01, 50);
  camera.position.set(0, 0, 3.4);

  // ---------- brain points ----------
  const buf = await (await fetch(P.src || '/brain-points.bin')).arrayBuffer();
  const n = new Uint32Array(buf, 0, 1)[0];
  const pos16 = new Int16Array(buf, 4, n * 3);
  const nrm8 = new Int8Array(buf, 4 + n * 6, n * 3);
  const aux = new Uint8Array(buf, 4 + n * 9, n * 3);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), ao = new Float32Array(n), seed = new Float32Array(n), region = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) { position[i * 3 + c] = pos16[i * 3 + c] / 32767; normal[i * 3 + c] = nrm8[i * 3 + c] / 127; }
    ao[i] = aux[i * 3 + 2] / 255; region[i] = aux[i * 3 + 1]; seed[i] = Math.random(); // ao attr now = ridge (curvature)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('region', new THREE.BufferAttribute(region, 1));

  const uniforms = {
    uTime: { value: 0 }, uHover: { value: 0 }, uPx: { value: renderer.getPixelRatio() },
    uSize: { value: P.compact ? 2.8 : 3.2 }, uGain: { value: 0.42 },
  };
  const brainMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float ao; attribute float seed; attribute float region;
      uniform float uTime, uHover, uPx, uSize, uGain;
      varying vec3 vColor; varying float vAlpha;
      // cheap 3D hash noise for warm vein clusters
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 nv = normalize(normalMatrix * normal);
        float facing = dot(nv, normalize(-mv.xyz));
        if (facing < -0.15) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
        float crown = smoothstep(0.35, 0.95, ao);          // gyri crowns bright, sulci dark
        float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.2); // silhouette glow
        vec3 deep = vec3(0.10, 0.22, 0.75), mid = vec3(0.30, 0.62, 1.0), hot = vec3(0.80, 0.93, 1.0);
        vec3 col = mix(deep, mid, crown);
        col = mix(col, hot, crown * crown * 0.65);
        // orange veins live in the grooves, clustered and flickering
        float vein = smoothstep(0.5, 0.72, vnoise(position * 7.0 + 3.0)) * (1.0 - smoothstep(0.25, 0.7, ao));
        float flick = 0.6 + 0.4 * sin(uTime * (1.5 + seed * 2.5) + seed * 40.0);
        vec3 orange = vec3(1.0, 0.3, 0.05);
        col = mix(col, orange * (0.85 + flick * 0.15), vein);
        float a = (0.06 + 0.94 * pow(crown, 1.4)) * (0.5 + 0.5 * clamp(facing, 0.0, 1.0)) + rim * 0.45 + vein * 1.6;
        if (region > 1.5) a *= 0.75; // brainstem a touch dimmer
        a *= 1.0 + uHover * 0.2;
        vColor = pow(col, vec3(2.2)); vAlpha = a * uGain;
        gl_Position = projectionMatrix * mv;
        float sz = uSize * (0.6 + 0.7 * crown + vein * 1.3) * (1.0 + uHover * 0.15);
        gl_PointSize = sz * uPx * (2.6 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d);
        if (r > 0.25) discard;
        float soft = smoothstep(0.25, 0.0, r);
        gl_FragColor = vec4(vColor * soft * vAlpha, 1.0);
      }`,
  });
  const brain = new THREE.Points(geo, brainMat);
  // Model axes: y up, z front-back. Turn it so we see the left side, front to the left.
  const pivot = new THREE.Group();
  pivot.add(brain);
  brain.rotation.y = -Math.PI / 2; // model front is +z → screen left
  brain.scale.set(1, 0.9, 1.16); // gentle stylisation: longer front-to-back, less domed
  scene.add(pivot);

  // ---------- gas & nebula (full-screen shader behind the brain) ----------
  const gasU = {
    uTime: { value: 0 }, uHover: { value: 0 }, uRes: { value: new THREE.Vector2(W(), H()) },
    uCenter: { value: new THREE.Vector2(0.6, 0.5) }, uRadius: { value: 0.35 }, uBloom: { value: 0 },
  };
  const gasMat = new THREE.ShaderMaterial({
    uniforms: gasU, depthWrite: false, depthTest: false, transparent: true, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv; uniform float uTime, uHover, uRadius, uBloom; uniform vec2 uRes, uCenter;
      // Sine-free hash (Dave Hoskins): stable on all GPUs, no blocky precision artefacts.
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y); }
      // Rotating each octave hides the grid; inputs stay small to keep precision.
      const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=ROT*p*2.02; a*=0.5; } return v; }
      vec3 palette(float k){
        // blue → cyan → magenta → orange → gold, blended smoothly
        vec3 c0=vec3(0.15,0.35,1.0), c1=vec3(0.15,0.85,0.95), c2=vec3(0.85,0.25,0.85), c3=vec3(1.0,0.42,0.12), c4=vec3(1.0,0.8,0.35);
        k = fract(k) * 4.0;
        if (k < 1.0) return mix(c0,c1,k); if (k < 2.0) return mix(c1,c2,k-1.0); if (k < 3.0) return mix(c2,c3,k-2.0); return mix(c3,c4,k-3.0);
      }
      void main(){
        vec2 asp = vec2(uRes.x / uRes.y, 1.0);
        vec2 p = (vUv - uCenter) * asp;
        float d = length(p);
        float t = uTime * 0.02;
        float R = uRadius * (1.0 + uBloom * 1.6);

        // Billowing gas: low-frequency density, gently warped so it drifts and curls like smoke.
        vec2 w = vec2(fbm(p * 1.1 + vec2(t, -t * 0.7)), fbm(p * 1.1 + vec2(4.7 - t * 0.6, 1.3 + t)));
        float dens = fbm(p * 1.6 + w * 0.9 + vec2(-t * 0.5, t * 0.3));
        float billow = smoothstep(0.35, 0.82, dens);
        // finer wisps riding on the clouds, kept faint
        float wisp = smoothstep(0.45, 0.85, fbm(p * 4.2 + w * 1.4 - t)) * 0.45;
        // dark dust lanes break the gas up so it reads as volume, not liquid
        float dust = smoothstep(0.5, 0.75, fbm(p * 2.6 - w + 9.1));
        float gasAmt = (billow * 0.85 + wisp * billow) * (1.0 - dust * 0.55);

        // Ambient gas hugs the brain; orange to the upper right, blue elsewhere.
        float shell = smoothstep(R * 0.55, R * 1.0, d) * (1.0 - smoothstep(R * 1.3, R * 2.5, d));
        vec2 dirv = p / max(d, 1e-4);
        float warm = smoothstep(-0.1, 0.8, dirv.y * 0.6 + dirv.x * 0.8 + (fbm(p * 0.9 + 3.0) - 0.5) * 0.8);
        vec3 col = mix(vec3(0.12, 0.36, 1.0), vec3(1.0, 0.3, 0.06), warm);
        vec3 gas = col * gasAmt * shell * 0.32;

        // Fiery orange smoke: streaky strands that swirl around the brain. Noise is sampled in
        // polar coordinates (stretched along the angle) so it forms long soft wisps, not cells.
        // The angle seam sits on the left, behind the text mask.
        float ang = atan(p.y, p.x);
        vec2 sw = vec2(ang * 2.6 + d * 5.0 + (w.x - 0.5) * 2.4 + t * 0.5, d * 7.0 + (w.y - 0.5) * 4.0 + fbm(p * 3.0 + 2.0) * 1.5 - t * 0.8);
        float strands = fbm(sw);
        float fine = fbm(sw * vec2(1.7, 3.1) + 4.0);
        float wispA = smoothstep(0.48, 0.78, strands) * (0.45 + 0.75 * smoothstep(0.35, 0.8, fine));
        float bright = smoothstep(0.66, 0.86, strands) * smoothstep(0.5, 0.85, fine); // denser glowing cores
        float fireZone = max(warm, smoothstep(0.2, 0.9, -dirv.x * 0.7 - dirv.y * 0.6) * 0.75);
        float fireShell = smoothstep(R * 0.75, R * 1.08, d) * (1.0 - smoothstep(R * 1.2, R * 2.4, d));
        // break the halo into separate plumes so it never reads as a ring
        float plumes = smoothstep(0.42, 0.7, fbm(vec2(ang * 1.1, d * 1.5) + w * 0.8 + 11.0 - t * 0.2));
        fireShell *= plumes;
        float textSafe = smoothstep(0.30, 0.55, vUv.x);
        vec3 fireCol = mix(vec3(1.0, 0.27, 0.03), vec3(1.0, 0.42, 0.08), bright);
        gas += fireCol * (wispA * 0.6 + bright * 0.75) * fireZone * fireShell * textSafe;
        // matching blue smoke on the cool side
        gas += vec3(0.15, 0.42, 1.0) * wispA * 0.45 * (1.0 - fireZone) * fireShell * textSafe;

        // embers: scattered glowing orange specks around the brain
        vec2 ec = floor(vUv * uRes / 3.0);
        float ember = step(0.9955, hash(ec + 17.0)) * fireShell * (0.5 + 0.5 * sin(uTime * (1.0 + hash(ec) * 3.0) + hash(ec) * 40.0));
        gas += vec3(1.0, 0.3, 0.05) * ember * 0.9;

        // Hover: a bright multicolour nebula billows out across the screen.
        float reach = smoothstep(R * 0.35, R * 0.85, d) * (1.0 - smoothstep(R * 1.6, R * 3.6, d));
        float nebAmt = uHover * reach * (billow * 0.9 + wisp) * (1.0 - dust * 0.5);
        vec3 nebCol = palette(fbm(p * 0.7 + w * 0.4 + 7.0) * 1.6 + t * 0.4);
        // hot, near-white cores where the gas is densest
        nebCol = mix(nebCol, vec3(1.0, 0.94, 0.88), smoothstep(0.7, 0.95, dens) * 0.45);
        gas += nebCol * nebAmt * 0.6;

        // faint stars
        vec2 cell = floor(vUv * uRes / 2.0);
        float st = step(0.9975, hash(cell)) * (0.4 + 0.6 * hash(cell + 3.1));
        gas += vec3(0.7, 0.8, 1.0) * st * 0.5;

        vec3 bg = vec3(0.00212, 0.00303, 0.00699); // #070A14 in linear space
        vec3 lin = pow(max(gas, 0.0), vec3(2.0)) * 3.0;
        float peak = max(lin.r, max(lin.g, lin.b));
        if (peak > 0.85) lin *= 0.85 / peak;
        gl_FragColor = vec4(bg + lin, 1.0);
      }`,
  });
  const gasQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gasMat);
  gasQuad.frustumCulled = false;
  gasQuad.renderOrder = -1;
  scene.add(gasQuad);

  // ---------- hover sparks bursting off the surface ----------
  const SP = P.compact ? 900 : 1800;
  const spGeo = new THREE.BufferGeometry();
  const spStart = new Float32Array(SP * 3), spDir = new Float32Array(SP * 3), spSeed = new Float32Array(SP);
  for (let i = 0; i < SP; i++) {
    const k = Math.floor(Math.random() * n);
    for (let c = 0; c < 3; c++) { spStart[i * 3 + c] = position[k * 3 + c]; spDir[i * 3 + c] = normal[k * 3 + c] + (Math.random() - 0.5) * 0.6; }
    spSeed[i] = Math.random();
  }
  spGeo.setAttribute('position', new THREE.BufferAttribute(spStart, 3));
  spGeo.setAttribute('dir', new THREE.BufferAttribute(spDir, 3));
  spGeo.setAttribute('seed', new THREE.BufferAttribute(spSeed, 1));
  const spMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uHover: uniforms.uHover, uPx: uniforms.uPx, uAge: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 dir; attribute float seed; uniform float uTime, uHover, uPx, uAge; varying vec3 vC; varying float vA;
      vec3 rainbow(float t){ return 0.5 + 0.5*cos(6.2831*(t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        float life = fract(uAge * 0.25 + seed);           // continuous stream while hovering
        vec3 p = position + normalize(dir) * life * (0.25 + seed * 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = uHover * (1.0 - life) * smoothstep(0.0, 0.08, life);
        vC = pow(mix(rainbow(seed + uTime * 0.05), vec3(1.0, 0.55, 0.2), 0.25), vec3(2.2));
        gl_PointSize = (3.0 + seed * 5.0) * uPx * (2.6 / -mv.z);
      }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d); if(r>0.25) discard; gl_FragColor=vec4(vC*smoothstep(0.25,0.0,r)*vA,1.0); }',
  });
  const sparks = new THREE.Points(spGeo, spMat);
  brain.add(sparks);

  // ---------- post: bloom ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.55, 0.32, 0.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- layout ----------
  let hitT = { x: 0.6, y: 0.5, rx: 0.2, ry: 0.3 };
  const layout = () => {
    const w = W(), h = H();
    renderer.setSize(w, h); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    gasU.uRes.value.set(w, h);
    // place the brain: right-of-centre on desktop, centred-low on phones
    const target = P.compact ? new THREE.Vector2(0.56, 0.42) : new THREE.Vector2(0.64, 0.5);
    gasU.uCenter.value.copy(target);
    const ndc = new THREE.Vector3(target.x * 2 - 1, target.y * 2 - 1, 0.5).unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const dist = camera.position.z / -dir.z;
    pivot.position.copy(camera.position).add(dir.multiplyScalar(dist));
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const want = P.compact ? Math.min(0.62 * (w / h) * vh, 0.5 * vh) : Math.min(0.42 * (w / h) * vh, 0.78 * vh);
    pivot.scale.setScalar(want / 2.0);
    gasU.uRadius.value = (want / vh) * 0.5;
    hitT = { x: target.x, y: target.y, rx: (want / vh) * 0.62 * (h / w), ry: (want / vh) * 0.42 };
  };
  layout();

  let hover = 0, hoverAge = 0, last = performance.now(), t = P.still ? 6 : 0, raf = 0, running = false;
  let hoverTarget = false;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += dt;
    hover += ((hoverTarget ? 1 : 0) - hover) * (1 - Math.exp(-dt / (hoverTarget ? 0.6 : 1.6)));
    hoverAge = hoverTarget ? hoverAge + dt : Math.max(0, hoverAge - dt * 2);
  };
  const render = () => {
    uniforms.uTime.value = t; uniforms.uHover.value = hover; spMat.uniforms.uAge.value = t;
    gasU.uTime.value = t; gasU.uHover.value = hover; gasU.uBloom.value = hover * Math.min(1, hoverAge / 2.5);
    pivot.rotation.y = Math.sin(t * 0.25) * 0.28 + (P.mouseX || 0) * 0.25;
    pivot.rotation.x = Math.sin(t * 0.18) * 0.05 + (P.mouseY || 0) * 0.08;
    bloom.strength = 0.55 + hover * 0.15;
    composer.render();
  };
  const frame = (now) => {
    if (!running) return;
    step(now); render();
    raf = requestAnimationFrame(frame);
  };
  const api = {
    /** Pointer position in the container, 0..1; returns true when over the brain. */
    pointer(x, y) {
      P.mouseX = x - 0.5; P.mouseY = y - 0.5;
      const dx = (x - hitT.x) / hitT.rx, dy = ((1 - y) - hitT.y) / hitT.ry;
      return dx * dx + dy * dy < 1;
    },
    setHover(v) { if (v && !hoverTarget) hoverAge = 0; hoverTarget = v; },
    start() { if (running || P.still) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize() { layout(); if (P.still || !running) render(); },
    dispose() {
      api.stop();
      geo.dispose(); spGeo.dispose(); brainMat.dispose(); spMat.dispose(); gasMat.dispose(); gasQuad.geometry.dispose();
      composer.dispose?.(); renderer.dispose();
      renderer.domElement.remove();
    },
  };
  render();
  if (!P.still) api.start();
  return api;
}
