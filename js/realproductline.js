import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 1. PLC 狀態字典與基礎參數設定 ---

// ⚡ 雖然不輪詢 T 值，但保留 DEFAULT_PARAMS 讓 UPH 產能計算有基準依據
const DEFAULT_PARAMS = {
    "T14": 5.0, "T0": 0.5, "T7": 1.0,
    "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
    "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
    "T40": 1.0, "T12": 1.0, "T13": 1.0
};

const PLC_STATES = {
    1:  { text: "S1 等待物料", animTime: 1.62, waitParam: "T14" },
    10: { text: "S10 龍門向右預位", animTime: 5.18, waitParam: "T30" },
    11: { text: "S11 龍門向下預位", animTime: 0.67, waitParam: "T3" },
    12: { text: "S12 夾持工作, 龍門向上", animTime: 1.47, waitParam: "T4" },
    13: { text: "S13 龍門向左", animTime: 5.14, waitParam: "T31" },
    14: { text: "S14 龍門向下", animTime: 1.36, waitParam: "T5" },
    15: { text: "S15 放開夾爪", animTime: 0.77, waitParam: "T6" },
    16: { text: "S16 龍門向上", animTime: 4.06, waitParam: "T15" },
    17: { text: "S17 輸送帶2", animTime: 1.81, waitParam: "T7" },
    18: { text: "S18 轉臂向下", animTime: 0.22, waitParam: "T8" },
    19: { text: "S19 吸附工件", animTime: 0.09, waitParam: "T9" },
    20: { text: "S20 吸盤向上", animTime: 0.10, waitParam: "T32" }, 
    21: { text: "S21 吸盤旋轉向下", animTime: 1.12, waitParam: "T10" },
    22: { text: "S22 解真空", animTime: 0.10, waitParam: "T11" },
    23: { text: "S23 吸盤向上", animTime: 0.29 }, 
    24: { text: "S24 吸盤歸位", animTime: 0.83 },
    30: { text: "S30 滑台向左", animTime: 0.50 },
    31: { text: "S31 滑台向下", animTime: 0.20, waitParam: "T40" },
    32: { text: "S32 夾持工件", animTime: 0.30, waitParam: "T12" },
    33: { text: "S33 滑台向上", animTime: 0.5 },
    34: { text: "S34 滑台向右", animTime: 0.50 },
    35: { text: "S35 滑台向下", animTime: 0.50 },
    36: { text: "S36 放開工件", animTime: 0.30, waitParam: "T13" },
    37: { text: "S37 滑台向上", animTime: 0.5 },
    50: { text: "S50 系統急停", animTime: 0.1 } 
};

// 產線序列定義
const seqMetal = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const seqNonMetal = [1, 30, 31, 32, 33, 34, 35, 36, 37];

// ==========================================
// 2. 3D 基礎設定與模型載入
// ==========================================
const p481_Z_OFFSET = 0, p_X_OFFSET = -0.43; 
const p291_Y_OFFSET = -0.01, p101_Y_OFFSET = 0.05, p9011_Y_OFFSET = 0.045;
const p101_X_OFFSET = -0.00, p9011_X_OFFSET = -0.055;
const p1211_X_OFFSET = -0.01, p1211_Z_OFFSET = -0.02; 

const unifiedMaterial = new THREE.MeshStandardMaterial({ color: 0x808a9d, roughness: 0.4, metalness: 0.3 });
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(10, 20, 15);
scene.add(dirLight);
scene.add(new THREE.GridHelper(30, 30, 0x00d2ff, 0x3a3f58));

const resizeObserver = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});
resizeObserver.observe(container);

const loader = new GLTFLoader();
let mainModelGroup = new THREE.Group();
scene.add(mainModelGroup);

const parts = { p261: null, p2711: null, p291: null, p101: null, p9011: null, p481: null, p281: null, p1211: null };
let initPos = {}, initRot = {};
let startPos = { p481: {x:0,y:0,z:0,rotY:0}, p261: {x:0,y:0,z:0}, p2711: {x:0,y:0,z:0}, p291: {x:0,y:0,z:0,rotY:0}, p101: {x:0,y:0,z:0}, p9011: {x:0,y:0,z:0}, p1211: {x:0,y:0,z:0} };
let targets  = { p481: {x:0,y:0,z:0,rotY:0}, p261: {x:0,y:0,z:0}, p2711: {x:0,y:0,z:0}, p291: {x:0,y:0,z:0,rotY:0}, p101: {x:0,y:0,z:0}, p9011: {x:0,y:0,z:0}, p1211: {x:0,y:0,z:0} };

