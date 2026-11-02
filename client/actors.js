// 人物（インスタンス描画）・命の粒・粒子エフェクト
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as W from '../shared/world.js';

export const MAX_ACTORS = 240;
const o = new THREE.Object3D();
const col = new THREE.Color(), col2 = new THREE.Color();

function robeGeo() {
  const pts = [[.52, 0], [.46, .3], [.36, .75], [.28, 1.1], [.2, 1.22], [.02, 1.26]].map(([x, y]) => new THREE.Vector2(x, y));
  const robe = new THREE.LatheGeometry(pts, 10);
  const hood = new THREE.SphereGeometry(.31, 10, 8);
  hood.scale(1, 1.06, 1.02); hood.translate(0, 1.42, -.03);
  const pack = new THREE.BoxGeometry(.38, .5, .16); pack.translate(0, .86, -.3);
  return mergeGeometries([robe.toNonIndexed(), hood.toNonIndexed(), pack.toNonIndexed()]);
}
function hourglassGeo() {
  const pts = [[.001, -.27], [.17, -.27], [.17, -.24], [.13, -.2], [.12, -.09], [.025, 0], [.12, .09], [.13, .2], [.17, .24], [.17, .27], [.001, .27]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 8);
}

const UP = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
export function tiltToGround(e, env, target = o) {
  const r = Math.hypot(e.x, e.z);
  if (r < .01) { target.quaternion.identity(); return; }
  const g0 = e.y >= 0 ? W.sandTop(r, env.L) : W.sandBot(r, env.P);
  const g1 = e.y >= 0 ? W.sandTop(r + .6, env.L) : W.sandBot(r + .6, env.P);
  const s = (g1 - g0) / .6;
  nrm.set(-s * e.x / r, 1, -s * e.z / r).normalize();
  target.quaternion.setFromUnitVectors(UP, nrm);
}

