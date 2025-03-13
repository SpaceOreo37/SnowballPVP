import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import GameMap from './js/map.js';

// Game constants
const COLLISION_GROUPS = {
    TERRAIN: 1,
    PLAYER: 2,
    SNOWBALL: 4
};

// Add custom gravity for player
const PLAYER_GRAVITY = -15; // Stronger gravity for player (default was -9.82)

// Initialize Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4488ff); // Deeper blue for sky
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Add lights
const ambientLight = new THREE.AmbientLight(0x6688cc, 0.5);
scene.add(ambientLight);

// Create sun visualization
const sunGeometry = new THREE.SphereGeometry(15, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffbb, // Slightly less yellow, more white
    transparent: true,
    opacity: 0.4, // More transparent
    fog: false // Make sun unaffected by fog
});
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
// Position sun near one of the walls for better shadow casting
sunMesh.position.set(-150, 200, -150);
// Create a glow effect around the sun
const sunGlowGeometry = new THREE.SphereGeometry(25, 32, 32);
const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffee,
    transparent: true,
    opacity: 0.15,
    fog: false,
    side: THREE.BackSide
});
const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
sunMesh.add(sunGlow);
scene.add(sunMesh);

// Create a more powerful directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.copy(sunMesh.position);
directionalLight.castShadow = true;

// Adjust shadow camera to match new sun position
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -250;
directionalLight.shadow.camera.right = 250;
directionalLight.shadow.camera.top = 250;
directionalLight.shadow.camera.bottom = -250;
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.normalBias = 0.02;

// Create a target for the directional light
const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, 0);
scene.add(lightTarget);
directionalLight.target = lightTarget;

scene.add(directionalLight);

// Add a subtle hemisphere light for better ambient lighting
const hemisphereLight = new THREE.HemisphereLight(0x6688cc, 0x998877, 0.6);
scene.add(hemisphereLight);

// Uncomment these lines for debugging shadow camera
// const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
// scene.add(helper);

// Initialize physics world
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});

// Improve physics simulation
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 10;
world.defaultContactMaterial = new CANNON.ContactMaterial(
    new CANNON.Material(),
    new CANNON.Material(),
    {
        friction: 0.1,
        restitution: 0.7
    }
);

// Initialize socket.io
const socket = io();

// Create screen flash overlay for hit effect
const screenFlashGeometry = new THREE.PlaneGeometry(2, 2);
const screenFlashOverlay = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0,
    depthTest: false
});
const screenFlash = new THREE.Mesh(screenFlashGeometry, screenFlashOverlay);
screenFlash.position.z = -1;
camera.add(screenFlash);
scene.add(camera);

// Game constants
const SNOWBALL_RADIUS = 0.15;
const PLAYER_HEIGHT = 2;
const CROUCHED_HEIGHT = 1; // Height when crouching
const MOVEMENT_SPEED = 8;  // Base movement speed for all players
const SPRINT_SPEED = 14;   // Sprint speed for all players
const CROUCH_SPEED = 4; // Speed while crouching
const ACCELERATION = 120;   // Higher acceleration
const AIR_ACCELERATION = 30;  // Better air control
const MAX_VELOCITY = 25;    // Higher max velocity
const GROUND_FRICTION = 0.05;  // Much lower ground friction
const AIR_FRICTION = 0.01;   // Lower air friction
const THROW_FORCE = 30;
const MOUSE_SENSITIVITY = 0.001;
const JUMP_FORCE = 8;  // Slightly stronger jump
const JUMP_COOLDOWN = 500;
const SNOWBALL_SPEED = 50; // Increased speed
const SNOWBALL_GRAVITY = -4.91; // Reduced gravity effect
const MAX_SNOWBALL_DISTANCE = 100;
const HIT_COOLDOWN = 500;
const THROW_FORCE_UPWARD = 0.03; // Slight upward angle for better trajectory
const MAX_HEALTH = 100;
const DAMAGE_PER_HIT = 30;
const RESPAWN_DELAY = 5000; // 5 seconds in milliseconds

// Sprint meter constants
const MAX_SPRINT_DURATION = 5000; // 5 seconds in milliseconds
const SPRINT_METER_WIDTH = 400; // Doubled from 200
const SPRINT_METER_HEIGHT = 40; // Doubled from 20

// Arena constants
const ARENA_SIZE = 220; // Changed to match actual playable area
const SAFE_SPAWN_MARGIN = 20;
const SPAWN_POSITIONS = [
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN }, // Main quadrant 4 position
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*2, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN }, // Slightly to the left
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*2 }, // Slightly forward
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*1.5, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*1.5 } // Diagonal inward
];

// Add new constants for snowball system
const MAX_SNOWBALLS = 10;
const RELOAD_TIME = 3000; // 3 seconds in milliseconds

// Player variables
let playerBody;
let playerMesh;
let players = new Map();
let snowballs = [];
let health = MAX_HEALTH;
let isAlive = true;
let isGameStarted = false;
let canJump = true;
let isOnGround = false;
let firstPersonArm = null;
let heldSnowball = null;
let screenFlashMaterial = null;
let isHit = false;
let isDead = false;
let isCrouching = false;
let isSprinting = false;
let sprintMeter = MAX_SPRINT_DURATION;
let lastSprintTime = 0;
let isSprintExhausted = false;
let wasSprintingBeforeJump = false;
let respawnCountdown = 5;
let respawnTimer = null;

// Controls
const keys = { w: false, a: false, s: false, d: false, e: false, ' ': false, Shift: false, q: false };
let mouseX = 0;
let mouseY = 0;
let canThrow = true;

// Add after world initialization
// Create shared materials for better collision handling
const terrainMaterial = new CANNON.Material('terrain');
const playerMaterial = new CANNON.Material('player');
const snowballMaterial = new CANNON.Material('snowball');

// Set up contact materials with better physics values
const terrainSnowballContact = new CANNON.ContactMaterial(terrainMaterial, snowballMaterial, {
    friction: 0.1,
    restitution: 0.8,  // More bounce for snowballs
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e8,
    frictionEquationRegularizationTime: 3
});

const terrainPlayerContact = new CANNON.ContactMaterial(terrainMaterial, playerMaterial, {
    friction: 0.0001,  // Extremely low friction to prevent sticking
    restitution: 0.0,  // No bounce for players
    contactEquationStiffness: 1e9,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e9,
    frictionEquationRegularizationTime: 3,
    contactEquationRegularizationTime: 3
});