let currentPLCState = -1; 
let previousPLCState = -1; 
let animationStartTime = 0; 
let currentAnimDurationMs = 1000; 
let isFetching = false; 

async function loadModels(fileList) {
    while (mainModelGroup.children.length > 0) mainModelGroup.remove(mainModelGroup.children[0]);
    for (let fileObj of fileList) {
        const url = typeof fileObj === 'string' ? fileObj : URL.createObjectURL(fileObj);
        await new Promise((resolve) => {
            loader.load(url, (gltf) => {
                const model = gltf.scene;
                mainModelGroup.add(model);
                model.traverse((child) => {
                    if (child.isMesh) child.material = unifiedMaterial;
                    if (!child.name) return;
                    if (child.name === '零件482') child.visible = false;

                    if (child.name === '零件261') { parts.p261 = child; child.position.x += p_X_OFFSET; initPos.p261 = child.position.clone(); targets.p261 = { ...initPos.p261 }; }
                    if (child.name === '零件27-11') { parts.p2711 = child; child.position.x += p_X_OFFSET; initPos.p2711 = child.position.clone(); targets.p2711 = { ...initPos.p2711 }; }
                    if (child.name === '零件291') { parts.p291 = child; child.position.y += p291_Y_OFFSET; initPos.p291 = child.position.clone(); initRot.p291 = child.rotation.clone(); targets.p291 = { x: child.position.x, y: child.position.y, z: child.position.z, rotY: child.rotation.y }; }
                    if (child.name === '零件101') { parts.p101 = child; child.position.x += p101_X_OFFSET; child.position.y += p101_Y_OFFSET; initPos.p101 = child.position.clone(); targets.p101 = { ...initPos.p101 }; }
                    if (child.name === '零件9-011' || child.name === '零件9011') { parts.p9011 = child; child.position.x += p9011_X_OFFSET; child.position.y += p9011_Y_OFFSET; initPos.p9011 = child.position.clone(); targets.p9011 = { ...initPos.p9011 }; }
                    if (child.name === '零件12-11' || child.name === '零件1211') { parts.p1211 = child; child.position.x += p1211_X_OFFSET; child.position.z += p1211_Z_OFFSET; initPos.p1211 = child.position.clone(); targets.p1211 = { ...initPos.p1211 }; }
                    if (child.name === '零件481') { parts.p481 = child; child.position.z += p481_Z_OFFSET; initPos.p481 = child.position.clone(); initRot.p481 = child.rotation.clone(); targets.p481 = { x: child.position.x, y: child.position.y, z: child.position.z, rotY: child.rotation.y }; }
                });
                resolve();
            });
        });
    }

    const box = new THREE.Box3().setFromObject(mainModelGroup);
    if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        let maxDim = Math.max(size.x, size.y, size.z);
        let cameraZ = maxDim * 0.8; 
        camera.position.set(center.x + cameraZ * 0.1, center.y + cameraZ * 0.5, center.z + cameraZ);
        camera.lookAt(center);
        controls.target.copy(center);
    }
}

// ==========================================
// 3. ⚡ 動態雙線計算 UPH (套用理論基準值)
// ==========================================
function calculateUPH() {
    function getSequenceCycleTime(sequence) {
        let totalTime = 0;
        sequence.forEach(state => {
            const step = PLC_STATES[state];
            if (step) {
                totalTime += step.animTime || 0; 
                if (step.waitParam) {
                    let waitSec = DEFAULT_PARAMS[step.waitParam] !== undefined ? DEFAULT_PARAMS[step.waitParam] : 1.0;
                    totalTime += waitSec;
                }
            }
        });
        return totalTime;
    }

    let metalCycle = getSequenceCycleTime(seqMetal);
    let nonMetalCycle = getSequenceCycleTime(seqNonMetal);

    let metalUPH = metalCycle > 0 ? Math.round(3600 / metalCycle) : 0;
    let nonMetalUPH = nonMetalCycle > 0 ? Math.round(3600 / nonMetalCycle) : 0;

    const metalUphEl = document.getElementById('current-metal-uph');
    const nonMetalUphEl = document.getElementById('current-nonmetal-uph');

    if (metalUphEl) metalUphEl.innerText = metalUPH;
    if (nonMetalUphEl) nonMetalUphEl.innerText = nonMetalUPH;
}

