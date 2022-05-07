import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import TWEEN from 'three/examples/jsm/libs/tween.module.min';

import noise from './shaders/noise.glsl';

console.clear();

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 100);
camera.position.set(0, 0, 9);
let renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
//renderer.toneMapping = THREE.ReinhardToneMapping;
//renderer.setClearColor(0x404040);
document.body.appendChild(renderer.domElement);S

let clock = new THREE.Clock();

window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    bloomComposer.setSize(innerWidth, innerHeight);
    finalComposer.setSize(innerWidth, innerHeight);
});

let controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 9;
controls.maxDistance = 15;

let path = new THREE.Path();
path.moveTo(-5, 5);
path.lineTo(-5, 5);
const segs = 40,
    r = 10 / (segs * 4),
    step = r * 2;
for (let i = 0; i < segs; i++) {
    path.absarc(5, 5 - r - i * step * 2, r, Math.PI * 0.5, Math.PI * 1.5, true);
    path.absarc(-5, 5 - r * 3 - i * step * 2, r, Math.PI * 0.5, Math.PI * 1.5, false)
}
path.lineTo(5, -5);

const points = path.getSpacedPoints(25000);

let eGeom = new THREE.BufferGeometry().setFromPoints(points);
let l = new THREE.Line(eGeom);
let geometry = new LineGeometry();
let geoLine = geometry.fromLine(l);

let canvas = document.createElement("canvas");
canvas.width = canvas.height = 512;
let tex = new THREE.CanvasTexture(canvas);

let u = {
    globalBloom: { value: 0 },
    iTime: { value: 0 },
    iTexture: { value: tex }
};
let matLine = new LineMaterial({
    color: 0x404040,
    worldUnits: true,
    linewidth: 0.1,
    dashed: false,
    alphaToCoverage: false
});

matLine.onBeforeCompile = (shader) => {
    shader.uniforms.globalBloom = u.globalBloom;
    shader.uniforms.iTime = u.iTime;
    shader.uniforms.iTexture = u.iTexture;
    shader.vertexShader = `
      uniform float iTime;
      varying vec2 vUv;
      ${noise}
      ${shader.vertexShader}
   `.replace(
        `// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );`,
        `
        float time = iTime * 0.5;
        vec2 calcUVStart = (instanceStart.xy - vec2(-5.)) / 10.;
        vec2 calcUVEnd = (instanceEnd.xy - vec2(-5.)) / 10.;
        float yS = snoise(vec3(calcUVStart * 2.5, time));
        float yE = snoise(vec3(calcUVEnd * 2.5, time));
        float zS = snoise(vec3(calcUVStart * 2.5 - 1., time));
        float zE = snoise(vec3(calcUVEnd * 2.5 - 1., time));
        
        
        vec3 nDir = vec3(0, 1, 1) * 0.75;
        vec3 iStart = instanceStart + nDir * vec3(1, yS, zS);
        vec3 iEnd = instanceEnd + nDir * vec3(1, yE, zE);
        
        vec2 finalUVStart = (iStart.xy - vec2(-5.)) / 10.;
        vec2 finalUVEnd = (iEnd.xy - vec2(-5.)) / 10.;
        vUv = (finalUVStart + finalUVEnd) * 0.5;
        
      // camera space
			vec4 start = modelViewMatrix * vec4( iStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( iEnd, 1.0 );
        `
    )
    console.log(shader.vertexShader);
    shader.fragmentShader = `
    uniform float globalBloom;
    uniform sampler2D iTexture;
    varying vec2 vUv;
    ${shader.fragmentShader}
  `.replace(
        `vec4 diffuseColor = vec4( diffuse, alpha );`,
        `
    vec2 uv = vUv;
    uv.x = abs(vUv.x - 0.5) + 0.25;
    vec4 texColor = texture2D(iTexture, uv);
    
    float auv = step(0., min(vUv.x, vUv.y)) - step(1., max(vUv.x, vUv.y));
    
    if (auv < 0.5 || texColor.a < 0.99 ) discard;
    
    vec3 col = mix(diffuse, texColor.rgb, texColor.a * auv);
    vec4 diffuseColor = vec4( col, alpha );`
    ).replace(
        `#include <premultiplied_alpha_fragment>`,
        `#include <premultiplied_alpha_fragment>

      // this part is for selective bloom

      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0), globalBloom);
      float d = min(1., step(0.9, texColor.b) + step(0.9, texColor.r));
      vec3 bloomCol = mix(vec3(1), texColor.rgb, d * globalBloom);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, bloomCol, d);
    `
    );
    console.log(shader.fragmentShader);
};