world.addContactMaterial(terrainSnowballContact);
world.addContactMaterial(terrainPlayerContact);

// Create ground with better collision setup
const groundGeometry = new THREE.BoxGeometry(400, 1, 400);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    roughness: 0.9,
    metalness: 0.0
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.set(0, -0.5, 0);
ground.receiveShadow = true;
scene.add(ground);

// Add ground physics body with improved collision setup
const groundShape = new CANNON.Plane(); // Use plane for better physics collision
const groundBody = new CANNON.Body({
    mass: 0,
    shape: groundShape,
    material: terrainMaterial,
    collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
    collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL,
    position: new CANNON.Vec3(0, 0, 0)
});
// Rotate the ground plane to face upward
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Add invisible walls at the edges of the ground to prevent falling off
const createInvisibleWall = (pos, size) => {
    const wallShape = new CANNON.Box(size);
    const wallBody = new CANNON.Body({
        mass: 0,
        shape: wallShape,
        material: terrainMaterial,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL,
        position: pos
    });
    world.addBody(wallBody);
};

// Add invisible floor boundaries
createInvisibleWall(
    new CANNON.Vec3(0, -2, 0),
    new CANNON.Vec3(110, 2, 110)
);

// Add fog to create depth and hide the ground edges
scene.fog = new THREE.Fog(0x4488ff, 30, 120); // Increased near value from 20 to 30

// Initialize game map
const gameMap = new GameMap();

function createWall(x, y, width, height, depth) {
    // Create visual wall
    const wallGeometry = new THREE.BoxGeometry(width, height, depth);
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.2
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x + width/2, height/2, y + depth/2);
    // Boundary walls should not cast or receive shadows
    wall.castShadow = false;
    wall.receiveShadow = false;
    scene.add(wall);

    // Add physics body for wall
    const wallShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const wallBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: wallShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    wallBody.position.set(x + width/2, height/2, y + depth/2);
    world.addBody(wallBody);
}

function createFort() {
    const fortData = gameMap.fort;
    const fortGeometry = new THREE.BoxGeometry(fortData.width, 10, fortData.height);
    const fortMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC,
        roughness: 0.8,
        metalness: 0.1
    });
    const fort = new THREE.Mesh(fortGeometry, fortMaterial);
    fort.position.set(fortData.x + fortData.width/2, 5, fortData.y + fortData.height/2);
    fort.castShadow = true;
    fort.receiveShadow = true;
    scene.add(fort);

    // Create entrances with shadows
    fortData.entrances.forEach(entrance => {
        const entranceGeometry = new THREE.BoxGeometry(4, 6, 4);
        const entranceMesh = new THREE.Mesh(entranceGeometry, fortMaterial);
        entranceMesh.position.set(entrance.x, 3, entrance.y);
        entranceMesh.castShadow = true;
        entranceMesh.receiveShadow = true;
        scene.add(entranceMesh);
    });

    // Add physics body for fort
    const fortShape = new CANNON.Box(new CANNON.Vec3(fortData.width/2, 5, fortData.height/2));
    const fortBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: fortShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    fortBody.position.set(fortData.x + fortData.width/2, 5, fortData.y + fortData.height/2);
    world.addBody(fortBody);
}

function createCoverSpot(coverData) {
    const coverGeometry = new THREE.BoxGeometry(coverData.width, 4, coverData.height);
    const coverMaterial = new THREE.MeshStandardMaterial({
        color: 0xA0A0A0,
        roughness: 0.9,
        metalness: 0.1
    });
    const cover = new THREE.Mesh(coverGeometry, coverMaterial);
    cover.position.set(coverData.x + coverData.width/2, 2, coverData.y + coverData.height/2);
    cover.castShadow = true;
    cover.receiveShadow = true;
    scene.add(cover);

    // Add physics body for cover
    const coverShape = new CANNON.Box(new CANNON.Vec3(coverData.width/2, 2, coverData.height/2));
    const coverBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: coverShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    coverBody.position.set(coverData.x + coverData.width/2, 2, coverData.y + coverData.height/2);
    world.addBody(coverBody);
}

function createTree(x, z) {
    // Create tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.5, 4, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4A2B0F,
        roughness: 0.9,
        metalness: 0.1
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 2, z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    // Create pine tree top (multiple cones for fuller look)
    const treeGroup = new THREE.Group();
    treeGroup.add(trunk);

    const coneGeometry1 = new THREE.ConeGeometry(2, 4, 8);
    const coneGeometry2 = new THREE.ConeGeometry(1.6, 3, 8);
    const coneGeometry3 = new THREE.ConeGeometry(1.2, 2, 8);
    const treeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0B4619,
        roughness: 0.8,
        metalness: 0.1
    });

    const cone1 = new THREE.Mesh(coneGeometry1, treeMaterial);
    cone1.position.set(x, 3, z);
    cone1.castShadow = true;
    cone1.receiveShadow = true;
    treeGroup.add(cone1);

    const cone2 = new THREE.Mesh(coneGeometry2, treeMaterial);
    cone2.position.set(x, 4.5, z);
    cone2.castShadow = true;
    cone2.receiveShadow = true;
    treeGroup.add(cone2);

    const cone3 = new THREE.Mesh(coneGeometry3, treeMaterial);
    cone3.position.set(x, 5.5, z);
    cone3.castShadow = true;
    cone3.receiveShadow = true;
    treeGroup.add(cone3);

    scene.add(treeGroup);

    // Add physics body for tree with much wider trunk
    const trunkShape = new CANNON.Cylinder(0.8, 0.9, 4, 8);
    const treeBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: trunkShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    treeBody.position.set(x, 2, z);
    world.addBody(treeBody);

    // Add much larger invisible collision for the pine part
    const pineShape = new CANNON.Cylinder(0.3, 3.0, 6, 8);
    const pineBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: pineShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    pineBody.position.set(x, 5, z);
    world.addBody(pineBody);
}