export class Actors {
  constructor(group, glowTex) {
    const N = MAX_ACTORS;
    this.N = N;
    const mk = (geo, mat, count = N) => { const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); return m; };
    this.robe = mk(robeGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.robe.setColorAt(0, col.set(0xffffff));
    const face = new THREE.SphereGeometry(.22, 8, 6); face.translate(0, 1.4, .13);
    this.face = mk(face, new THREE.MeshLambertMaterial({ color: 0xf1d9bc }));
    this.legs = mk(new THREE.BoxGeometry(.15, .5, .2).translate(0, -.25, .02), new THREE.MeshLambertMaterial({ color: 0x2c2118 }), N * 2);
    this.icon = mk(hourglassGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x7a4a12 }));
    this.icon.setColorAt(0, col.set(0xffffff));
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: .34, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ghost = mk(robeGeo(), ghostMat);
    const shadow = new THREE.CircleGeometry(.62, 14).rotateX(-Math.PI / 2);
    this.shadow = mk(shadow, new THREE.MeshBasicMaterial({ color: 0x1a0d03, transparent: true, opacity: .42, depthWrite: false }));
    this.shadow.renderOrder = 1;
    // 自分の足元の輪
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.85, 1.02, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.visible = false;
    group.add(this.ring);
  }

  draw(list, meId, time, env) {
    let nA = 0, nL = 0, nG = 0, nS = 0;
    for (const e of list) {
      if (e.ghost) {
        o.position.set(e.x, e.y + Math.sin(time * 1.6 + e.id) * .18, e.z);
        o.rotation.set(0, e.yaw, 0); o.scale.setScalar(1); o.updateMatrix();
        this.ghost.setMatrixAt(nG++, o.matrix);
        continue;
      }
      const speed = e.speed || 0;
      const moving = e.ground ? Math.min(1, speed / 7) : .3;
      const bob = Math.abs(Math.sin(e.walk)) * .07 * moving;
      const lean = e.dash ? .55 : moving * .12;
      const tumble = e.stun ? time * 14 : 0;
      const baseY = e.y + .5 + bob;
      o.position.set(e.x, baseY, e.z); o.rotation.set(lean + (tumble ? Math.sin(tumble) * .5 : 0), e.yaw, tumble ? Math.cos(tumble) * .3 : 0, 'YXZ'); o.scale.setScalar(1); o.updateMatrix();
      this.robe.setMatrixAt(nA, o.matrix); this.face.setMatrixAt(nA, o.matrix);
      // 命が減るほど色が抜ける
      const t = Math.min(1, e.life / 30);
      col.setHSL(e.hue, .12 + .46 * t, .3 + .2 * t);
      if (e.safe && Math.sin(time * 24) > 0) col.setRGB(1, 1, .9);
      if (e.flash > 0) col.lerp(col2.setRGB(1, .35, .2), Math.min(1, e.flash * 3));
      this.robe.setColorAt(nA, col);
      // 頭上の砂時計: 命の多さで大きく、少なければ赤い
      const sc = .42 + Math.min(1.1, Math.sqrt(e.life / 60) * .5);
      o.position.set(e.x, baseY + 2.2 + Math.sin(time * 2.4 + e.id) * .06, e.z); o.rotation.set(0, time * 1.3 + e.id, 0); o.scale.setScalar(sc * 1.25); o.updateMatrix();
      this.icon.setMatrixAt(nA, o.matrix);
      if (e.life < 12) col.setRGB(1, .2 + .1 * Math.sin(time * 9), .12); else col.setRGB(1, .72, .32);
      this.icon.setColorAt(nA, col);
      // 脚
      const sw = Math.sin(e.walk) * .75 * moving;
      const s = Math.sin(e.yaw), c = Math.cos(e.yaw);
      for (const side of [1, -1]) {
        o.position.set(e.x + c * .17 * side, e.y + .52 + bob, e.z - s * .17 * side);
        o.rotation.set(sw * side, e.yaw, 0, 'YXZ'); o.scale.setScalar(1); o.updateMatrix();
        this.legs.setMatrixAt(nL++, o.matrix);
      }
      // 影は斜面に沿わせる
      tiltToGround(e, env);
      o.position.set(e.x, e.gy + .07, e.z);
      const air = Math.max(.35, 1 - (e.y - e.gy) * .08); o.scale.setScalar(air); o.updateMatrix();
      this.shadow.setMatrixAt(nS++, o.matrix);
      nA++;
    }
    for (const [m, n] of [[this.robe, nA], [this.face, nA], [this.icon, nA], [this.legs, nL], [this.ghost, nG], [this.shadow, nS]]) {
      m.count = n; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

// 命の粒
export class Grains {
  constructor(group, glowTex) {
    this.map = new Map();
    this.env = null;
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.27, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a6410 }), 460);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.setColorAt(0, col.set(0xffffff));
    group.add(this.mesh);
    this.glowPos = new Float32Array(460 * 3);
    this.glowSize = new Float32Array(460);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aS', new THREE.BufferAttribute(this.glowSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 1 } },
      vertexShader: `attribute float aS; uniform float uPx; void main(){vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uPx*aS*(120./max(3.,-mv.z)),uPx*46.);}`,
      fragmentShader: `precision mediump float; void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard; float k=smoothstep(.5,0.,d); gl_FragColor=vec4(vec3(1.,.72,.25)*k*k*.85,1.);}`,
    });
    this.glow = new THREE.Points(g, this.glowMat);
    this.glow.frustumCulled = false;
    group.add(this.glow);
    this.p = { x: 0, y: 0, z: 0, r: 0 };
  }
  add(w, now) {
    this.map.set(w[0], { id: w[0], x: w[1], z: w[2], top: !!w[3], v: w[4], t0: now - w[5] / 1000, vr: w[6], fall: w[7] || 0 });
  }
  posOf(g, now, env, out = this.p) {
    const age = now - g.t0;
    W.grainPos(g, age, env, out);
    if (age < g.fall) {
      const k = Math.max(0, age / g.fall);
      if (g.fall > .5) { // 首の滝から弧を描いて着地
        out.x *= k; out.z *= k;
        const y0 = -2;
        out.y = y0 + (out.y - y0) * k * k + Math.sin(k * Math.PI) * 5;
      } else out.y += Math.sin(k * Math.PI) * 2.4;
    }
    return out;
  }
  draw(now, env, time, near) {
    let n = 0;
    for (const g of this.map.values()) {
      if (n >= 460) break;
      const p = this.posOf(g, now, env);
      const big = g.v >= 6;
      const y = p.y + .55 + Math.sin(time * 3 + g.id) * .12;
      o.position.set(p.x, y, p.z);
      o.rotation.set(time * .9 + g.id, time * 1.7 + g.id, 0);
      o.scale.setScalar(big ? 1.75 : 1); o.updateMatrix();
      this.mesh.setMatrixAt(n, o.matrix);
      this.mesh.setColorAt(n, big ? col.setRGB(1, .95, .6) : col.setRGB(1, .78, .3));
      this.glowPos[n * 3] = p.x; this.glowPos[n * 3 + 1] = y; this.glowPos[n * 3 + 2] = p.z;
      this.glowSize[n] = big ? 18 : 8;
      n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.glow.geometry.setDrawRange(0, n);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.aS.needsUpdate = true;
  }
}

