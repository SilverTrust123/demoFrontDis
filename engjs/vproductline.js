import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Actual default values read from image (unit: seconds) ---
const DEFAULT_PARAMS = {
    "T14": 5.0, "T0": 0.5, "T7": 1.0,
    "T30": 1.0, "T3": 1.0, "T4": 1.0, "T31": 1.0, "T5": 1.0, "T6": 1.0, "T15": 5.0,
    "T8": 1.0, "T9": 1.0, "T32": 1.0, "T10": 1.0, "T11": 1.0,
    "T40": 1.0, "T12": 1.0, "T13": 1.0
};

// --- 1. PLC State Dictionary ---
const PLC_STATES = {
    1:  { text: "S1 Waiting for Material", animTime: 1.62, waitParam: "T14" },
    10: { text: "S10 Gantry Pre-positioning Right", animTime: 3.68, waitParam: "T30" },
    11: { text: "S11 Gantry Pre-positioning Down", animTime: 1.27, waitParam: "T3" },
    12: { text: "S12 Clamping Workpiece, Gantry Up", animTime: 2.47, waitParam: "T4" },
    13: { text: "S13 Gantry Moving Left", animTime: 4.64, waitParam: "T31" },
    14: { text: "S14 Gantry Moving Down", animTime: 2.36, waitParam: "T5" },
    15: { text: "S15 Releasing Gripper", animTime: 0.17, waitParam: "T6" },
    16: { text: "S16 Gantry Moving Up", animTime: 1.56, waitParam: "T15" },
    17: { text: "S17 Conveyor Belt 2", animTime: 1.21, waitParam: "T7" },
    18: { text: "S18 Rotary Arm Moving Down", animTime: 0.62, waitParam: "T8" },
    19: { text: "S19 Vacuum Suction Workpiece", animTime: 0.49, waitParam: "T9" },
    20: { text: "S20 Suction Cup Moving Up", animTime: 0.10, waitParam: "T32" }, 
    21: { text: "S21 Suction Cup Rotating Down", animTime: 1.62, waitParam: "T10" },
    22: { text: "S22 Releasing Vacuum", animTime: 0.10, waitParam: "T11" },
    23: { text: "S23 Suction Cup Moving Up", animTime: 0.59 }, 
    24: { text: "S24 Suction Cup Homing", animTime: 0.83 },
    30: { text: "S30 Slide Table Moving Left", animTime: 1.00 },
    31: { text: "S31 Slide Table Moving Down", animTime: 0.20, waitParam: "T40" },
    32: { text: "S32 Clamping Workpiece", animTime: 0.30, waitParam: "T12" },
    33: { text: "S33 Slide Table Moving Up", animTime: 0.5 },
    34: { text: "S34 Slide Table Moving Right", animTime: 1.00 },
    35: { text: "S35 Slide Table Moving Down", animTime: 0.50 },
    36: { text: "S36 Releasing Workpiece", animTime: 0.30, waitParam: "T13" },
    37: { text: "S37 Slide Table Moving Up", animTime: 0.5 },
    50: { text: "S50 Emergency Stop", animTime: 0.1 } 
};