function createRock(x, z, scale = 1) {
    // Increase base size and add random variation
    const baseScale = scale * (2 + Math.random());
    const rockGeometry = new THREE.DodecahedronGeometry(1 * baseScale, 1);
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true
    });
    
    // Randomly rotate and scale the rock
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    // Position rock partially in ground (about 1/3 of its height)
    const rockHeight = baseScale * 0.66;
    rock.position.set(x, rockHeight, z);
    rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );
    // Add some random scaling variation to make rocks less uniform
    const scaleX = baseScale * (0.9 + Math.random() * 0.2);
    const scaleY = baseScale * (0.8 + Math.random() * 0.4);
    const scaleZ = baseScale * (0.9 + Math.random() * 0.2);
    rock.scale.set(scaleX, scaleY, scaleZ);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);

    // Create a collision box that fully encompasses the rock
    const collisionWidth = scaleX * 2.5;  // Much wider collision box
    const collisionHeight = scaleY * 2.5; // Much taller collision box
    const collisionDepth = scaleZ * 2.5;  // Much deeper collision box
    
    const collisionBox = new CANNON.Box(new CANNON.Vec3(
        collisionWidth,
        collisionHeight,
        collisionDepth
    ));

    const rockBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: collisionBox,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });

    // Position the collision box to be centered on the rock
    rockBody.position.set(x, rockHeight, z);
    rockBody.quaternion.copy(rock.quaternion);
    world.addBody(rockBody);

    // Add a debug visualization of the collision box if needed
    // Uncomment these lines to see the collision box
    /*
    const boxGeometry = new THREE.BoxGeometry(
        collisionWidth * 2,
        collisionHeight * 2,
        collisionDepth * 2
    );
    const boxMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    boxMesh.position.copy(rockBody.position);
    boxMesh.quaternion.copy(rockBody.quaternion);
    scene.add(boxMesh);
    */
}

// Modify the createEnvironment function
function createEnvironment() {
    // Create boundary walls
    gameMap.walls.forEach(wall => {
        createWall(wall.x, wall.y, wall.width, wall.height, wall.depth);
    });

    // Create fort
    createFort();

    // Create cover spots
    gameMap.coverSpots.forEach(cover => {
        createCoverSpot(cover);
    });

    // Create natural elements
    gameMap.naturalElements.forEach(element => {
        if (element.type === 'tree') {
            createTree(element.x, element.y);
        } else if (element.type === 'rock') {
            createRock(element.x, element.y);
        }
    });
}

// Call createEnvironment after creating the ground
createEnvironment();

// Modify player creation to use player material
function createPlayer(id, initialPosition) {
    // Create the character model with larger dimensions
    const upperBodyGeometry = new THREE.CapsuleGeometry(0.6, 0.8, 32);
    const lowerBodyGeometry = new THREE.CapsuleGeometry(0.7, 1.2, 32);
    const headGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const armGeometry = new THREE.CapsuleGeometry(0.25, 0.8, 16);
    
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.3
    });

    // Create body parts
    const upperBodyMesh = new THREE.Mesh(upperBodyGeometry, material);
    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeometry, material);
    const headMesh = new THREE.Mesh(headGeometry, material);
    const leftArmMesh = new THREE.Mesh(armGeometry, material);
    const rightArmMesh = new THREE.Mesh(armGeometry, material);
    
    // Position body parts
    upperBodyMesh.position.y = PLAYER_HEIGHT / 2 + 0.4;
    lowerBodyMesh.position.y = PLAYER_HEIGHT / 4;
    headMesh.position.y = PLAYER_HEIGHT / 2 + 1.2;
    
    leftArmMesh.position.set(-0.85, PLAYER_HEIGHT / 2 + 0.4, 0);
    rightArmMesh.position.set(0.85, PLAYER_HEIGHT / 2 + 0.4, 0);
    leftArmMesh.rotation.z = Math.PI / 3;
    rightArmMesh.rotation.z = -Math.PI / 3;
    
    // Create a group to hold all parts
    const playerGroup = new THREE.Group();
    playerGroup.add(upperBodyMesh);
    playerGroup.add(lowerBodyMesh);
    playerGroup.add(headMesh);
    playerGroup.add(leftArmMesh);
    playerGroup.add(rightArmMesh);

    // Add outline for other players
    if (id !== socket.id) {
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.BackSide
        });
        
        [upperBodyMesh, lowerBodyMesh, headMesh, leftArmMesh, rightArmMesh].forEach(mesh => {
            const outline = mesh.clone();
            outline.material = outlineMaterial;
            outline.scale.multiplyScalar(1.05);
            outline.position.copy(mesh.position);
            outline.rotation.copy(mesh.rotation);
            playerGroup.add(outline);
        });
        playerGroup.visible = true;
    } else {
        playerGroup.visible = false; // Hide local player model completely
    }

    playerGroup.castShadow = true;
    playerGroup.receiveShadow = true;
    
    const body = new CANNON.Body({
        mass: id === socket.id ? 1 : 0,
        shape: new CANNON.Cylinder(1.0, 1.0, PLAYER_HEIGHT, 8),
        position: new CANNON.Vec3(initialPosition.x, initialPosition.y, initialPosition.z),
        fixedRotation: true,
        material: playerMaterial,
        linearDamping: 0.0,
        angularDamping: 0.0,
        collisionFilterGroup: 2,
        collisionFilterMask: 1 | 2 | 4,
        gravity: new CANNON.Vec3(0, PLAYER_GRAVITY, 0)
    });

    if (id === socket.id) {
        playerBody = body;
        createFirstPersonArm();
    }

    world.addBody(body);
    scene.add(playerGroup);

    // Add hit effect material
    const hitMaterial = material.clone();
    hitMaterial.color.setHex(0xff0000);
    
    // Store reference to materials and meshes for hit effect
    const meshes = [upperBodyMesh, lowerBodyMesh, headMesh, leftArmMesh, rightArmMesh];
    const normalMaterials = meshes.map(mesh => mesh.material);
    
    // Store references to body parts for animation
    return { 
        mesh: playerGroup, 
        body, 
        meshes,
        materials: {
            normal: normalMaterials,
            hit: hitMaterial
        },
        isHit: false,
        bodyParts: {
            upper: upperBodyMesh,
            lower: lowerBodyMesh,
            head: headMesh,
            leftArm: leftArmMesh,
            rightArm: rightArmMesh
        }
    };
}