// 打ち上げ粒子（リングバッファ）
export class Sparks {
  constructor(group, n = 2400) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.a = {
      position: new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage),
      aV: new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage),
      aT: new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage),
      aC: new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage),
    };
    for (const k in this.a) g.setAttribute(k, this.a[k]);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 300);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uNow: { value: 0 }, uPx: { value: 1 }, uCut: { value: -1 } },
      vertexShader: /* glsl */`
        attribute vec3 aV,aT,aC; uniform float uNow,uPx,uCut; varying vec3 vC; varying float vA;
        void main(){
          float t=uNow-aT.x; float k=t/aT.y;
          if(k<0.||k>1.||aT.x<uCut){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vA=0.;vC=vec3(0.);return;}
          vec3 p=position+aV*t*(1.-.35*k)+vec3(0.,-aT.z*t*t,0.);
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=uPx*(90./max(2.,-mv.z))*(1.-k*.6);
          vC=aC; vA=(1.-k)*(1.-k);
        }`,
      fragmentShader: `precision mediump float; varying vec3 vC; varying float vA; void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard; gl_FragColor=vec4(vC*vA*smoothstep(.5,.05,d),1.);}`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    group.add(this.points);
    this.dirtyFrom = -1;
  }
  emit(x, y, z, count, { speed = 6, up = 3, life = .9, grav = 6, color = [1, .75, .35], spread = .3 } = {}, now) {
    const { position: P, aV: V, aT: T, aC: C } = this.a;
    for (let c = 0; c < count; c++) {
      const i = this.i; this.i = (i + 1) % this.n;
      const a = Math.random() * 6.283, s = speed * (.3 + Math.random() * .8), e = Math.random() * .9 - .1;
      P.setXYZ(i, x + (Math.random() - .5) * spread, y + (Math.random() - .5) * spread, z + (Math.random() - .5) * spread);
      V.setXYZ(i, Math.cos(a) * s * Math.cos(e), up * Math.random() + Math.sin(e) * s * .4, Math.sin(a) * s * Math.cos(e));
      T.setXYZ(i, now, life * (.5 + Math.random() * .7), grav);
      const m = .75 + Math.random() * .4;
      C.setXYZ(i, color[0] * m, color[1] * m, color[2] * m);
    }
    this.dirty = true;
  }
  update(now, px) {
    this.mat.uniforms.uNow.value = now; this.mat.uniforms.uPx.value = px;
    if (this.dirty) { for (const k in this.a) this.a[k].needsUpdate = true; this.dirty = false; }
  }
  clear(now) { this.mat.uniforms.uCut.value = now; }
}
