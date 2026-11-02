// 砂時計本体・砂・空の描画
import * as THREE from 'three';
import * as W from '../shared/world.js';

const NOISE = /* glsl */`
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
export const SUN = new THREE.Vector3(0.45, 0.75, 0.35).normalize();

function makeSandGeometry(rings, segs) {
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3);
  const ring = new Float32Array((rings + 1) * (segs + 1));
  const rad = new Float32Array(rings + 1);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = W.RMAX * Math.pow(i / rings, 1.3);
    rad[i] = r;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos[k * 3] = Math.cos(a) * r; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = Math.sin(a) * r;
      ring[k++] = i;
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('ring', new THREE.BufferAttribute(ring, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  return { g, rad };
}

function sandMaterial(rings, rad) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uY: { value: new Float32Array(rings + 1) }, uU: { value: new Float32Array(rings + 1) },
      uRad: { value: rad }, uScroll: { value: 0 }, uTime: { value: 0 }, uSun: { value: SUN },
      uNeck: { value: new THREE.Vector3() }, uGlow: { value: 1 }, uUnder: { value: 0 },
    },
    defines: { RINGS: rings + 1 },
    vertexShader: /* glsl */`
      attribute float ring;
      uniform float uY[RINGS]; uniform float uU[RINGS]; uniform float uRad[RINGS]; uniform float uUnder;
      varying vec3 vL; varying vec3 vW; varying vec3 vN; varying float vT;
      void main(){
        int i=int(ring+.5); int a=i>0?i-1:0; int b=i<RINGS-1?i+1:RINGS-1;
        float y=mix(uY[i],uU[i],uUnder);
        float y0=mix(uY[a],uU[a],uUnder), y1=mix(uY[b],uU[b],uUnder);
        float dr=max(.001,uRad[b]-uRad[a]);
        float s=(y1-y0)/dr;
        float r=max(.0001,length(position.xz));
        vec3 n=normalize(vec3(-s*position.x/r,1.,-s*position.z/r));
        vec3 p=vec3(position.x,y,position.z);
        vT=abs(uY[i]-uU[i]);
        vL=p; vec4 w=modelMatrix*vec4(p,1.); vW=w.xyz;
        vN=mat3(modelMatrix)*n;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uScroll,uTime,uGlow,uUnder; uniform vec3 uSun,uNeck;
      varying vec3 vL,vW,vN; varying float vT;
      ${NOISE}
      void main(){
        if(vT<.14) discard;
        vec3 N=normalize(vN); if(!gl_FrontFacing && uUnder<.5) N=-N;
        float r=length(vL.xz); float th=atan(vL.z,vL.x);
        vec2 q=vL.xz;
        float n1=vnoise(q*.09+7.), n2=vnoise(q*.8), n3=vnoise(q*6.);
        // 中心へ渦を巻いて流れる筋
        float sp=sin(r*1.25+th*3.+uScroll+n1*5.);
        float rip=sin(r*5.+th*7.+uScroll*1.6+n2*3.);
        float h=.5+.28*sp+.1*rip+.14*(n2-.5);
        vec3 c=mix(vec3(.60,.37,.17),vec3(.98,.76,.45),clamp(h,0.,1.));
        c*=.93+.14*n3;
        float d=max(0.,dot(N,uSun));
        float amb=.34+.22*N.y;
        vec3 lit=c*(vec3(1.,.93,.78)*d*.8+vec3(.46,.55,.74)*amb);
        // 首のあたりの命の光
        float nd=length(vW-uNeck);
        lit+=c*vec3(1.,.62,.26)*uGlow*(1.7*exp(-nd/15.)+.2*exp(-nd/55.));
        // 砂粒のきらめき
        vec2 cell=floor(q*26.); float sk=hash(cell);
        if(sk>.985) lit+=vec3(1.,.9,.6)*(.5+.5*sin(uTime*4.+sk*90.))*.8*smoothstep(.42,.12,length(fract(q*26.)-.5));
        // 外周はほんのり暗く
        lit*=mix(1.,.72,smoothstep(32.,52.,r));
        if(uUnder>.5) lit*=.7;
        gl_FragColor=vec4(pow(lit,vec3(.9)),1.);
      }`,
  });
}

export class World {
  constructor(lite) {
    this.scene = new THREE.Scene();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.time = 0;
    this.scroll = 0;
    this.angle = 0;
    this.env = W.makeEnv();
    this.envA = W.makeEnv();
    this.lite = lite;
    this.scene.add(new THREE.HemisphereLight(0xaac4ff, 0x8a5d2e, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.7);
    sun.position.copy(SUN);
    this.scene.add(sun);
    this.buildSky();
    this.buildDistant();
    this.buildSand();
    this.buildGlass();
    this.buildFrame();
    this.buildStream();
    this.buildDust();
    this.buildNeckGlow();
  }

  buildSky() {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){vD=normalize(position); vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.); gl_Position=p.xyww;}`,
      fragmentShader: /* glsl */`
        precision highp float; varying vec3 vD; uniform float uTime;
        ${NOISE}
        float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return v;}
        void main(){
          vec3 d=normalize(vD);
          float t=d.y*.5+.5;
          vec3 c=mix(vec3(.05,.03,.09),vec3(.015,.035,.11),smoothstep(.1,.85,t));
          vec2 uv=vec2(d.x+d.y*.6,d.z-d.y*.45)*2.4+d.y*vec2(1.3,-.8);
          float n=fbm(uv*1.3+vec2(uTime*.004,0.));
          float m=fbm(uv*2.4-n*2.);
          c+=vec3(.20,.09,.28)*smoothstep(.42,.85,n)*.8;
          c+=vec3(.05,.20,.28)*smoothstep(.5,.9,m)*.7;
          c+=vec3(.42,.20,.07)*exp(-abs(d.y)*5.)*(.25+.5*n);
          vec3 a=abs(d); vec2 st=a.y>a.x&&a.y>a.z?d.xz/a.y:(a.x>a.z?d.yz/a.x:d.xy/a.z);
          st+=sign(d.x)*.13+sign(d.z)*.27+sign(d.y)*.41;
          vec2 g=st*180.; vec2 id=floor(g); float s=hash(id);
          if(s>.982){float k=length(fract(g)-.5); float tw=.6+.4*sin(uTime*(1.+s*3.)+s*50.); c+=vec3(1.,.93,.8)*smoothstep(.34,0.,k)*tw*(s-.982)*55.;}
          gl_FragColor=vec4(c,1.);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), m);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  // 虚空に浮かぶ、ほかの誰かの命の砂時計
  buildDistant() {
    const pts = [];
    for (let i = 0; i <= 18; i++) { const u = i / 18, d = (u * 2 - 1); pts.push(new THREE.Vector2(0.12 + 0.88 * Math.pow(Math.abs(d), 1.2) * (1 - Math.pow(Math.abs(d), 7)), d * 1.6)); }
    const g = new THREE.LatheGeometry(pts, 8);
    const n = this.lite ? 50 : 110;
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
    const im = new THREE.InstancedMesh(g, m, n);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), o = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, y = (Math.random() * 2 - 1) * 0.55, D = 330 + Math.random() * 900;
      o.position.set(Math.cos(a) * D * Math.sqrt(1 - y * y), y * D, Math.sin(a) * D * Math.sqrt(1 - y * y));
      e.set(Math.random() * .7 - .35, Math.random() * 6, Math.random() * .7 - .35); q.setFromEuler(e); o.quaternion.copy(q);
      const s = 3 + Math.random() * 11; o.scale.set(s, s, s); o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      const dim = Math.random() < .35 ? .03 : .08 + Math.random() * .17;
      im.setColorAt(i, col.setRGB(1 * dim, .62 * dim, .28 * dim));
    }
    im.frustumCulled = false;
    this.scene.add(im);
  }

  buildSand() {
    const rings = this.lite ? 44 : 64, segs = this.lite ? 56 : 96;
    const { g, rad } = makeSandGeometry(rings, segs);
    this.rings = rings; this.rad = rad;
    const mk = (under) => { const mat = sandMaterial(rings, rad); mat.uniforms.uUnder.value = under; const m = new THREE.Mesh(g, mat); m.frustumCulled = false; this.group.add(m); return m; };
    this.upperS = mk(0); this.upperU = mk(1); this.lowerS = mk(0); this.lowerU = mk(1);
  }

  buildGlass() {
    const pts = [];
    const n = 90;
    for (let i = 0; i <= n; i++) { const y = -W.H + (2 * W.H * i) / n; pts.push(new THREE.Vector2(Math.max(0.01, W.glassR(y)), y)); }
    const g = new THREE.LatheGeometry(pts, this.lite ? 56 : 96);
    const mat = (side, gain) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
      uniforms: { uGain: { value: gain }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN,vV,vL; void main(){vL=position; vec4 w=modelMatrix*vec4(position,1.); vN=mat3(modelMatrix)*normal; vV=cameraPosition-w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */`
        precision highp float; uniform float uGain,uTime; varying vec3 vN,vV,vL;
        void main(){
          vec3 N=normalize(vN),V=normalize(vV);
          float f=pow(1.-abs(dot(N,V)),2.6);
          float th=atan(vL.z,vL.x);
          float streak=pow(max(0.,sin(th*2.+.7)),24.)*.35+pow(max(0.,sin(th*3.-1.1)),60.)*.25;
          vec3 c=mix(vec3(.25,.62,.72),vec3(.92,.97,1.),f)*(f*.9+.015)+vec3(.8,.9,1.)*streak*(.2+f);
          gl_FragColor=vec4(c*uGain,1.);
        }`,
    });
    const back = new THREE.Mesh(g, mat(THREE.BackSide, .55));
    const front = new THREE.Mesh(g, mat(THREE.FrontSide, .9));
    back.renderOrder = 5; front.renderOrder = 9;
    this.group.add(back, front);
  }

  buildFrame() {
    const bronze = new THREE.MeshStandardMaterial({ color: 0x6d4a26, metalness: .35, roughness: .55, emissive: 0x24140a });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc69a4e, metalness: .5, roughness: .4, emissive: 0x3a2710 });
    const R = W.RMAX + 8;
    for (const s of [1, -1]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R + 4, R + 6, 4, 48), bronze);
      disc.position.y = s * (W.H + 3);
      disc.rotation.x = s < 0 ? Math.PI : 0;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 5, .9, 8, 64), trim);
      ring.rotation.x = Math.PI / 2; ring.position.y = s * (W.H + 1);
      this.group.add(disc, ring);
    }
    const nc = 6;
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * Math.PI * 2 + .3;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, W.H * 2 + 4, 12), bronze);
      col.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), trim);
      knob.position.copy(col.position);
      this.group.add(col, knob);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(W.RNECK + 1.4, .55, 10, 40), trim);
    collar.rotation.x = Math.PI / 2;
    this.group.add(collar);
  }

  // 首から落ちる砂の滝
  buildStream() {
    const n = this.lite ? 500 : 1100;
    const seed = new Float32Array(n * 3), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random() * 6.283; seed[i * 3 + 2] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.streamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uBot: { value: -30 }, uOn: { value: 1 }, uPx: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 seed; uniform float uTime,uBot,uOn,uPx; varying float vA;
        void main(){
          float T=fract(seed.x+uTime*(.42+seed.z*.14));
          float y=5.-(5.-uBot)*T*T;
          float rr=(.18+1.25*seed.z*seed.z)*(1.+T*.25);
          vec3 p=vec3(cos(seed.y+T*2.)*rr,y,sin(seed.y+T*2.)*rr);
          vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*mv;
          gl_PointSize=min(uPx*(1.+seed.z*1.8)*(70./max(5.,-mv.z)),uPx*9.);
          vA=uOn*smoothstep(0.,.06,T)*smoothstep(1.,.93,T);
        }`,
      fragmentShader: `precision mediump float; varying float vA; void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard; gl_FragColor=vec4(vec3(1.,.72,.34)*vA*smoothstep(.5,.05,d)*.95,1.);}`,
    });
    const s = new THREE.Points(g, this.streamMat);
    s.frustumCulled = false;
    this.group.add(s);
    // 芯の光の柱
    this.coreMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOn: { value: 1 } },
      vertexShader: `varying vec2 vU; varying vec3 vN,vV; void main(){vU=uv; vec4 w=modelMatrix*vec4(position,1.); vN=mat3(modelMatrix)*normal; vV=cameraPosition-w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `precision highp float; varying vec2 vU; varying vec3 vN,vV; uniform float uTime,uOn;
        void main(){float f=abs(dot(normalize(vN),normalize(vV))); float s=.65+.35*sin(vU.y*70.+uTime*19.+sin(vU.x*25.)*2.); float e=smoothstep(0.,.1,vU.y)*smoothstep(1.,.86,vU.y); gl_FragColor=vec4(vec3(1.,.66,.3)*f*f*f*s*uOn*.55*e,1.);}`,
    });
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(.7, .85, 1, 28, 1, true), this.coreMat);
    this.core.frustumCulled = false;
    this.group.add(this.core);
  }

  buildDust() {
    const n = this.lite ? 240 : 560;
    const seed = new Float32Array(n * 3), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let r, y;
      do { y = (Math.random() * 2 - 1) * W.H; r = Math.sqrt(Math.random()) * W.RMAX; } while (r > W.glassR(y) - 1);
      const a = Math.random() * 6.283;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 3] = Math.random() * 6.283; seed[i * 3 + 1] = .5 + Math.random(); seed[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
      vertexShader: `attribute vec3 seed; uniform float uTime,uPx; varying float vA;
        void main(){vec3 p=position+vec3(sin(uTime*.13*seed.y+seed.x)*2.5,sin(uTime*.2*seed.y+seed.x*2.)*1.8,cos(uTime*.11*seed.y+seed.x)*2.5);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(uPx*(1.+seed.z*2.)*(44./max(4.,-mv.z)),uPx*7.); vA=.35+.35*sin(uTime*seed.y+seed.x*3.);}`,
      fragmentShader: `precision mediump float; varying float vA; void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard; gl_FragColor=vec4(vec3(1.,.82,.55)*vA*smoothstep(.5,0.,d),1.);}`,
    });
    const s = new THREE.Points(g, this.dustMat);
    s.frustumCulled = false;
    this.group.add(s);
  }

  buildNeckGlow() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,225,170,1)'); gr.addColorStop(.25, 'rgba(255,165,80,.45)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(c);
    this.neck = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: .85 }));
    this.neck.scale.set(34, 34, 1);
    this.group.add(this.neck);
  }

  // 砂面の更新。e は反転の進み具合(0〜1)。反転中は上下それぞれの砂が反対側のガラスへ移っていく
  setProfile(f, e) {
    const a = W.setSand(this.env, f);
    const n = this.rings;
    const uS = this.upperS.material.uniforms, uL = this.lowerS.material.uniforms;
    const yU = uS.uY.value, gU = uS.uU.value, yL = uL.uY.value, gL = uL.uU.value;
    let Lb = 0, Pb = 0;
    if (e > 0) { W.setSand(this.envA, 1 - f); Lb = this.envA.L; Pb = this.envA.P; }
    for (let i = 0; i <= n; i++) {
      const r = this.rad[i];
      let a1 = W.sandTop(r, a.L), a2 = W.funnelD(r), b1 = W.sandBot(r, a.P), b2 = -W.capD(r);
      if (e > 0) {
        a1 += (-W.sandBot(r, Pb) - a1) * e; a2 += (W.capD(r) - a2) * e;
        b1 += (-W.sandTop(r, Lb) - b1) * e; b2 += (-W.funnelD(r) - b2) * e;
      }
      yU[i] = a1; gU[i] = a2; yL[i] = b1; gL[i] = b2;
    }
    // 下の層は上の層と同じ配列を共有する
    this.upperU.material.uniforms.uY.value = yU; this.upperU.material.uniforms.uU.value = gU;
    this.lowerU.material.uniforms.uY.value = yL; this.lowerU.material.uniforms.uU.value = gL;
    return a;
  }

  update(dt, f, flipE, cameraPx) {
    this.time += dt;
    const flowing = flipE === 0 && f > 0.001;
    if (flowing) this.scroll += dt * 1.25;
    const a = this.setProfile(f, flipE);
    this.angle = flipE > 0 ? flipE * Math.PI : 0;
    this.group.rotation.z = this.angle;
    this.group.updateMatrixWorld(true);
    const neck = new THREE.Vector3().setFromMatrixPosition(this.group.matrixWorld);
    for (const [m, s] of [[this.upperS, 1], [this.upperU, 1], [this.lowerS, -1], [this.lowerU, -1]]) {
      const u = m.material.uniforms;
      u.uTime.value = this.time; u.uScroll.value = this.scroll * s; u.uNeck.value.copy(neck); u.uGlow.value = flowing ? 1 : .55;
    }
    this.sky.material.uniforms.uTime.value = this.time;
    const on = flowing ? 1 : 0;
    const su = this.streamMat.uniforms;
    su.uTime.value = this.time; su.uBot.value = a.P; su.uOn.value += (on - su.uOn.value) * Math.min(1, dt * 4); su.uPx.value = cameraPx;
    this.dustMat.uniforms.uTime.value = this.time; this.dustMat.uniforms.uPx.value = cameraPx;
    this.coreMat.uniforms.uTime.value = this.time; this.coreMat.uniforms.uOn.value = su.uOn.value;
    const top = 3, bot = a.P;
    this.core.scale.y = top - bot; this.core.position.y = (top + bot) / 2;
    this.core.visible = su.uOn.value > 0.02;
    this.neck.material.opacity = (.35 + .5 * su.uOn.value) * (.92 + .08 * Math.sin(this.time * 3));
  }
}