// Add this function after createPlayer
function createFirstPersonArm() {
    const armGroup = new THREE.Group();
    
    const armGeometry = new THREE.CapsuleGeometry(0.15, 0.7, 16);
    const armMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.3
    });
    
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    // Adjust arm position to better hold the snowball
    arm.position.set(0.4, -0.7, -0.4);  // Moved slightly forward
    arm.rotation.x = -Math.PI / 4;      // Angled more upward
    arm.rotation.y = Math.PI / 8;       // Slightly turned inward
    
    armGroup.add(arm);
    
    firstPersonArm = armGroup;
    camera.add(firstPersonArm);
    
    // Create held snowball after arm is initialized
    createHeldSnowball();
}

function createHeldSnowball() {
    if (!firstPersonArm || snowballCount <= 0 || isReloading) return;
    
    if (heldSnowball) {
        firstPersonArm.remove(heldSnowball);
    }
    
    const snowballGeometry = new THREE.SphereGeometry(SNOWBALL_RADIUS);
    const snowballMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });
    
    heldSnowball = new THREE.Mesh(snowballGeometry, snowballMaterial);
    heldSnowball.position.set(0.4, -0.25, -0.7);
    firstPersonArm.add(heldSnowball);
}

// Modify snowball creation to use snowball material
function createSnowball(position, direction) {
    const geometry = new THREE.SphereGeometry(SNOWBALL_RADIUS);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(position);
    scene.add(mesh);

    // Create physics body for snowball
    const shape = new CANNON.Sphere(SNOWBALL_RADIUS);
    const body = new CANNON.Body({
        mass: 0.1,
        shape: shape,
        material: snowballMaterial,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        collisionFilterGroup: COLLISION_GROUPS.SNOWBALL,
        collisionFilterMask: COLLISION_GROUPS.TERRAIN | COLLISION_GROUPS.PLAYER
    });

    // Only calculate velocity for locally thrown snowballs
    if (direction instanceof THREE.Vector3) {
        // Add slight upward angle to the throw
        direction.y += THROW_FORCE_UPWARD;
        direction.normalize();
        
        // Create velocity with proper speed
        const velocity = direction.multiplyScalar(SNOWBALL_SPEED);
        body.velocity.copy(velocity);
    }

    const snowball = {
        mesh,
        body,
        initialPosition: position.clone(),
        timeCreated: Date.now(),
        hasHit: false
    };
    snowballs.push(snowball);
    world.addBody(body);

    // Remove snowball after 3 seconds
    setTimeout(() => {
        const index = snowballs.indexOf(snowball);
        if (index > -1) {
            scene.remove(mesh);
            world.removeBody(body);
            snowballs.splice(index, 1);
        }
    }, 3000);

    return snowball;
}

// Update the checkSnowballHit function
function checkSnowballHit(snowball, player) {
    if (snowball.hasHit) return false;

    const snowballPos = snowball.body.position;
    const playerPos = player.body.position;
    
    // Check collision with player's body using physics engine
    const horizontalDist = Math.sqrt(
        Math.pow(snowballPos.x - playerPos.x, 2) + 
        Math.pow(snowballPos.z - playerPos.z, 2)
    );
    
    const verticalDist = Math.abs(snowballPos.y - (playerPos.y + PLAYER_HEIGHT/2));
    
    // Hit if within player's cylinder bounds with improved accuracy
    if (horizontalDist < 1.2 && verticalDist < PLAYER_HEIGHT) {  // Increased hit box size
        snowball.hasHit = true;
        return true;
    }
    
    return false;
}

// Update createHitEffect function
function createHitEffect(position) {
    const particles = new THREE.Group();
    const particleCount = 12;
    const particleGeometry = new THREE.SphereGeometry(0.05);
    const particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        
        // Random velocity for particles in all directions
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        particle.velocity = new THREE.Vector3(
            Math.sin(theta) * Math.cos(phi),
            Math.cos(theta),
            Math.sin(theta) * Math.sin(phi)
        ).multiplyScalar(3);
        
        particles.add(particle);
    }
    
    scene.add(particles);
    
    // Animate particles with fade out
    const startTime = Date.now();
    function animateParticles() {
        const elapsed = Date.now() - startTime;
        if (elapsed > 1000) {
            scene.remove(particles);
            return;
        }
        
        const opacity = 1 - (elapsed / 1000);
        particles.children.forEach(particle => {
            particle.position.add(particle.velocity.clone().multiplyScalar(0.016));
            particle.velocity.y -= 0.1; // Gravity
            particle.material.opacity = opacity;
        });
        
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

// Socket events
socket.on('currentPlayers', (playersList) => {
    playersList.forEach(playerInfo => {
        if (playerInfo.id !== socket.id) {
            players.set(playerInfo.id, createPlayer(playerInfo.id, playerInfo.position));
        }
    });
});

socket.on('newPlayer', (playerInfo) => {
    players.set(playerInfo.id, createPlayer(playerInfo.id, playerInfo.position));
});

socket.on('playerMoved', (data) => {
    const player = players.get(data.id);
    if (player) {
        player.body.position.copy(data.position);
        player.mesh.position.copy(data.position);
        player.body.quaternion.copy(data.rotation);
        player.mesh.quaternion.copy(data.rotation);
    }
});

socket.on('snowballThrown', (data) => {
    const snowballPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    const snowballVelocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z);
    const snowball = createSnowball(snowballPosition, snowballVelocity.normalize());
    
    // Set the initial velocity directly on the physics body
    snowball.body.velocity.set(
        data.velocity.x,
        data.velocity.y,
        data.velocity.z
    );
});

socket.on('playerHit', (data) => {
    const player = players.get(data.id);
    
    if (data.id === socket.id) {
        const oldHealth = health;
        health = data.health;
        console.log(`Hit taken! Damage: ${data.damage}, Old Health: ${oldHealth}, New Health: ${health}`);
        updateHealthDisplay();
        
        // Screen flash effect
        screenFlashOverlay.opacity = 0.3;
        setTimeout(() => {
            screenFlashOverlay.opacity = 0;
        }, 100);
    } else if (player) {
        // Hit effect for other players
        player.meshes.forEach((mesh) => {
            mesh.material = player.materials.hit;
        });
        
        setTimeout(() => {
            player.meshes.forEach((mesh, i) => {
                mesh.material = player.materials.normal[i];
            });
        }, 100);
    }
});

socket.on('playerDeath', (data) => {
    if (data.id === socket.id) {
        handleDeath();
    }
});