// ⚡ Define sequence ahead of time for capacity calculation
const seqMetalFull = [1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const seqNonMetalFull = [1, 30, 31, 32, 33, 34, 35, 36, 37];

// --- 2. UI Parameter Group Configurations ---
const UI_GROUPS = [
    { name: "Conveyor Belt 1", items: [{ id: "T14", label: "Material Wait Time" }, { id: "T0",  label: "Conveyor Stop Time" }] },
    { name: "Conveyor Belt 2", items: [{ id: "T7",  label: "Material Sensing Delay" }] },
    { name: "Gantry", items: [
        { id: "T30", label: "Robotic Arm Down Wait Time" }, { id: "T3",  label: "Robotic Arm Down Ensure Time" },
        { id: "T4",  label: "Workpiece Clamp Wait Time" }, { id: "T31", label: "Robotic Arm Left Stop Time" },
        { id: "T5",  label: "Robotic Arm Down Stop Time" }, { id: "T6",  label: "Release Wait Time" },
        { id: "T15", label: "Homing Wait Time" }
    ]},
    { name: "Rotary Cylinder", items: [
        { id: "T8",  label: "Robotic Arm Down Stop Time" }, { id: "T9",  label: "Vacuum Wait Time" },
        { id: "T32", label: "Rotation Wait Time" }, { id: "T10", label: "Robotic Arm Down Wait Time" },
        { id: "T11", label: "Vacuum Release Wait Time" }
    ]},
    { name: "Slide Table Cylinder", items: [
        { id: "T40", label: "Robotic Arm Down Stop Time" }, { id: "T12", label: "Gripper Clamp Wait Time" },
        { id: "T13", label: "Workpiece Drop Wait Time" }
    ]}
];

// --- 3. UI Generation & Variable Management Logic ---
const controllers = {}; 
const saveBar = document.getElementById('save-bar');
const paramContainer = document.getElementById('parameters-container');

// ⚡ Core Algorithm: Accurately calculate cycle time based on animation time and wait time for steps S1~S24
function calculateCycleTime(useCurrent = false) {
    let totalTime = 0;
    seqMetalFull.forEach(state => {
        const step = PLC_STATES[state];
        if (step) {
            totalTime += step.animTime || 0; // Add mechanical hardware action time
            
            if (step.waitParam && controllers[step.waitParam]) {
                // If in preview mode, read 'current' parameter being adjusted; if real production capacity, read machine's 'original' value
                let waitSec = useCurrent ? controllers[step.waitParam].current : controllers[step.waitParam].original;
                if (waitSec < 99) { // Error prevention: value >= 99 indicates machine downtime wait, excluded from normal calculation
                    totalTime += waitSec;
                }
            }
        }
    });
    return totalTime;
}

// ⚡ Update "Actual UPH" in top-left corner
function updateUPH() {
    let cycleTime = calculateCycleTime(false); // Calculate using 'original'
    let currentUPH = cycleTime > 0 ? Math.round(3600 / cycleTime) : 0;
    const uphElement = document.getElementById('current-uph');
    if (uphElement) uphElement.innerText = currentUPH;
}

// ⚡ On load, fetch real data directly from the physical PLC as initial values
async function fetchInitialPLCData() {
    try {
        const res = await fetch('http://192.168.3.85:9090/plc/AllDPointData');
        if (res.ok) {
            const json = await res.json();
            const data = json.reply || json;
            
            for (let key in data) {
                if (controllers[key] !== undefined) {
                    let sec = data[key] / 10;
                    controllers[key].original = sec;
                    controllers[key].current = sec;
                    updateUIBox(key);
                }
            }
            updateUPH(); // Recalculate capacity after fetching data
        }
    } catch (e) {
        console.warn("Unable to fetch initial PLC data. Displaying default values instead.", e);
        updateUPH();
    }
}

function buildUI() {
    let html = '';
    UI_GROUPS.forEach(group => {
        html += `<div class="param-group"><div class="group-title">${group.name}</div>`;
        group.items.forEach(item => {
            let initVal = DEFAULT_PARAMS[item.id] !== undefined ? DEFAULT_PARAMS[item.id] : 1.0;
            html += `
                <div class="param-row">
                    <div class="param-label">${item.label}</div>
                    <div class="param-controls">
                        <button onclick="adjustValue('${item.id}', -0.5)">-</button>
                        <div class="param-value" id="val-${item.id}">${initVal.toFixed(1)}s</div>
                        <button onclick="adjustValue('${item.id}', 0.5)">+</button>
                    </div>
                </div>`;
            controllers[item.id] = { original: initVal, current: initVal };
        });
        html += `</div>`;
    });
    paramContainer.innerHTML = html;
}

window.adjustValue = function(id, delta) {
    let ctrl = controllers[id];
    let nextVal = Math.round((ctrl.current + delta) * 10) / 10;
    if (nextVal >= 0) {
        ctrl.current = nextVal;
        updateUIBox(id);
        checkChanges();
    }
};

function updateUIBox(id) {
    const el = document.getElementById(`val-${id}`);
    if(!el) return;
    let ctrl = controllers[id];
    el.textContent = `${ctrl.current.toFixed(1)}s`;
    if (ctrl.current !== ctrl.original) {
        el.classList.add('changed');
    } else {
        el.classList.remove('changed');
    }
}

function checkChanges() {
    let changedCount = 0;
    for (let id in controllers) {
        if (controllers[id].current !== controllers[id].original) changedCount++;
    }
    if (changedCount > 0) {
        // ⚡ Real-time preview: Predict UPH based on modified parameters
        let newCycleTime = calculateCycleTime(true); 
        let newUPH = newCycleTime > 0 ? Math.round(3600 / newCycleTime) : 0;
        
        document.getElementById('new-uph').innerText = newUPH;
        saveBar.classList.add('show');
    } else {
        saveBar.classList.remove('show');
    }
}

document.getElementById('save-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-btn');
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
        // Offline simulation: Short wait to mimic saving process without sending network requests
        await new Promise(r => setTimeout(r, 400)); 
        
        for (let id in controllers) {
            if(controllers[id].current !== controllers[id].original){
                controllers[id].original = controllers[id].current; 
                updateUIBox(id); 
            }
        }
        
        updateUPH(); // Refresh official top-left capacity display after confirming changes
        checkChanges(); 

    } finally {
        btn.textContent = "Confirm Save";
        btn.disabled = false;
    }
});