// ==========================================
// 4. 號誌邏輯與重置動畫
// ==========================================
function updateTrafficLights(state) {
    const lg = document.getElementById('light-green');
    const ly = document.getElementById('light-yellow');
    const lr = document.getElementById('light-red');

    lg.classList.remove('active');
    ly.classList.remove('active');
    lr.classList.remove('active');

    previousPLCState = state;

    if (state === 50 || state === 0 || !PLC_STATES[state]) {
        lr.classList.add('active'); // 停止運行 / 急停 亮紅燈
    } else {
        lg.classList.add('active'); // 正常運作亮綠燈
    }
}

function resetAnimation() {
    console.log("產線手動重置！動畫歸位");
    currentPLCState = 1;

    if (!parts.p481) return;

    parts.p481.position.set(initPos.p481.x, initPos.p481.y, initPos.p481.z); 
    parts.p481.rotation.y = initRot.p481.y;
    parts.p261.position.copy(initPos.p261); 
    parts.p2711.position.copy(initPos.p2711);
    parts.p291.position.copy(initPos.p291); 
    parts.p291.rotation.y = initRot.p291.y;
    parts.p101.position.copy(initPos.p101); 
    parts.p9011.position.copy(initPos.p9011);
    if (parts.p1211) parts.p1211.position.copy(initPos.p1211);

    startPos.p481 = { x: initPos.p481.x, y: initPos.p481.y, z: initPos.p481.z, rotY: initRot.p481.y };
    startPos.p261 = { x: initPos.p261.x, y: initPos.p261.y, z: initPos.p261.z };
    startPos.p2711 = { x: initPos.p2711.x, y: initPos.p2711.y, z: initPos.p2711.z };
    startPos.p291 = { x: initPos.p291.x, y: initPos.p291.y, z: initPos.p291.z, rotY: initRot.p291.y };
    startPos.p101 = { x: initPos.p101.x, y: initPos.p101.y, z: initPos.p101.z };
    startPos.p9011 = { x: initPos.p9011.x, y: initPos.p9011.y, z: initPos.p9011.z };

    targets.p481 = { ...startPos.p481 }; 
    targets.p261 = { ...startPos.p261 }; 
    targets.p2711 = { ...startPos.p2711 }; 
    targets.p291 = { ...startPos.p291 };
    targets.p101 = { ...startPos.p101 }; 
    targets.p9011 = { ...startPos.p9011 };
}