socket.on('playerRespawn', (data) => {
    const player = players.get(data.id);

    if (data.id === socket.id) {
        // Reset local player
        health = MAX_HEALTH; // Ensure health is set to max
        updateHealthDisplay();
        
        // Force position update for local player
        playerBody.position.copy(data.position);
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);
        camera.position.set(data.position.x, data.position.y + PLAYER_HEIGHT - 0.5, data.position.z);
        
        // Hide death overlay if it exists
        const deathOverlay = document.getElementById('deathOverlay');
        if (deathOverlay) {
            deathOverlay.style.display = 'none';
        }
        
        // Re-enable controls
        canThrow = true;
        canJump = true;
        isAlive = true;
        isDead = false;
    } else if (player) {
        // Reset other player
        player.body.position.copy(data.position);
        player.body.velocity.set(0, 0, 0);
        player.body.angularVelocity.set(0, 0, 0);
        player.mesh.position.copy(data.position);
    }
});

socket.on('playerDisconnected', (playerId) => {
    const player = players.get(playerId);
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
});

// Handle pointer lock
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        isGameStarted = true;
        document.getElementById('clickToStart').style.display = 'none';
        console.log('Game started - pointer locked');
    } else {
        isGameStarted = false;
        document.getElementById('clickToStart').style.display = 'block';
        console.log('Game paused - pointer unlocked');
    }
});

document.addEventListener('pointerlockerror', () => {
    console.error('Pointer lock error');
});

// Input handling
document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() in keys) {
        keys[event.key.toLowerCase()] = true;
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() in keys) {
        keys[event.key.toLowerCase()] = false;
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement) {
        mouseX -= e.movementX * MOUSE_SENSITIVITY;
        mouseY = Math.max(-Math.PI/2, Math.min(Math.PI/2, mouseY - e.movementY * MOUSE_SENSITIVITY));
    }
});

// Handle clicking
function startGame() {
    try {
        renderer.domElement.requestPointerLock();
        createScreenFlash();
        // Initialize the snowball meter
        updateSnowballMeter();
    } catch (error) {
        console.error('Error requesting pointer lock:', error);
    }
}

// Add new variables for snowball system
let snowballCount = MAX_SNOWBALLS;
let isReloading = false;
let reloadStartTime = 0;

// Add function to update snowball meter UI
function updateSnowballMeter() {
    const snowballCountElement = document.getElementById('snowballCount');
    let progressFill = document.getElementById('reloadProgressFill');
    const reloadProgress = document.getElementById('reloadProgress');
    
    // Create progress fill element if it doesn't exist
    if (!progressFill) {
        progressFill = document.createElement('div');
        progressFill.id = 'reloadProgressFill';
        reloadProgress.appendChild(progressFill);
    }
    
    // Update the text display
    snowballCountElement.textContent = `${snowballCount}/${MAX_SNOWBALLS}`;
    
    if (isReloading) {
        // During reload, animate the fill
        const progress = (Date.now() - reloadStartTime) / RELOAD_TIME;
        progressFill.style.width = `${progress * 100}%`;
        progressFill.style.backgroundColor = '#4CAF50'; // Green color during reload
    } else {
        // When not reloading, show remaining snowballs as bar length
        const remainingPercentage = (snowballCount / MAX_SNOWBALLS) * 100;
        progressFill.style.width = `${remainingPercentage}%`;
        progressFill.style.backgroundColor = snowballCount > 0 ? '#3498db' : '#e74c3c'; // Blue when has snowballs, red when empty
    }
}

// Add function to handle reload animation
function updateReloadAnimation() {
    if (!isReloading) return;
    
    const progress = (Date.now() - reloadStartTime) / RELOAD_TIME;
    
    if (progress >= 1) {
        isReloading = false;
        snowballCount = MAX_SNOWBALLS;
        updateSnowballMeter();
        createHeldSnowball();
    } else {
        updateSnowballMeter(); // Update the meter during reload animation
    }
}

// Add reload function
function startReload() {
    if (isReloading || snowballCount === MAX_SNOWBALLS) return;
    
    isReloading = true;
    reloadStartTime = Date.now();
    if (heldSnowball) {
        heldSnowball.visible = false;
    }
    updateSnowballMeter(); // Update the meter immediately when starting reload
}

// Modify the click event listener to check snowball count
document.addEventListener('click', (e) => {
    if (!isGameStarted) {
        startGame();
    } else if (canThrow && isAlive && !isDead && !isReloading && snowballCount > 0) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        
        // Create snowball slightly in front of the camera for better visibility
        const position = new THREE.Vector3();
        camera.getWorldPosition(position);
        position.add(direction.clone().multiplyScalar(2));
        
        // Hide held snowball during throw animation
        if (heldSnowball) {
            heldSnowball.visible = false;
        }
        
        // Create and throw snowball
        const snowball = createSnowball(position, direction);
        
        // Emit the exact velocity that was applied to the snowball
        socket.emit('throwSnowball', { 
            position: position,
            velocity: snowball.body.velocity
        });

        // Decrease snowball count and update UI
        snowballCount--;
        updateSnowballMeter();

        canThrow = false;
        setTimeout(() => {
            canThrow = true;
            if (!isReloading) {
                createHeldSnowball();
            }
        }, 500);
    }
});

// Add reload key listener
document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        startReload();
    }
});

function updateHealthDisplay() {
    document.getElementById('healthText').textContent = `${Math.max(0, health)}/${MAX_HEALTH}`;
    const healthBar = document.getElementById('healthBarFill');
    const healthPercentage = (Math.max(0, health) / MAX_HEALTH) * 100;
    healthBar.style.width = `${healthPercentage}%`;
    
    if (healthPercentage > 60) {
        healthBar.style.backgroundColor = '#2ecc71'; // Green
    } else if (healthPercentage > 30) {
        healthBar.style.backgroundColor = '#f1c40f'; // Yellow
    } else {
        healthBar.style.backgroundColor = '#e74c3c'; // Red
    }
}

function handleDeath() {
    isDead = true;
    isAlive = false;
    health = 0;
    updateHealthDisplay();
    
    // Show death overlay
    const deathOverlay = document.getElementById('deathOverlay');
    deathOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
    deathOverlay.style.display = 'flex';
    
    // Disable controls
    Object.keys(keys).forEach(key => keys[key] = false);
    canThrow = false;
    canJump = false;
    
    // Reset player state
    if (playerBody) {
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);
    }
}

function updateRespawnTimer() {
    document.getElementById('respawnTimer').textContent = respawnCountdown;
}