let line = new Line2(geoLine, matLine);
scene.add(line);

// BLOOM
const params = {
    bloomStrength: 2,
    bloomThreshold: 0,
    bloomRadius: 0.5
};
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = params.bloomThreshold;
bloomPass.strength = params.bloomStrength;
bloomPass.radius = params.bloomRadius;

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

const finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: bloomComposer.renderTarget2.texture }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );}`,
        fragmentShader: `  uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) ); }`,
        defines: {}
    }), 'baseTexture'
);
finalPass.needsSwap = true;

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScene);
finalComposer.addPass(finalPass);
////////

// Texture with Tweening Triangles
class Triangle {
    constructor(limW, limH, color, lineWidth) {
        this.color = color;
        this.lineWidth = lineWidth;
        this.lims = new THREE.Vector2(limW, limH);
        this.current = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
        this.start = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
        this.finish = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    }
    setStart() {
        this.start.forEach(v => { v.random().multiply(this.lims).round() });
        return this;
    }
    setFinish() {
        this.finish.forEach(v => { v.random().multiply(this.lims).round() });
        return this;
    }
    setCurrent(val) {
        this.current.forEach((v, idx) => { v.lerpVectors(this.start[idx], this.finish[idx], val) });
        return this;
    }
    copyFinishToStart() {
        this.start.forEach((v, idx) => { v.copy(this.finish[idx]) });
        return this;
    }
    draw(ctx) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.beginPath();
        ctx.moveTo(this.current[0].x, this.current[0].y);
        ctx.lineTo(this.current[1].x, this.current[1].y);
        ctx.lineTo(this.current[2].x, this.current[2].y);
        ctx.lineTo(this.current[0].x, this.current[0].y);
        ctx.closePath();
        ctx.stroke();
    }
}

let ctx = canvas.getContext("2d");
ctx.lineJoin = "round";
ctx.lineCap = "round";
let tris = [
    "rgb(0, 200, 255)", 
    '#000000', '#111111', '#ff0000', '#000000', '#111111', '#000000', '#404040', '#606060', 
    '#000000', '#111111', '#ff0000', '#000000', '#111111', '#000000', '#404040', '#606060',
    '#000000', '#111111', '#ff0000', '#000000', '#111111', '#000000', '#404040', '#606060'].map(tri => {
    let triangle = new Triangle(canvas.width, canvas.height, tri, 15).setStart().setFinish().setCurrent(0);
    triangle.draw(ctx);
    return triangle;
})

function runSequence() {
    new TWEEN.Tween({ val: 0 }).to({ val: 1 }, 1000)
        .delay(4000)
        .easing(TWEEN.Easing.Exponential.InOut)
        .onUpdate(val => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            tris.forEach(tri => {
                tri.setCurrent(val.val);
                tri.draw(ctx);
            });
            tex.needsUpdate = true;
        })
        .onComplete(_ => {
            tris.forEach(tri => {
                tri.copyFinishToStart();
                tri.setFinish();
            })
            runSequence();
        })
        .start();
}

runSequence();

//////////////////////////////////

renderer.setAnimationLoop((_) => {
    u.iTime.value = clock.getElapsedTime() * 0.25;
    matLine.resolution.set(innerWidth, innerHeight);
    controls.update();
    TWEEN.update();
    renderer.setClearColor(0x000000);
    u.globalBloom.value = 1;
    bloomComposer.render();
    renderer.setClearColor(0x304050);
    u.globalBloom.value = 0;
    finalComposer.render();
    //renderer.render(scene, camera);
});