// ==========================================
// 4. 3D Basic Setup and Model Loading
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
let animationStartTime = 0; 
let currentAnimDurationMs = 1000; 
let currentWaitDurationMs = 0;    

let isSimulating = false;
let simTimeout = null;
let simIndex = 0;
let activeSequence = []; 

async function loadModels(fileList) {
    const badge = document.getElementById('production-badge');
    if (badge) badge.innerText = `Loading 3D Models...`;
    
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
                    if (child.name === '零件482') child.visible = false; // Part 482

                    if (child.name === '零件261') { parts.p261 = child; child.position.x += p_X_OFFSET; initPos.p261 = child.position.clone(); targets.p261 = { ...initPos.p261 }; } // Part 261
                    if (child.name === '零件27-11') { parts.p2711 = child; child.position.x += p_X_OFFSET; initPos.p2711 = child.position.clone(); targets.p2711 = { ...initPos.p2711 }; } // Part 27-11
                    if (child.name === '零件291') { parts.p291 = child; child.position.y += p291_Y_OFFSET; initPos.p291 = child.position.clone(); initRot.p291 = child.rotation.clone(); targets.p291 = { x: child.position.x, y: child.position.y, z: child.position.z, rotY: child.rotation.y }; } // Part 291
                    if (child.name === '零件101') { parts.p101 = child; child.position.x += p101_X_OFFSET; child.position.y += p101_Y_OFFSET; initPos.p101 = child.position.clone(); targets.p101 = { ...initPos.p101 }; } // Part 101
                    if (child.name === '零件9-011' || child.name === '零件9011') { parts.p9011 = child; child.position.x += p9011_X_OFFSET; child.position.y += p9011_Y_OFFSET; initPos.p9011 = child.position.clone(); targets.p9011 = { ...initPos.p9011 }; } // Part 9-011 / 9011
                    if (child.name === '零件12-11' || child.name === '零件1211') { parts.p1211 = child; child.position.x += p1211_X_OFFSET; child.position.z += p1211_Z_OFFSET; initPos.p1211 = child.position.clone(); targets.p1211 = { ...initPos.p1211 }; } // Part 12-11 / 1211
                    if (child.name === '零件481') { parts.p481 = child; child.position.z += p481_Z_OFFSET; initPos.p481 = child.position.clone(); initRot.p481 = child.rotation.clone(); targets.p481 = { x: child.position.x, y: child.position.y, z: child.position.z, rotY: child.rotation.y }; } // Part 481
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
// 5. Offline Simulation & Animation Dispatch Logic
// ==========================================
let stateQueue = [];
let lastQueuedState = -1;

function updateStateTargets(s) {
    let pendingState = -1;
    if (!isSimulating && currentPLCState === 16 && s === 17) {
        let elapsed = performance.now() - animationStartTime;
        let requiredTime = currentAnimDurationMs + currentWaitDurationMs;
        if (elapsed < requiredTime) { pendingState = 17; return; }
    }
    if (s !== 17 && pendingState !== -1) pendingState = -1;
    
    currentPLCState = s;

    let animTimeSec = PLC_STATES[s]?.animTime || 1.0;
    
    // ⚡ Directly read user configured value in simulation mode
    let waitTimeSec = 0;
    let waitParamName = PLC_STATES[s]?.waitParam;
    if (waitParamName && controllers[waitParamName]) {
        waitTimeSec = controllers[waitParamName].current; 
    }

    currentAnimDurationMs = animTimeSec * 1000;
    currentWaitDurationMs = waitTimeSec * 1000;
    
    let totalTimeSec = (currentAnimDurationMs + currentWaitDurationMs) / 1000;
    animationStartTime = performance.now();

    if(parts.p481 && parts.p101) {
        startPos.p481 = { x: parts.p481.position.x, y: parts.p481.position.y, z: parts.p481.position.z, rotY: parts.p481.rotation.y };
        startPos.p261 = { x: parts.p261.position.x, y: parts.p261.position.y, z: parts.p261.position.z };
        startPos.p2711 = { x: parts.p2711.position.x, y: parts.p2711.position.y, z: parts.p2711.position.z };
        startPos.p291 = { x: parts.p291.position.x, y: parts.p291.position.y, z: parts.p291.position.z, rotY: parts.p291.rotation.y };
        startPos.p101 = { x: parts.p101.position.x, y: parts.p101.position.y, z: parts.p101.position.z };
        startPos.p9011 = { x: parts.p9011.position.x, y: parts.p9011.position.y, z: parts.p9011.position.z };
        if (parts.p1211) startPos.p1211 = { x: parts.p1211.position.x, y: parts.p1211.position.y, z: parts.p1211.position.z };
    }

    const stateBox = document.getElementById('dt-state-text');
    const timeBox = document.getElementById('dt-state-time');
    if (PLC_STATES[s]) {
        stateBox.innerText = PLC_STATES[s].text;
        stateBox.style.color = "#00ff88";
        timeBox.innerHTML = `Move: <span style="color:#00ff88">${(currentAnimDurationMs/1000).toFixed(2)}s</span> | Wait: <span style="color:#ffaa00">${(currentWaitDurationMs/1000).toFixed(2)}s</span><br>Total Execution: ${totalTimeSec.toFixed(2)}s`;
    }

    if(!parts.p481) return;
    let dx = 0, dz = 0;

    switch (s) {
        case 1: 
            parts.p481.position.set(initPos.p481.x, initPos.p481.y, initPos.p481.z); parts.p481.rotation.y = initRot.p481.y;
            parts.p261.position.copy(initPos.p261); parts.p2711.position.copy(initPos.p2711);
            parts.p291.position.copy(initPos.p291); parts.p291.rotation.y = initRot.p291.y;
            parts.p101.position.copy(initPos.p101); parts.p9011.position.copy(initPos.p9011);

            startPos.p481 = { x: initPos.p481.x, y: initPos.p481.y, z: initPos.p481.z, rotY: initRot.p481.y };
            startPos.p261 = { x: initPos.p261.x, y: initPos.p261.y, z: initPos.p261.z };
            startPos.p2711 = { x: initPos.p2711.x, y: initPos.p2711.y, z: initPos.p2711.z };
            startPos.p291 = { x: initPos.p291.x, y: initPos.p291.y, z: initPos.p291.z, rotY: initRot.p291.y };
            startPos.p101 = { x: initPos.p101.x, y: initPos.p101.y, z: initPos.p101.z };
            startPos.p9011 = { x: initPos.p9011.x, y: initPos.p9011.y, z: initPos.p9011.z };

            targets.p481 = { x: initPos.p481.x, y: initPos.p481.y, z: initPos.p481.z - 0.25, rotY: initRot.p481.y };
            targets.p261 = { ...startPos.p261 }; targets.p2711 = { ...startPos.p2711 }; targets.p291 = { ...startPos.p291 };
            targets.p101 = { ...startPos.p101 }; targets.p9011 = { ...startPos.p9011 };
            break;
        case 10: targets.p261.x = initPos.p261.x + 0.43; targets.p2711.x = initPos.p2711.x + 0.43; break;
        case 11: targets.p2711.y = initPos.p2711.y - 0.045; break;
        case 12: targets.p2711.y = initPos.p2711.y; targets.p481.y = initPos.p481.y + 0.045; break;
        case 13: targets.p261.x = initPos.p261.x; targets.p2711.x = initPos.p2711.x; targets.p481.x = initPos.p481.x - 0.43; break;
        case 14: targets.p2711.y = initPos.p2711.y - 0.045; targets.p481.y = initPos.p481.y; break;
        case 15: targets.p2711.y = initPos.p2711.y; break;
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
        case 33: targets.p101.y = initPos.p101.y; targets.p481.y = targets.p481.y + 0.065; break;
        case 34: targets.p101.x = initPos.p101.x; targets.p9011.x = initPos.p9011.x; targets.p481.x = targets.p481.x + 0.153; break;
        case 35: targets.p101.y = initPos.p101.y - 0.065; targets.p481.y = targets.p481.y - 0.065; break;
        case 36: break;
        case 37: targets.p101.y = initPos.p101.y; break;
    }
}

document.getElementById('btn-sim-metal').addEventListener('click', (e) => {
    if (!parts.p481) return alert("Please wait for the model to finish loading!");
    const btn = e.target;
    
    if (isSimulating && activeSequence === seqMetalFull) {
        isSimulating = false;
        btn.classList.remove('active');
        btn.innerText = "▶ Simulate Metal Line";
        clearTimeout(simTimeout);
    } else {
        isSimulating = true;
        activeSequence = seqMetalFull;
        simIndex = 0;
        btn.classList.add('active');
        btn.innerText = "⏹ Stop Metal Simulation";
        
        document.getElementById('btn-sim-nonmetal').classList.remove('active');
        document.getElementById('btn-sim-nonmetal').innerText = "▶ Simulate Non-Metal Line";
        
        clearTimeout(simTimeout);
        runSimulationStep();
    }
});

document.getElementById('btn-sim-nonmetal').addEventListener('click', (e) => {
    if (!parts.p481) return alert("Please wait for the model to finish loading!");
    const btn = e.target;

    if (isSimulating && activeSequence === seqNonMetalFull) {
        isSimulating = false;
        btn.classList.remove('active');
        btn.innerText = "▶ Simulate Non-Metal Line";
        clearTimeout(simTimeout);
    } else {
        isSimulating = true;
        activeSequence = seqNonMetalFull;
        simIndex = 0;
        btn.classList.add('active');
        btn.innerText = "⏹ Stop Non-Metal Simulation";
        
        document.getElementById('btn-sim-metal').classList.remove('active');
        document.getElementById('btn-sim-metal').innerText = "▶ Simulate Metal Line";
        
        clearTimeout(simTimeout);
        runSimulationStep();
    }
});

function runSimulationStep() {
    if (!isSimulating) return;
    updateStateTargets(activeSequence[simIndex]);
    let totalDurationMs = currentAnimDurationMs + currentWaitDurationMs;
    simTimeout = setTimeout(() => {
        simIndex++;
        if (simIndex >= activeSequence.length) simIndex = 0; 
        runSimulationStep();
    }, totalDurationMs);
}

const lerpLinear = (start, end, progress) => start + (end - start) * progress;

function animate() {
    requestAnimationFrame(animate);

    let now = performance.now();
    let elapsed = now - animationStartTime;
    let requiredTime = currentAnimDurationMs + currentWaitDurationMs;

    if (parts.p481 && parts.p101) {
        let progress = currentAnimDurationMs > 0 ? elapsed / currentAnimDurationMs : 1;
        progress = Math.min(Math.max(progress, 0), 1); 

        if (currentPLCState >= 19 && currentPLCState <= 22) {
            let currentRotY = lerpLinear(startPos.p291.rotY, targets.p291.rotY, progress);
            let relativeAngle = currentRotY - initRot.p291.y;
            let dx = (initPos.p481.x - 0.43) - initPos.p291.x; 
            let dz = initPos.p481.z - initPos.p291.z;
            parts.p481.position.x = initPos.p291.x + (dx * Math.cos(relativeAngle) + dz * Math.sin(relativeAngle));
            parts.p481.position.z = initPos.p291.z + (-dx * Math.sin(relativeAngle) + dz * Math.cos(relativeAngle));
            parts.p481.position.y = lerpLinear(startPos.p481.y, targets.p481.y, progress);
            parts.p481.rotation.y = lerpLinear(startPos.p481.rotY, targets.p481.rotY, progress);
        } else {
            parts.p481.position.x = lerpLinear(startPos.p481.x, targets.p481.x, progress);
            parts.p481.position.y = lerpLinear(startPos.p481.y, targets.p481.y, progress);
            parts.p481.position.z = lerpLinear(startPos.p481.z, targets.p481.z, progress);
            parts.p481.rotation.y = lerpLinear(startPos.p481.rotY, targets.p481.rotY, progress);
        }

        parts.p261.position.x = lerpLinear(startPos.p261.x, targets.p261.x, progress);
        parts.p2711.position.x = lerpLinear(startPos.p2711.x, targets.p2711.x, progress);
        parts.p2711.position.y = lerpLinear(startPos.p2711.y, targets.p2711.y, progress);
        parts.p291.position.y = lerpLinear(startPos.p291.y, targets.p291.y, progress);
        parts.p291.rotation.y = lerpLinear(startPos.p291.rotY, targets.p291.rotY, progress);
        parts.p101.position.x = lerpLinear(startPos.p101.x, targets.p101.x, progress);
        parts.p101.position.y = lerpLinear(startPos.p101.y, targets.p101.y, progress);
        parts.p9011.position.x = lerpLinear(startPos.p9011.x, targets.p9011.x, progress);
    }

    controls.update();
    renderer.render(scene, camera);
}

// ⚡ Build UI first, then fetch API data on startup
buildUI();
fetchInitialPLCData();
animate();
loadModels(['../生產線.glb']); // Production line GLB