// Update the respawnPlayer function
function respawnPlayer(playerId) {
    // Use the same getRandomSpawnPosition function that's used for initial spawn
    const spawnPosition = getRandomSpawnPosition();

    if (playerId === socket.id) {
        isDead = false;
        isAlive = true;
        health = MAX_HEALTH;
        updateHealthDisplay();
        
        if (playerBody) {
            // Ensure exact position update
            playerBody.position.copy(spawnPosition);
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
            camera.position.set(
                spawnPosition.x,
                spawnPosition.y + PLAYER_HEIGHT - 0.5,
                spawnPosition.z
            );
        }

        // Hide death overlay if it exists
        const deathOverlay = document.getElementById('deathOverlay');
        if (deathOverlay) {
            deathOverlay.style.display = 'none';
        }

        // Re-enable controls
        canThrow = true;
        canJump = true;
    }
    
    socket.emit('playerRespawned', { id: playerId, position: spawnPosition });
}

function getRandomSpawnPosition() {
    // Generate a random position in quadrant 4 (positive x, positive z)
    const minX = 20; // Minimum safe distance from center
    const minZ = 20; // Minimum safe distance from center
    const maxX = ARENA_SIZE/2 - SAFE_SPAWN_MARGIN; // Maximum safe distance from wall
    const maxZ = ARENA_SIZE/2 - SAFE_SPAWN_MARGIN; // Maximum safe distance from wall
    
    return {
        x: minX + Math.random() * (maxX - minX),
        y: PLAYER_HEIGHT / 2,
        z: minZ + Math.random() * (maxZ - minZ)
    };
}

// After the updateHealthDisplay function
function createSprintMeter() {
    // Create container for both meters
    const metersContainer = document.createElement('div');
    metersContainer.style.position = 'fixed';
    metersContainer.style.bottom = '20px';
    metersContainer.style.left = '20px';
    metersContainer.style.display = 'flex';
    metersContainer.style.flexDirection = 'column';
    metersContainer.style.gap = '10px'; // Space between meters

    // Sprint meter
    const meterContainer = document.createElement('div');
    meterContainer.style.width = SPRINT_METER_WIDTH + 'px';
    meterContainer.style.height = SPRINT_METER_HEIGHT + 'px';
    meterContainer.style.border = '2px solid white';
    meterContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';

    const meterFill = document.createElement('div');
    meterFill.id = 'sprintMeter';
    meterFill.style.width = '100%';
    meterFill.style.height = '100%';
    meterFill.style.backgroundColor = '#4CAF50';
    meterFill.style.transition = 'width 0.1s linear';

    meterContainer.appendChild(meterFill);
    metersContainer.appendChild(meterContainer);

    // Dash meter
    const dashMeterContainer = document.createElement('div');
    dashMeterContainer.style.width = SPRINT_METER_WIDTH + 'px';
    dashMeterContainer.style.height = SPRINT_METER_HEIGHT + 'px';
    dashMeterContainer.style.border = '2px solid white';
    dashMeterContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dashMeterContainer.style.position = 'relative';

    const dashMeterFill = document.createElement('div');
    dashMeterFill.id = 'dashMeter';
    dashMeterFill.style.width = '100%';
    dashMeterFill.style.height = '100%';
    dashMeterFill.style.backgroundColor = '#FFA500';
    dashMeterFill.style.transition = 'width 0.1s linear';
    dashMeterFill.style.position = 'absolute';
    dashMeterFill.style.top = '0';
    dashMeterFill.style.left = '0';

    const dashText = document.createElement('div');
    dashText.id = 'dashText';
    dashText.style.position = 'absolute';
    dashText.style.width = '100%';
    dashText.style.textAlign = 'center';
    dashText.style.color = 'white';
    dashText.style.fontFamily = 'Arial';
    dashText.style.fontSize = '20px';
    dashText.style.lineHeight = SPRINT_METER_HEIGHT + 'px';
    dashText.style.zIndex = '1';
    dashText.style.textShadow = '1px 1px 2px rgba(0, 0, 0, 0.8)';
    dashText.textContent = 'DASH READY';

    dashMeterContainer.appendChild(dashMeterFill);
    dashMeterContainer.appendChild(dashText);
    metersContainer.appendChild(dashMeterContainer);

    document.body.appendChild(metersContainer);
}

function updateSprintMeter() {
    const meterFill = document.getElementById('sprintMeter');
    if (meterFill) {
        const percentage = (sprintMeter / MAX_SPRINT_DURATION) * 100;
        meterFill.style.width = percentage + '%';
        meterFill.style.backgroundColor = percentage < 30 ? '#f44336' : '#4CAF50';
    }
}

function updateDashMeter() {
    const dashMeterFill = document.getElementById('dashMeter');
    const dashText = document.getElementById('dashText');
    if (dashMeterFill && dashText) {
        const now = Date.now();
        
        if (!hasTouchedGroundSinceDash) {
            // If we haven't touched ground since last dash, show "TOUCH GROUND"
            dashMeterFill.style.width = '0%';
            dashText.textContent = 'TOUCH GROUND';
            canDash = false;
            lastDashTime = now; // Reset the timer when touching ground
        } else {
            // Only start counting recharge time after touching ground
            const timeSinceLastDash = now - lastDashTime;
            const percentage = Math.min(100, (timeSinceLastDash / DASH_COOLDOWN) * 100);
            dashMeterFill.style.width = percentage + '%';
            
            if (percentage >= 100) {
                dashText.textContent = 'DASH READY';
                canDash = true;
            } else {
                dashText.textContent = 'RECHARGING';
                canDash = false;
            }
        }
    }
}

const DASH_COOLDOWN = 2000; // 4 seconds in milliseconds
const DASH_FORCE_GROUND = 20; // Halved from 40
const DASH_FORCE_AIR = 30; // Halved from 60
const DASH_DURATION = 200;
const MAX_DASH_HEIGHT = 40;

// Add after player variables
let canDash = true;
let lastDashTime = 0;
let isDashing = false;
let hasTouchedGroundSinceDash = true;
let lastGroundMoveDirection = new THREE.Vector3();
let lastGroundSpeed = 0;
let canControlMovement = true;

// Add variables for recoil
let lastVelocityBeforeLanding = new CANNON.Vec3();
let recoilFactor = 0.3;
let isLanding = false;