document.getElementById('btn-reset-line').addEventListener('click', async () => {
    if (!confirm("確定要重置實體生產線嗎？")) return;
    try {
        const payload = { param: "RESET_ALL_TIMERELAY", value: true }; 
        await fetch('http://192.168.3.85:9090/plc/writeMPoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert("已送出重置指令！");
        resetAnimation(); 
    } catch (e) {
        alert("重置指令發送失敗！");
    }
});

// ==========================================
// 5. 即時連線與狀態更新 (僅輪詢 PLC State)
// ==========================================
async function fetchPLCData() {
    if (isFetching) return;
    isFetching = true;
    try {
        const stateRes = await fetch('http://192.168.3.85:9090/plc/state');
        const stateText = await stateRes.text();

        const stateNum = parseInt(stateText.replace(/\D/g, '')); 

        if (!isNaN(stateNum)) {
            updateTrafficLights(stateNum);
            updateStateTargets(stateNum);
            calculateUPH(); 
        }
    } catch (err) {
        console.warn("PLC連線異常");
    } finally {
        isFetching = false;
    }
}

function updateStateTargets(s) {
    if (currentPLCState === s) return; 
    currentPLCState = s;

    let animTimeSec = PLC_STATES[s]?.animTime || 1.0;
    currentAnimDurationMs = animTimeSec * 1000;
    animationStartTime = performance.now();

    // ⚡ 當狀態為 S16 時，等待 1 秒後再開始作動
    if (s === 16) {
        animationStartTime += 1000;
    }

    // ⚡ 當狀態為 S17 時，把起跑點往未來推遲 5 秒
    if (s === 17) {
        animationStartTime += 5000; 
    }

    if(parts.p481 && parts.p101) {
        // 1. 抓取當前位置作為新起點
        startPos.p481 = { x: parts.p481.position.x, y: parts.p481.position.y, z: parts.p481.position.z, rotY: parts.p481.rotation.y };
        startPos.p261 = { x: parts.p261.position.x, y: parts.p261.position.y, z: parts.p261.position.z };
        startPos.p2711 = { x: parts.p2711.position.x, y: parts.p2711.position.y, z: parts.p2711.position.z };
        startPos.p291 = { x: parts.p291.position.x, y: parts.p291.position.y, z: parts.p291.position.z, rotY: parts.p291.rotation.y };
        startPos.p101 = { x: parts.p101.position.x, y: parts.p101.position.y, z: parts.p101.position.z };
        startPos.p9011 = { x: parts.p9011.position.x, y: parts.p9011.position.y, z: parts.p9011.position.z };

        // ⚡ 核心修改：進入 S1 時，強制 P481 的起點瞬移到進料點 (Z = -0.25)
        if (s === 1) {
            startPos.p481 = { x: initPos.p481.x, y: initPos.p481.y, z: initPos.p481.z , rotY: initRot.p481.y };
        }
    }

    if(!parts.p481) return;
    let dx = 0, dz = 0;

    // 2. 設定新目標點 (全面改用基於 initPos 的絕對座標，消滅累積誤差)
    switch (s) {
        case 1: 
            // ⚡ 核心修改：S1 目標為 0 (實際初始位)，這樣動畫就會從 -0.25 滑到 0 呈現進料
            targets.p481 = { x: initPos.p481.x, y: initPos.p481.y, z: initPos.p481.z -0.25, rotY: initRot.p481.y };
            targets.p261 = { ...initPos.p261 }; 
            targets.p2711 = { ...initPos.p2711 }; 
            targets.p291 = { x: initPos.p291.x, y: initPos.p291.y, z: initPos.p291.z, rotY: initRot.p291.y };
            targets.p101 = { ...initPos.p101 }; 
            targets.p9011 = { ...initPos.p9011 };
            break;
        case 10: targets.p261.x = initPos.p261.x + 0.43; targets.p2711.x = initPos.p2711.x + 0.43; break;
        case 11: targets.p2711.y = initPos.p2711.y - 0.045; break;
        case 12: targets.p2711.y = initPos.p2711.y; targets.p481.y = initPos.p481.y + 0.045; break;
        case 13: targets.p261.x = initPos.p261.x; targets.p2711.x = initPos.p2711.x; targets.p481.x = initPos.p481.x - 0.43; break;
        case 14: targets.p2711.y = initPos.p2711.y - 0.045; targets.p481.y = initPos.p481.y; break;
        case 15: targets.p2711.y = initPos.p2711.y - 0.045; break;
        case 16: targets.p261.x = initPos.p261.x; targets.p2711.x = initPos.p2711.x; targets.p2711.y = initPos.p2711.y; break;
        case 17: targets.p481.z = initPos.p481.z; break;
        case 18: targets.p291.y = initPos.p291.y - 0.03; break;
        case 19: break;
        case 20: targets.p291.y = initPos.p291.y; targets.p481.y = initPos.p481.y + 0.03; break;
        case 21: 
            targets.p291.rotY = initRot.p291.y + Math.PI; targets.p481.rotY = initRot.p481.y + Math.PI;
            targets.p291.y = initPos.p291.y - 0.03; targets.p481.y = initPos.p481.y; 
            dx = (initPos.p481.x - 0.43) - initPos.p291.x; dz = initPos.p481.z - initPos.p291.z;
            targets.p481.x = initPos.p291.x - dx; targets.p481.z = initPos.p291.z - dz;
            break;
        case 22: break;
        case 23: targets.p291.y = initPos.p291.y; break;
        case 24: targets.p291.rotY = initRot.p291.y; break;
        case 30: targets.p101.x = initPos.p101.x - 0.153; targets.p9011.x = initPos.p9011.x - 0.153; break;
        case 31: targets.p101.y = initPos.p101.y - 0.065; break;
        case 32: break;
        case 33: targets.p101.y = initPos.p101.y; targets.p481.y = initPos.p481.y + 0.065; break;
        case 34: targets.p101.x = initPos.p101.x; targets.p9011.x = initPos.p9011.x; targets.p481.x = initPos.p481.x + 0.153; break;
        case 35: targets.p101.y = initPos.p101.y - 0.065; targets.p481.y = initPos.p481.y; break;
        case 36: break;
        case 37: targets.p101.y = initPos.p101.y; break;
    }
}

const lerpLinear = (start, end, progress) => start + (end - start) * progress;

function animate() {
    requestAnimationFrame(animate);

    let now = performance.now();
    let elapsed = now - animationStartTime;

    if (parts.p481 && parts.p101) {
        let progress = currentAnimDurationMs > 0 ? elapsed / currentAnimDurationMs : 1;
        progress = Math.min(Math.max(progress, 0), 1); 

        // 預設進度變數
        let rotProgress = progress;
        let yProgress = progress;

        // ⚡ 將 S21 拆分為兩階段：前半段旋轉 (rotProgress)，後半段下降 (yProgress)
        if (currentPLCState === 21) {
            rotProgress = Math.min(progress * 2, 1);       // 0.0 ~ 0.5 期間完成 0->1
            yProgress = Math.max((progress - 0.5) * 2, 0); // 0.5 ~ 1.0 期間完成 0->1
            
            let currentRotY = lerpLinear(startPos.p291.rotY, targets.p291.rotY, rotProgress);
            let relativeAngle = currentRotY - initRot.p291.y;
            let dx = (initPos.p481.x - 0.43) - initPos.p291.x; 
            let dz = initPos.p481.z - initPos.p291.z;
            parts.p481.position.x = initPos.p291.x + (dx * Math.cos(relativeAngle) + dz * Math.sin(relativeAngle));
            parts.p481.position.z = initPos.p291.z + (-dx * Math.sin(relativeAngle) + dz * Math.cos(relativeAngle));
            parts.p481.position.y = lerpLinear(startPos.p481.y, targets.p481.y, yProgress);
            parts.p481.rotation.y = lerpLinear(startPos.p481.rotY, targets.p481.rotY, rotProgress);
        } else {
            parts.p481.position.x = lerpLinear(startPos.p481.x, targets.p481.x, progress);
            parts.p481.position.y = lerpLinear(startPos.p481.y, targets.p481.y, progress);
            parts.p481.position.z = lerpLinear(startPos.p481.z, targets.p481.z, progress);
            parts.p481.rotation.y = lerpLinear(startPos.p481.rotY, targets.p481.rotY, progress);
        }

        parts.p261.position.x = lerpLinear(startPos.p261.x, targets.p261.x, progress);
        parts.p2711.position.x = lerpLinear(startPos.p2711.x, targets.p2711.x, progress);
        parts.p2711.position.y = lerpLinear(startPos.p2711.y, targets.p2711.y, progress);
        
        // ⚡ 將 p291 的 Y 軸與旋轉也套用我們分開的進度
        parts.p291.position.y = lerpLinear(startPos.p291.y, targets.p291.y, yProgress);
        parts.p291.rotation.y = lerpLinear(startPos.p291.rotY, targets.p291.rotY, rotProgress);
        
        parts.p101.position.x = lerpLinear(startPos.p101.x, targets.p101.x, progress);
        parts.p101.position.y = lerpLinear(startPos.p101.y, targets.p101.y, progress);
        parts.p9011.position.x = lerpLinear(startPos.p9011.x, targets.p9011.x, progress);
    }

    controls.update();
    renderer.render(scene, camera);
}

// 啟動時直接自動輪詢 (每 100ms 抓一次 state)
setInterval(fetchPLCData, 100);

animate();
loadModels(['../生產線.glb']);