// Add this function after createFirstPersonArm
function createScreenFlash() {
    const flashGeometry = new THREE.PlaneGeometry(2, 2);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0,
        depthTest: false
    });
    const flashMesh = new THREE.Mesh(flashGeometry, flashMaterial);
    flashMesh.position.z = -1;
    camera.add(flashMesh);
    
    // Store reference to the material for later use
    screenFlashMaterial = flashMaterial;
}

// Add the game loop
function animate() {
    requestAnimationFrame(animate);

    // Add reload animation update
    updateReloadAnimation();

    // Fixed time step for physics
    const fixedTimeStep = 1.0 / 60.0;
    const maxSubSteps = 3;
    world.step(fixedTimeStep, fixedTimeStep, maxSubSteps);

    // Update player movement
    if (isAlive && isGameStarted && playerBody) {
        const moveX = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
        const moveZ = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);

        // Handle crouching
        if (keys.Shift && !isCrouching && isOnGround) {
            isCrouching = true;
            // Update player collision shape for crouching
            playerBody.shapes[0].height = CROUCHED_HEIGHT;
            playerBody.position.y -= (PLAYER_HEIGHT - CROUCHED_HEIGHT) / 2;
            
            // Update visual model for crouching
            const player = players.get(socket.id);
            if (player && player.bodyParts) {
                const scale = CROUCHED_HEIGHT / PLAYER_HEIGHT;
                player.bodyParts.upper.position.y *= scale;
                player.bodyParts.lower.position.y *= scale;
                player.bodyParts.head.position.y *= scale;
                player.bodyParts.leftArm.position.y *= scale;
                player.bodyParts.rightArm.position.y *= scale;
                player.mesh.scale.y = scale;
            }
            
            // Update camera position for first person view
            camera.position.y -= (PLAYER_HEIGHT - CROUCHED_HEIGHT) / 2;
        } else if (!keys.Shift && isCrouching && isOnGround) {
            // Check if there's space to stand up
            const start = new CANNON.Vec3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
            const end = new CANNON.Vec3(playerBody.position.x, playerBody.position.y + (PLAYER_HEIGHT - CROUCHED_HEIGHT), playerBody.position.z);
            const result = new CANNON.RaycastResult();
            world.raycastClosest(start, end, { collisionFilterMask: COLLISION_GROUPS.TERRAIN }, result);
            
            if (!result.hasHit) {
                isCrouching = false;
                // Restore normal height
                playerBody.shapes[0].height = PLAYER_HEIGHT;
                playerBody.position.y += (PLAYER_HEIGHT - CROUCHED_HEIGHT) / 2;
                
                // Restore visual model
                const player = players.get(socket.id);
                if (player && player.bodyParts) {
                    player.bodyParts.upper.position.y = PLAYER_HEIGHT / 2 + 0.4;
                    player.bodyParts.lower.position.y = PLAYER_HEIGHT / 4;
                    player.bodyParts.head.position.y = PLAYER_HEIGHT / 2 + 1.2;
                    player.bodyParts.leftArm.position.y = PLAYER_HEIGHT / 2 + 0.4;
                    player.bodyParts.rightArm.position.y = PLAYER_HEIGHT / 2 + 0.4;
                    player.mesh.scale.y = 1;
                }
                
                // Update camera position
                camera.position.y += (PLAYER_HEIGHT - CROUCHED_HEIGHT) / 2;
            }
        }

        // Handle sprinting
        const isMoving = moveX !== 0 || moveZ !== 0;
        if (keys.e && !isCrouching && !isSprintExhausted && isMoving) {
            if (isOnGround) {
                isSprinting = true;
                wasSprintingBeforeJump = true;
            } else {
                // Only allow sprinting in air if we were sprinting before jumping
                isSprinting = wasSprintingBeforeJump;
            }
        } else {
            isSprinting = false;
            wasSprintingBeforeJump = false;
        }

        // Handle dash
        if (keys.q && canDash && !isDashing && hasTouchedGroundSinceDash) {
            isDashing = true;
            canDash = false;
            hasTouchedGroundSinceDash = false;
            canControlMovement = false; // Disable movement control during dash
            lastDashTime = Date.now();
            
            // Get exact direction player is looking
            const dashDirection = new THREE.Vector3();
            camera.getWorldDirection(dashDirection);
            
            // Calculate the potential new height
            const potentialHeight = playerBody.position.y + (dashDirection.y * DASH_FORCE_AIR);
            
            // If the dash would exceed max height, adjust the vertical component
            if (potentialHeight > MAX_DASH_HEIGHT) {
                const remainingHeight = Math.max(0, MAX_DASH_HEIGHT - playerBody.position.y);
                const heightRatio = remainingHeight / (dashDirection.y * DASH_FORCE_AIR);
                dashDirection.y *= heightRatio;
            }
            
            dashDirection.normalize();
            
            // Apply dash force
            const dashForce = isOnGround ? DASH_FORCE_GROUND : DASH_FORCE_AIR;
            
            // Store dash direction and speed for maintaining momentum
            lastGroundMoveDirection.copy(dashDirection);
            lastGroundSpeed = dashForce;
            
            // Apply the dash velocity
            playerBody.velocity.x = dashDirection.x * dashForce;
            playerBody.velocity.y = dashDirection.y * dashForce;
            playerBody.velocity.z = dashDirection.z * dashForce;
            
            // Reset dash after duration
            setTimeout(() => {
                isDashing = false;
                // Movement control remains disabled until touching ground
            }, DASH_DURATION);
        }

        // Update dash meter
        updateDashMeter();

        // Update sprint meter only when moving and sprinting
        const now = Date.now();
        const deltaTime = now - lastSprintTime;
        lastSprintTime = now;

        if (isSprinting && isMoving) {
            sprintMeter = Math.max(0, sprintMeter - deltaTime);
            if (sprintMeter === 0) {
                isSprintExhausted = true;
                isSprinting = false;
                wasSprintingBeforeJump = false;
            }
        } else {
            sprintMeter = Math.min(MAX_SPRINT_DURATION, sprintMeter + deltaTime);
            if (sprintMeter > MAX_SPRINT_DURATION * 0.3) {
                isSprintExhausted = false;
            }
        }
        
        updateSprintMeter();

        // Check if player is on ground
        const contacts = world.contacts;
        const wasOnGround = isOnGround;
        isOnGround = false;
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            if ((contact.bi === playerBody || contact.bj === playerBody) &&
                (contact.bi.material === terrainMaterial || contact.bj.material === terrainMaterial)) {
                const normalY = contact.ni.y;
                if (normalY > 0.5) {
                    isOnGround = true;
                    hasTouchedGroundSinceDash = true;
                    if (!canControlMovement) {
                        canControlMovement = true;
                    }
                    
                    // Handle landing recoil
                    if (!wasOnGround) {
                        isLanding = true;
                        // Apply horizontal recoil based on previous velocity
                        playerBody.velocity.x = lastVelocityBeforeLanding.x * recoilFactor;
                        playerBody.velocity.z = lastVelocityBeforeLanding.z * recoilFactor;
                        
                        // Reset recoil after a short duration
                        setTimeout(() => {
                            isLanding = false;
                        }, 150);
                    }
                    break;
                }
            }
        }
        
        // Store velocity when in air for recoil calculation
        if (!isOnGround && !isLanding) {
            lastVelocityBeforeLanding.copy(playerBody.velocity);
        }

        // Handle jumping
        if (keys[' '] && isOnGround && canJump && !isCrouching) {
            playerBody.velocity.y = JUMP_FORCE;
            canJump = false;
            isOnGround = false;
        }

        // Reset jump ability when landing
        if (isOnGround && !canJump) {
            canJump = true;
        }

        // Handle movement only if not dashing
        if (!isDashing) {
            if (moveX !== 0 || moveZ !== 0) {
                const forward = new THREE.Vector3();
                const right = new THREE.Vector3();
                
                camera.getWorldDirection(forward);
                forward.y = 0;
                forward.normalize();
                
                right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
                
                const moveDirection = new THREE.Vector3();
                
                if (moveZ !== 0) {
                    moveDirection.add(forward.multiplyScalar(-moveZ));
                }
                if (moveX !== 0) {
                    moveDirection.add(right.multiplyScalar(moveX));
                }
                
                moveDirection.normalize();

                // Keep current Y velocity
                const currentYVelocity = playerBody.velocity.y;
                
                // Apply appropriate speed based on movement state
                let currentSpeed = MOVEMENT_SPEED;
                if (isSprinting) {
                    currentSpeed = SPRINT_SPEED;
                }
                if (isCrouching) currentSpeed = CROUCH_SPEED;

                if (isOnGround && canControlMovement) {
                    // Store the last ground movement direction and speed
                    lastGroundMoveDirection.copy(moveDirection);
                    lastGroundSpeed = currentSpeed;
                    
                    // Apply movement normally when on ground
                    playerBody.velocity.x = moveDirection.x * currentSpeed;
                    playerBody.velocity.z = moveDirection.z * currentSpeed;
                    playerBody.velocity.y = currentYVelocity;
                } else {
                    // In air, maintain the last ground direction but allow slight adjustments
                    playerBody.velocity.x = lastGroundMoveDirection.x * lastGroundSpeed;
                    playerBody.velocity.z = lastGroundMoveDirection.z * lastGroundSpeed;
                }
            } else if (isOnGround) {
                if (canControlMovement) {
                    playerBody.velocity.x *= (1 - GROUND_FRICTION);
                    playerBody.velocity.z *= (1 - GROUND_FRICTION);
                    lastGroundMoveDirection.set(0, 0, 0);
                    lastGroundSpeed = 0;
                }
            } else {
                // Maintain momentum in air
                playerBody.velocity.x = lastGroundMoveDirection.x * lastGroundSpeed;
                playerBody.velocity.z = lastGroundMoveDirection.z * lastGroundSpeed;
            }
        }
    }

    // Update camera
    if (playerBody) {
        camera.position.copy(playerBody.position);
        camera.position.y += PLAYER_HEIGHT - 0.5;
        camera.rotation.order = 'YXZ';
        camera.rotation.x = mouseY;
        camera.rotation.y = mouseX;
    }

    // Update meshes
    players.forEach((player) => {
        if (player.mesh && player.body) {
            player.mesh.position.copy(player.body.position);
            player.mesh.quaternion.copy(player.body.quaternion);
        }
    });

    // Update snowballs
    snowballs.forEach((snowball, index) => {
        if (snowball.hasHit) return;

        // Update mesh position to match physics body
        snowball.mesh.position.copy(snowball.body.position);
        snowball.mesh.quaternion.copy(snowball.body.quaternion);

        // Check for terrain collisions using physics engine
        const contacts = world.contacts;
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            if ((contact.bi === snowball.body || contact.bj === snowball.body) &&
                (contact.bi.material === terrainMaterial || contact.bj.material === terrainMaterial)) {
                // Create hit effect at collision point
                createHitEffect(snowball.mesh.position.clone());
                scene.remove(snowball.mesh);
                world.removeBody(snowball.body);
                snowballs.splice(index, 1);
                return;
            }
        }

        // Check for player hits
        let hitRegistered = false;
        players.forEach((player, id) => {
            if (!hitRegistered && id !== socket.id && !snowball.hasHit) {
                if (checkSnowballHit(snowball, player)) {
                    hitRegistered = true;
                    snowball.hasHit = true;
                    
                    // Hit confirmed
                    socket.emit('playerHit', { 
                        id, 
                        position: snowball.mesh.position.clone(),
                        velocity: snowball.body.velocity.clone()
                    });
                    
                    // Create hit effect
                    createHitEffect(snowball.mesh.position.clone());
                    
                    // Remove snowball
                    scene.remove(snowball.mesh);
                    world.removeBody(snowball.body);
                    snowballs.splice(index, 1);
                }
            }
        });

        // Remove snowballs that have traveled too far
        if (!hitRegistered) {
            const distanceTraveled = snowball.mesh.position.distanceTo(snowball.initialPosition);
            if (distanceTraveled > MAX_SNOWBALL_DISTANCE) {
                scene.remove(snowball.mesh);
                world.removeBody(snowball.body);
                snowballs.splice(index, 1);
            }
        }
    });

    // Emit player position
    if (playerBody) {
        socket.emit('playerMove', {
            position: playerBody.position,
            rotation: playerBody.quaternion
        });
    }

    renderer.render(scene, camera);
}

// Start game
createPlayer(socket.id, getRandomSpawnPosition());
createSprintMeter();
updateSnowballMeter();
animate(); 