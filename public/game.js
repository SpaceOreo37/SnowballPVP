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
const PLAYER_GRAVITY = -16; // Stronger gravity for player (default was -9.82)

// Initialize Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4488ff); // Deeper blue for sky
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.shadowMap.needsUpdate = true;
document.body.appendChild(renderer.domElement);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); // White ambient light with low intensity
scene.add(ambientLight);

// Create sun visualization
const sunGeometry = new THREE.SphereGeometry(15, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xFFFFFF, // Changed to match ground color
    transparent: true,
    opacity: 0.4,
    fog: false
});
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
// Position sun for optimal shadow casting
sunMesh.position.set(-300, 400, -300);
scene.add(sunMesh);

// Create a more powerful directional light
const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.8); // Changed light color to match sun
directionalLight.position.copy(sunMesh.position);
directionalLight.castShadow = true;

// Optimize shadow settings
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 1000;
directionalLight.shadow.camera.left = -500;
directionalLight.shadow.camera.right = 500;
directionalLight.shadow.camera.top = 500;
directionalLight.shadow.camera.bottom = -500;
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
directionalLight.shadow.bias = -0.0003; // Adjusted for cleaner shadows
directionalLight.shadow.normalBias = 0.005;
directionalLight.shadow.radius = 2; // Slight blur for softer edges

// Create a target for the directional light
const lightTarget = new THREE.Object3D();
lightTarget.position.set(0, 0, 0);
scene.add(lightTarget);
directionalLight.target = lightTarget;

scene.add(directionalLight);

// Initialize physics world
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});

// Improve physics simulation
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 5; // Reduced from 10
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

// Add socket event handler for map data
socket.on('mapData', (mapData) => {
    // Set the natural elements in the game map
    gameMap.setNaturalElements(mapData);
    
    // Create the environment with the new map data
    createEnvironment();
});

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
const SNOWBALL_SPEED = 65; // Increased speed
const SNOWBALL_GRAVITY = -4.91; // Reduced gravity effect
const MAX_SNOWBALL_DISTANCE = 100;
const HIT_COOLDOWN = 500;
const THROW_FORCE_UPWARD = 0.03; // Slight upward angle for better trajectory
const MAX_HEALTH = 100;
const DAMAGE_PER_HIT = 30;
const RESPAWN_DELAY = 3000; // 3 seconds in milliseconds

// Sprint meter constants
const MAX_SPRINT_DURATION = 5000; // 5 seconds in milliseconds
const SPRINT_METER_WIDTH = 400; // Doubled from 200
const SPRINT_METER_HEIGHT = 40; // Doubled from 20

// Arena constants
const ARENA_SIZE = 440; // Changed to match actual playable area (400 + 40 for safety)
const SAFE_SPAWN_MARGIN = 40; // Doubled from 20
const SPAWN_POSITIONS = [
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN }, // Main quadrant 4 position
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*2, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN }, // Slightly to the left
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*2 }, // Slightly forward
    { x: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*1.5, z: ARENA_SIZE/2 - SAFE_SPAWN_MARGIN*1.5 } // Diagonal inward
];

// Add new constants for snowball system
const MAX_SNOWBALLS = 10;
const RELOAD_TIME = 3000; // 3 seconds in milliseconds

// Add after the game constants section
const NAME_TAG_DISTANCE = 40; // Distance at which name tags start to fade
const NAME_TAG_FADE_DISTANCE = 15; // Distance over which name tags fade out (from 40 to 55)
const NAME_TAG_MAX_DISTANCE = 55; // Distance at which name tags completely disappear

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
let playerNames = new Map();
const playerKills = new Map(); // Track kills for each player
let isPaused = false;
let wasAlive = false;
let lastPosition = null;
let lastHealth = 0;
let lastSnowballCount = 0;
let isExitingGame = false;

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

// Create height limit barrier
const heightLimitShape = new CANNON.Plane();
const heightLimitBody = new CANNON.Body({
    mass: 0,
    shape: heightLimitShape,
    material: terrainMaterial,
    collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
    collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL,
    position: new CANNON.Vec3(0, 60, 0) // Position at 60 units high
});
// Rotate the height limit plane to face downward
heightLimitBody.quaternion.setFromEuler(Math.PI / 2, 0, 0);
world.addBody(heightLimitBody);

// Create ground with better collision setup
const groundGeometry = new THREE.BoxGeometry(880, 1, 880); 
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF,
    roughness: 0.9,
    metalness: 0.2,
    emissive: 0xd3e1ff,
    emissiveIntensity: 0.2,
    side: THREE.FrontSide
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.set(0, -0.5, 0);
ground.receiveShadow = true;
ground.castShadow = false;
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
    new CANNON.Vec3(220, 2, 220) // Doubled from 110
);

// Add fog to create depth and hide the ground edges
scene.fog = new THREE.Fog(0x4488ff, 30, 120); // Increased near value from 20 to 30

// Initialize game map
const gameMap = new GameMap();

// Add instanced wall meshes
let wallInstances = null;
let wallInstanceCount = 0;
const MAX_WALL_INSTANCES = 4;

function createWallInstances() {
    // Create base wall geometry
    const wallGeometry = new THREE.BoxGeometry(1, 60, 1);
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.2
    });

    // Create instanced mesh
    wallInstances = new THREE.InstancedMesh(wallGeometry, wallMaterial, MAX_WALL_INSTANCES);
    scene.add(wallInstances);
}

function createWall(x, y, width, height, depth) {
    if (!wallInstances) {
        createWallInstances();
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(x + width/2, height/2, y + depth/2);
    const scale = new THREE.Vector3(width, height, depth);
    const quaternion = new THREE.Quaternion();

    matrix.compose(position, quaternion, scale);
    wallInstances.setMatrixAt(wallInstanceCount, matrix);
    wallInstanceCount++;

    // Add optimized physics body
    const wallShape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
    const wallBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: wallShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    wallBody.position.copy(position);
    world.addBody(wallBody);
}

function createFort() {
    const fortData = gameMap.fort;
    
    // Create base platform
    const baseGeometry = new THREE.BoxGeometry(fortData.width, fortData.baseHeight, fortData.height);
    const fortMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC,
        roughness: 0.8,
        metalness: 0.1
    });
    const basePlatform = new THREE.Mesh(baseGeometry, fortMaterial);
    basePlatform.position.set(
        fortData.x + fortData.width/2, 
        fortData.baseHeight/2, 
        fortData.y + fortData.height/2
    );
    basePlatform.castShadow = true;
    basePlatform.receiveShadow = true;
    scene.add(basePlatform);

    // Add physics body for base platform
    const baseShape = new CANNON.Box(new CANNON.Vec3(fortData.width/2, fortData.baseHeight/2, fortData.height/2));
    const baseBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: baseShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    baseBody.position.copy(basePlatform.position);
    world.addBody(baseBody);

    // Create walls
    fortData.walls.forEach(wall => {
        // Create wall mesh
        const wallGeometry = new THREE.BoxGeometry(wall.width, fortData.wallHeight, wall.depth);
        const wallMesh = new THREE.Mesh(wallGeometry, fortMaterial);
        wallMesh.position.set(
            fortData.x + wall.x + wall.width/2,
            fortData.baseHeight + fortData.wallHeight/2,
            fortData.y + wall.y + wall.depth/2
        );
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);

        // Add physics body for wall
        const wallShape = new CANNON.Box(new CANNON.Vec3(wall.width/2, fortData.wallHeight/2, wall.depth/2));
        const wallBody = new CANNON.Body({
            mass: 0,
            material: terrainMaterial,
            shape: wallShape,
            collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
            collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
        });
        wallBody.position.copy(wallMesh.position);
        world.addBody(wallBody);
    });
}

// Add instanced cover spot meshes
let coverInstances = null;
let coverInstanceCount = 0;
const MAX_COVER_INSTANCES = 30;

function createCoverInstances() {
    // Create base cover geometry with new dimensions (7x4x7)
    const coverGeometry = new THREE.BoxGeometry(7, 4, 7);
    const coverMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.2
    });

    // Create instanced mesh
    coverInstances = new THREE.InstancedMesh(coverGeometry, coverMaterial, MAX_COVER_INSTANCES);
    scene.add(coverInstances);
}

function createCoverSpot(coverData) {
    if (!coverInstances) {
        createCoverInstances();
    }

    const matrix = new THREE.Matrix4();
    // Set y position to 2 (half the height) to place bottom of box on ground
    const position = new THREE.Vector3(coverData.x, 2, coverData.y);
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();

    matrix.compose(position, quaternion, scale);
    coverInstances.setMatrixAt(coverInstanceCount, matrix);
    coverInstanceCount++;

    // Add optimized physics body with new dimensions
    const coverShape = new CANNON.Box(new CANNON.Vec3(3.5, 2, 3.5)); // Half-dimensions for CANNON.js
    const coverBody = new CANNON.Body({
        mass: 0,
        material: terrainMaterial,
        shape: coverShape,
        collisionFilterGroup: COLLISION_GROUPS.TERRAIN,
        collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.SNOWBALL
    });
    // Set physics body position to match visual position
    coverBody.position.set(coverData.x, 2, coverData.y);
    world.addBody(coverBody);
}

// Add instanced tree meshes
let treeInstances = null;
let treeInstanceCount = 0;
const MAX_TREE_INSTANCES = 500;

function createTreeInstances() {
    // Create base tree geometry
    const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.5, 4, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4A2B0F,
        roughness: 0.9,
        metalness: 0.1
    });

    const coneGeometry1 = new THREE.ConeGeometry(2, 4, 8);
    const coneGeometry2 = new THREE.ConeGeometry(1.6, 3, 8);
    const coneGeometry3 = new THREE.ConeGeometry(1.2, 2, 8);
    const treeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0B4619,
        roughness: 0.8,
        metalness: 0.1
    });

    // Create instanced meshes
    const trunkInstanced = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, MAX_TREE_INSTANCES);
    const cone1Instanced = new THREE.InstancedMesh(coneGeometry1, treeMaterial, MAX_TREE_INSTANCES);
    const cone2Instanced = new THREE.InstancedMesh(coneGeometry2, treeMaterial, MAX_TREE_INSTANCES);
    const cone3Instanced = new THREE.InstancedMesh(coneGeometry3, treeMaterial, MAX_TREE_INSTANCES);

    // Create a group for all tree instances
    treeInstances = new THREE.Group();
    treeInstances.add(trunkInstanced);
    treeInstances.add(cone1Instanced);
    treeInstances.add(cone2Instanced);
    treeInstances.add(cone3Instanced);

    scene.add(treeInstances);
}

function createTree(x, z) {
    if (!treeInstances) {
        createTreeInstances();
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(x, 2, z);
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();

    // Set trunk position
    matrix.compose(position, quaternion, scale);
    treeInstances.children[0].setMatrixAt(treeInstanceCount, matrix);

    // Set cone1 position
    position.y = 3;
    matrix.compose(position, quaternion, scale);
    treeInstances.children[1].setMatrixAt(treeInstanceCount, matrix);

    // Set cone2 position
    position.y = 4.5;
    matrix.compose(position, quaternion, scale);
    treeInstances.children[2].setMatrixAt(treeInstanceCount, matrix);

    // Set cone3 position
    position.y = 5.5;
    matrix.compose(position, quaternion, scale);
    treeInstances.children[3].setMatrixAt(treeInstanceCount, matrix);

    // Update instance count
    treeInstanceCount++;

    // Add physics body with optimized collision shape
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

    // Add optimized pine collision
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

// Optimize the createEnvironment function
function createEnvironment() {
    // Create boundary walls
    gameMap.walls.forEach(wall => {
        createWall(wall.x, wall.y, wall.width, wall.height, wall.depth);
    });

    // Create fort
    createFort();

    // Create cover spots and natural elements
    gameMap.getAllObjects().forEach(element => {
        if (element.type === 'cover') {
            createCoverSpot(element);
        } else if (element.type === 'tree') {
            createTree(element.x, element.y);
        }
    });

    // Update instance counts
    if (coverInstances) {
        coverInstances.count = coverInstanceCount;
    }
    if (treeInstances) {
        treeInstances.children.forEach(child => {
            if (child instanceof THREE.InstancedMesh) {
                child.count = treeInstanceCount;
            }
        });
    }
}

// Call createEnvironment after creating the ground
createEnvironment();

// Modify the updateNameLabels function
function updateNameLabels() {
    players.forEach((player, id) => {
        if (id !== socket.id && player.nameLabel) {
            // Make name tag face camera
            player.nameLabel.quaternion.copy(camera.quaternion);
            
            // Calculate distance to player
            const distance = camera.position.distanceTo(player.mesh.position);
            
            // Calculate opacity based on distance
            let opacity = 1;
            if (distance > NAME_TAG_DISTANCE) {
                opacity = 1 - (distance - NAME_TAG_DISTANCE) / NAME_TAG_FADE_DISTANCE;
                opacity = Math.max(0, Math.min(1, opacity));
            }
            
            // Update name label visibility and opacity
            player.nameLabel.visible = opacity > 0;
            player.nameLabel.material.opacity = opacity;
        }
    });
}

// Modify the createPlayerNameLabel function
function createPlayerNameLabel(name) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;

    // Enable text antialiasing
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    // Draw rounded rectangle background
    const cornerRadius = 20;
    const width = canvas.width;
    const height = canvas.height;
    
    context.beginPath();
    context.moveTo(cornerRadius, 0);
    context.lineTo(width - cornerRadius, 0);
    context.quadraticCurveTo(width, 0, width, cornerRadius);
    context.lineTo(width, height - cornerRadius);
    context.quadraticCurveTo(width, height, width - cornerRadius, height);
    context.lineTo(cornerRadius, height);
    context.quadraticCurveTo(0, height, 0, height - cornerRadius);
    context.lineTo(0, cornerRadius);
    context.quadraticCurveTo(0, 0, cornerRadius, 0);
    context.closePath();
    
    // Fill background with more opaque black
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fill();

    // Draw text with improved quality
    context.font = 'bold 150px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add stronger text shadow for better readability
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 6;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    
    // Draw the name
    context.fillText(name, canvas.width / 2, canvas.height / 2);

    // Create texture with better quality settings
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        opacity: 1
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = PLAYER_HEIGHT + 1.5;
    
    return sprite;
}

// Modify the createPlayer function to include name label
function createPlayer(id, initialPosition, name) {
    // Create the character model with snowman-like appearance
    const bodyGeometry = new THREE.SphereGeometry(1.0, 32, 32);  // Body size
    const headGeometry = new THREE.SphereGeometry(1.2, 32, 32);  // Head size
    
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.3
    });

    // Create body parts
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial);
    
    // Position body parts
    bodyMesh.position.y = 0.1;  // Body radius to touch ground
    headMesh.position.y = 1.6;  // Position head above body
    
    // Create a group to hold all parts
    const playerGroup = new THREE.Group();
    playerGroup.add(bodyMesh);
    playerGroup.add(headMesh);

    // Add outline for other players
    if (id !== socket.id) {
        const outlineMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.BackSide
        });
        
        [bodyMesh, headMesh].forEach(mesh => {
            const outline = mesh.clone();
            outline.material = outlineMaterial;
            outline.scale.multiplyScalar(1.05);
            outline.position.copy(mesh.position);
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
        shape: new CANNON.Cylinder(0.7, 0.7, PLAYER_HEIGHT, 8),  // Collision cylinder
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
    const hitMaterial = bodyMaterial.clone();
    hitMaterial.color.setHex(0xff0000);
    
    // Store reference to materials and meshes for hit effect
    const meshes = [bodyMesh, headMesh];
    const normalMaterials = meshes.map(mesh => mesh.material);
    
    // Add name label
    const nameLabel = createPlayerNameLabel(name || 'Player');
    playerGroup.add(nameLabel);

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
            body: bodyMesh,
            head: headMesh
        },
        nameLabel
    };
}

// Add this function after createPlayer
function createFirstPersonArm() {
    // Remove existing arm if it exists
    if (firstPersonArm) {
        camera.remove(firstPersonArm);
        firstPersonArm = null;
    }
    
    const armGroup = new THREE.Group();
    
    const armGeometry = new THREE.CapsuleGeometry(0.15, 0.7, 16);
    const armMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.3
    });
    
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.position.set(0.4, -0.7, -0.4);
    arm.rotation.x = -Math.PI / 4;
    arm.rotation.y = Math.PI / 8;
    
    armGroup.add(arm);
    
    firstPersonArm = armGroup;
    camera.add(firstPersonArm);
    
    // Only create held snowball if we have snowballs and aren't reloading
    if (snowballCount > 0 && !isReloading) {
        createHeldSnowball();
    }
}

function createHeldSnowball() {
    if (!firstPersonArm || snowballCount <= 0 || isReloading) {
        if (heldSnowball) {
            heldSnowball.visible = false;
        }
        return;
    }
    
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
    heldSnowball.visible = true;
    firstPersonArm.add(heldSnowball);
}

// Modify snowball creation to use snowball material
function createSnowball(position, direction, shooterId) {
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
        hasHit: false,
        shooterId: shooterId // Store the shooter's ID
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

// Add after player variables
let processedEvents = new Set();
let processedMessages = new Set();

// Helper function to track processed events
function isEventProcessed(eventType, id, timestamp) {
    const eventKey = `${eventType}_${id}_${timestamp}`;
    if (processedEvents.has(eventKey)) {
        return true;
    }
    processedEvents.add(eventKey);
    
    // Clear old events after 5 seconds
    setTimeout(() => {
        processedEvents.delete(eventKey);
    }, 5000);
    
    return false;
}

// Modify socket event handlers
socket.on('currentPlayers', (playersList) => {
    console.log('Received current players:', playersList);
    
    // First, remove all non-local players from the scene and physics world
    players.forEach((player, id) => {
        if (id !== socket.id) {
            scene.remove(player.mesh);
            world.removeBody(player.body);
            players.delete(id);
            playerNames.delete(id);
            playerKills.delete(id);
        }
    });

    // Create a Set to track processed player IDs
    const processedPlayers = new Set();

    playersList.forEach(playerInfo => {
        // Skip if we've already processed this player or if it's the local player
        if (processedPlayers.has(playerInfo.id) || playerInfo.id === socket.id) {
            return;
        }

        const player = createPlayer(playerInfo.id, playerInfo.position, playerInfo.name);
        players.set(playerInfo.id, player);
        playerNames.set(playerInfo.id, playerInfo.name || 'Unknown');
        playerKills.set(playerInfo.id, playerInfo.kills || 0);
        console.log(`Added player ${playerInfo.name} with ${playerInfo.kills || 0} kills`);
        
        // Mark this player as processed
        processedPlayers.add(playerInfo.id);
    });

    updateLeaderboard();
});

socket.on('newPlayer', (playerInfo) => {
    if (isEventProcessed('join', playerInfo.id, Date.now())) return;
    
    // Check if player already exists
    if (!players.has(playerInfo.id)) {
        const player = createPlayer(playerInfo.id, playerInfo.position, playerInfo.name);
        players.set(playerInfo.id, player);
        playerNames.set(playerInfo.id, playerInfo.name || 'Unknown');
        playerKills.set(playerInfo.id, playerInfo.kills || 0);
        updateLeaderboard();
        
        // Add join message
        addGameLogMessage(`${playerInfo.name || 'Unknown'} has joined the game`, 'join');
    }
});

socket.on('killUpdate', (data) => {
    if (isEventProcessed('kill', `${data.killerId}_${data.victimId}`, Date.now())) return;
    
    console.log('Kill update received:', data);
    
    // Store both killer and victim names immediately
    if (data.killerName) {
        playerNames.set(data.killerId, data.killerName);
        console.log(`Stored killer name: ${data.killerName} for ID: ${data.killerId}`);
    }
    if (data.victimName) {
        playerNames.set(data.victimId, data.victimName);
        console.log(`Stored victim name: ${data.victimName} for ID: ${data.victimId}`);
    }
    
    // Update kill count
    const kills = typeof data.kills === 'number' ? data.kills : 0;
    playerKills.set(data.killerId, kills);
    console.log(`Updated kills for ${playerNames.get(data.killerId)}: ${kills}`);
    
    // Update personal kill counter if local player
    if (data.killerId === socket.id) {
        updateKillCounter(kills);
    }
    
    // Update leaderboard before adding game log message
    updateLeaderboard();
    
    // Add kill message using stored names
    const killerName = playerNames.get(data.killerId) || 'Unknown';
    const victimName = playerNames.get(data.victimId) || 'Unknown';
    addGameLogMessage(`${killerName} eliminated ${victimName}`, 'kill');
});

socket.on('playerDisconnected', (playerId) => {
    if (isEventProcessed('leave', playerId, Date.now())) return;
    
    const playerName = playerNames.get(playerId) || 'Unknown';
    const player = players.get(playerId);
    
    // Add leave message first
    addGameLogMessage(`${playerName} has left the game`, 'leave');
    
    // Then clean up player data
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
    
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
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
    const snowball = createSnowball(snowballPosition, snowballVelocity.normalize(), data.shooterId);
    
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
    } else {
        // Handle death for other players
        const player = players.get(data.id);
        if (player) {
            // Turn the player red and hide them
            player.mesh.visible = false;
            player.isDead = true;
        }
    }
});

socket.on('playerRespawn', (data) => {
    const player = players.get(data.id);

    if (data.id === socket.id) {
        // Reset local player
        health = MAX_HEALTH;
        updateHealthDisplay();
        
        // Force position update for local player
        playerBody.position.copy(data.position);
        playerBody.velocity.set(0, 0, 0);
        playerBody.angularVelocity.set(0, 0, 0);
        camera.position.set(data.position.x, data.position.y + PLAYER_HEIGHT - 0.5, data.position.z);
        
        // Hide death overlay
        const deathOverlay = document.getElementById('deathOverlay');
        const respawnProgressFill = document.getElementById('respawnProgressFill');
        deathOverlay.style.display = 'none';
        respawnProgressFill.style.transform = 'scaleX(0)';

        // Re-enable controls
        canThrow = true;
        canJump = true;
        isAlive = true;
        isDead = false;
    } else if (player) {
        // Reset other player's state
        player.isDead = false;
        player.mesh.visible = true; // Make player visible again
        
        // Reset position and velocity
        player.body.position.copy(data.position);
        player.body.velocity.set(0, 0, 0);
        player.body.angularVelocity.set(0, 0, 0);
        player.mesh.position.copy(data.position);
        
        // Reset color
        player.meshes.forEach((mesh, i) => {
            mesh.material = player.materials.normal[i];
        });
    }
});

socket.on('playerDisconnected', (playerId) => {
    // Get player name before deleting from maps
    const playerName = playerNames.get(playerId) || 'Unknown';
    const player = players.get(playerId);
    
    // Add leave message first
    addGameLogMessage(`${playerName} has left the game`, 'leave');
    
    // Then clean up player data
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
    
    // Finally remove from tracking maps
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    
    // Update leaderboard after player removal
    updateLeaderboard();
});

// Handle pointer lock
function returnToTitleScreen() {
    // Notify server that player has left
    socket.emit('playerDisconnected', socket.id);
    
    // Reload the page to return to original title screen
    window.location.reload();
}

// Add a new variable for tracking control restoration
let controlsEnabled = true;

// Modify the click event listener to check for controls being enabled
document.addEventListener('click', (e) => {
    // Don't allow shooting if paused or controls are disabled
    if (isPaused || !controlsEnabled) return;

    if (isGameStarted && canThrow && isAlive && !isDead && !isReloading && snowballCount > 0) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        
        // Create snowball slightly in front of the camera for better visibility
        const position = new THREE.Vector3();
        camera.getWorldPosition(position);
        position.add(direction.clone().multiplyScalar(2));
        
        // Hide held snowball immediately
        if (heldSnowball) {
            heldSnowball.visible = false;
        }
        
        // Create and throw snowball with shooter ID
        const snowball = createSnowball(position, direction, socket.id);
        
        // Emit the exact velocity that was applied to the snowball
        socket.emit('throwSnowball', { 
            position: position,
            velocity: snowball.body.velocity,
            shooterId: socket.id
        });

        // Decrease snowball count and update UI
        snowballCount--;
        updateSnowballMeter();

        canThrow = false;
        setTimeout(() => {
            canThrow = true;
            if (!isReloading && snowballCount > 0) {
                createHeldSnowball();
            }
        }, 500);
    }
});

// Remove all previous resume button event listeners and create a single robust one
function setupPauseMenuListeners() {
    const resumeButton = document.getElementById('resumeButton');
    const exitButton = document.getElementById('exitButton');
    
    // Remove any existing listeners
    const oldResumeButton = resumeButton.cloneNode(true);
    resumeButton.parentNode.replaceChild(oldResumeButton, resumeButton);
    
    // Add single resume button listener
    oldResumeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Disable controls until fully restored
        controlsEnabled = false;
        
        // Hide pause menu immediately
        const pauseMenu = document.getElementById('pauseMenu');
        if (pauseMenu) {
            pauseMenu.style.display = 'none';
        }
        
        // Reset pause state
        isPaused = false;
        
        // Restore player state
        if (lastPosition && playerBody) {
            playerBody.position.copy(lastPosition);
            health = lastHealth;
            snowballCount = lastSnowballCount;
            isAlive = wasAlive;
            updateHealthDisplay();
            updateSnowballMeter();
            
            // Make player visible to others again
            socket.emit('playerReturned', {
                position: lastPosition,
                health: health,
                isAlive: isAlive
            });
        }
        
        // Function to attempt pointer lock with timeout
        const attemptPointerLock = (attempts = 0) => {
            if (attempts >= 5) {
                console.log('Failed to acquire pointer lock after 5 attempts');
                showPauseMenu(); // Show pause menu again if we failed
                return;
            }
            
            try {
                renderer.domElement.requestPointerLock();
                
                // Check if pointer lock was successful after a delay
                setTimeout(() => {
                    if (document.pointerLockElement !== renderer.domElement) {
                        console.log(`Pointer lock attempt ${attempts + 1} failed, retrying...`);
                        attemptPointerLock(attempts + 1);
                    } else {
                        // Successfully acquired pointer lock
                        setTimeout(() => {
                            controlsEnabled = true;
                        }, 100);
                    }
                }, 100);
            } catch (error) {
                console.error('Error requesting pointer lock:', error);
                showPauseMenu();
            }
        };
        
        // Start the first attempt after a short delay
        setTimeout(() => {
            attemptPointerLock();
        }, 50);
    });
    
    // Remove any existing exit button listeners
    const oldExitButton = exitButton.cloneNode(true);
    exitButton.parentNode.replaceChild(oldExitButton, exitButton);
    
    // Add single exit button listener
    oldExitButton.addEventListener('click', () => {
        isExitingGame = true;
        returnToTitleScreen();
    });
}

// Modify the showPauseMenu function to ensure listeners are set up
function showPauseMenu() {
    // Don't show pause menu if player is dead
    if (isDead) return;

    const pauseMenu = document.getElementById('pauseMenu');
    if (pauseMenu) {
        isPaused = true;
        controlsEnabled = false;
        wasAlive = isAlive;
        
        // Store current state
        if (playerBody) {
            lastPosition = playerBody.position.clone();
            lastHealth = health;
            lastSnowballCount = snowballCount;
            
            // Reset all movement keys to prevent movement after unpausing
            Object.keys(keys).forEach(key => keys[key] = false);
            
            // Stop all player movement
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
        }
        
        // Hide player from others while in menu
        socket.emit('playerPaused');
        
        pauseMenu.style.display = 'flex';
        
        // Set up event listeners
        setupPauseMenuListeners();
    }
}

// Remove the old event listeners (they will be replaced by setupPauseMenuListeners)
// ... existing code ...

// Modify the pointer lock event listener
document.addEventListener('pointerlockchange', () => {
    const clickToStart = document.getElementById('clickToStart');
    const coordDisplay = document.getElementById('coordinateDisplay');
    const leaderboard = document.getElementById('leaderboard');
    const pauseMenu = document.getElementById('pauseMenu');
    
    if (document.pointerLockElement === renderer.domElement) {
        isGameStarted = true;
        
        // Hide UI elements
        if (clickToStart) clickToStart.style.display = 'none';
        if (coordDisplay) coordDisplay.style.display = 'block';
        if (leaderboard) leaderboard.style.display = 'block';
        if (pauseMenu) pauseMenu.style.display = 'none';
    } else {
        // If we're dead, immediately request pointer lock again
        if (isDead) {
            requestPointerLockWithRetry();
        }
        // Only show pause menu if game was started, not dead, and not exiting
        else if (isGameStarted && !isExitingGame) {
            showPauseMenu();
        }
    }
});

// Add helper function for pointer lock with retry
function requestPointerLockWithRetry(attempts = 0) {
    if (attempts >= 5) return; // Give up after 5 attempts
    
    try {
        renderer.domElement.requestPointerLock();
        
        // Check if it worked after a short delay
        setTimeout(() => {
            if (document.pointerLockElement !== renderer.domElement) {
                // If it didn't work, try again
                requestPointerLockWithRetry(attempts + 1);
            }
        }, 100);
    } catch (error) {
        console.error('Error requesting pointer lock:', error);
    }
}

document.addEventListener('pointerlockerror', () => {
    console.error('Pointer lock error');
});

// Input handling
document.addEventListener('keydown', (event) => {
    const key = event.key?.toLowerCase();
    if (key && key in keys) {
        keys[key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key?.toLowerCase();
    if (key && key in keys) {
        keys[key] = false;
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
        createCoordinateDisplay(); // Create coordinate display
        createLeaderboard(); // Create leaderboard
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

// Modify click event listener to check for pause state
document.addEventListener('click', (e) => {
    // Don't allow shooting if paused or controls are disabled
    if (isPaused || !controlsEnabled) return;

    if (isGameStarted && canThrow && isAlive && !isDead && !isReloading && snowballCount > 0) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        
        // Create snowball slightly in front of the camera for better visibility
        const position = new THREE.Vector3();
        camera.getWorldPosition(position);
        position.add(direction.clone().multiplyScalar(2));
        
        // Hide held snowball immediately
        if (heldSnowball) {
            heldSnowball.visible = false;
        }
        
        // Create and throw snowball with shooter ID
        const snowball = createSnowball(position, direction, socket.id);
        
        // Emit the exact velocity that was applied to the snowball
        socket.emit('throwSnowball', { 
            position: position,
            velocity: snowball.body.velocity,
            shooterId: socket.id
        });

        // Decrease snowball count and update UI
        snowballCount--;
        updateSnowballMeter();

        canThrow = false;
        setTimeout(() => {
            canThrow = true;
            if (!isReloading && snowballCount > 0) {
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
    
    // Show death overlay with animation
    const deathOverlay = document.getElementById('deathOverlay');
    const respawnProgressFill = document.getElementById('respawnProgressFill');
    const respawnTimer = document.getElementById('respawnTimer');
    const deathMessage = document.getElementById('deathMessage');
    
    deathOverlay.style.display = 'flex';
    deathMessage.textContent = 'YOU DIED!';
    
    // Start respawn countdown
    let timeLeft = 3;
    respawnTimer.textContent = timeLeft;
    
    // Update progress bar and timer
    const startTime = Date.now();
    const respawnInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const progress = Math.min(elapsedTime / RESPAWN_DELAY, 1);
        respawnProgressFill.style.transform = `scaleX(${progress})`;
        
        timeLeft = Math.ceil(3 - (elapsedTime / 1000));
        if (timeLeft > 0) {
            respawnTimer.textContent = timeLeft;
        }
        
        if (elapsedTime >= RESPAWN_DELAY) {
            clearInterval(respawnInterval);
            deathMessage.textContent = 'Respawning...';
        }
    }, 50);
    
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
    const spawnPosition = getRandomSpawnPosition();

    if (playerId === socket.id) {
        // Reset all player states
        isDead = false;
        isAlive = true;
        health = MAX_HEALTH;
        updateHealthDisplay();
        
        // Reset player's body color
        if (playerMesh) {
            playerMesh.traverse((child) => {
                if (child.isMesh) {
                    child.material.color.setHex(0xffffff);
                }
            });
        }
        
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

        // Hide death overlay
        const deathOverlay = document.getElementById('deathOverlay');
        const respawnProgressFill = document.getElementById('respawnProgressFill');
        deathOverlay.style.display = 'none';
        respawnProgressFill.style.transform = 'scaleX(0)';

        // Re-enable controls
        canThrow = true;
        canJump = true;

        // Notify server of respawn
        socket.emit('playerRespawned', { id: playerId, position: spawnPosition });

        // Final step: Request pointer lock after a short delay to ensure all states are updated
        setTimeout(() => {
            if (document.pointerLockElement !== renderer.domElement) {
                requestPointerLockWithRetry();
            }
        }, 100);
    } else {
        // Reset other player's color if they died
        const otherPlayer = players.get(playerId);
        if (otherPlayer) {
            otherPlayer.meshes.forEach((mesh) => {
                mesh.material = otherPlayer.materials.normal[0];
            });
        }
        socket.emit('playerRespawned', { id: playerId, position: spawnPosition });
    }
}

function getRandomSpawnPosition() {
    let position;
    do {
        // Generate random position within the specified bounds
        position = {
            x: 10 + Math.random() * 380, // Random between 10 and 390
            y: PLAYER_HEIGHT / 2,
            z: 10 + Math.random() * 380  // Random between 10 and 390
        };
    } while (
        // Check if position is in the fort area (x: [140, 260] and z: [140, 260])
        (position.x >= 140 && position.x <= 260 && position.z >= 140 && position.z <= 260)
    );
    
    return position;
}

// Add after the updateHealthDisplay function
function createSprintMeter() {
    // Function is now empty as we're using the HUD bar meters
}

function updateSprintMeter() {
    const sprintBarFill = document.getElementById('sprintBarFill');
    if (sprintBarFill) {
        const percentage = (sprintMeter / MAX_SPRINT_DURATION) * 100;
        sprintBarFill.style.width = percentage + '%';
        sprintBarFill.style.backgroundColor = percentage < 30 ? '#f44336' : '#DBA507';
    }
}

function updateDashMeter() {
    const dashBarFill = document.getElementById('dashBarFill');
    const dashText = document.getElementById('dashText');
    if (dashBarFill && dashText) {
        const now = Date.now();
        
        if (!hasTouchedGroundSinceDash) {
            dashBarFill.style.width = '0%';
            dashText.textContent = 'TOUCH GROUND';
            canDash = false;
            lastDashTime = now;
        } else {
            const timeSinceLastDash = now - lastDashTime;
            const percentage = Math.min(100, (timeSinceLastDash / DASH_COOLDOWN) * 100);
            dashBarFill.style.width = percentage + '%';
            
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

// Add after the createScreenFlash function
function createCoordinateDisplay() {
    // Check if the display already exists
    if (document.getElementById('coordinateDisplay')) return;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.left = '20px'; // Changed from right to left
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.color = 'white';
    container.style.padding = '10px 15px';
    container.style.borderRadius = '5px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.fontSize = '16px';
    container.style.zIndex = '1000';
    container.id = 'coordinateDisplay';
    container.style.display = 'none'; // Hide initially
    document.body.appendChild(container);
}

function updateCoordinateDisplay() {
    if (!playerBody || !isGameStarted) return;
    
    const container = document.getElementById('coordinateDisplay');
    if (!container) return;
    
    const x = Math.round(playerBody.position.x);
    const z = Math.round(playerBody.position.z);
    
    container.innerHTML = `X: ${x}<br>Y: ${z}`;
}

// Create leaderboard UI
function createLeaderboard() {
    const container = document.createElement('div');
    container.id = 'leaderboard';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    container.style.padding = '15px';
    container.style.color = 'white';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.minWidth = '250px';
    container.style.display = 'none';
    container.style.borderRadius = '10px';
    container.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
    container.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    container.style.backdropFilter = 'blur(5px)';

    const title = document.createElement('div');
    title.textContent = 'LEADERBOARD';
    title.style.textAlign = 'center';
    title.style.marginBottom = '15px';
    title.style.fontWeight = 'bold';
    title.style.fontSize = '18px';
    title.style.letterSpacing = '2px';
    title.style.color = '#FFD700';
    title.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.5)';
    title.style.paddingBottom = '10px';
    title.style.borderBottom = '2px solid rgba(255, 215, 0, 0.3)';
    container.appendChild(title);

    const list = document.createElement('div');
    list.id = 'leaderboardList';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';
    container.appendChild(list);

    document.body.appendChild(container);
}

// Simple leaderboard update function
function updateLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (!list) return;

    // Clear the list
    list.innerHTML = '';

    // Create a Map to track unique players by name
    const uniquePlayers = new Map();

    // First pass: collect all players with their highest kill count
    playerKills.forEach((kills, id) => {
        let name;
        if (id === socket.id) {
            const nameInput = document.getElementById('nameInput');
            name = nameInput ? nameInput.value.trim() : 'Player';
        } else {
            name = playerNames.get(id) || 'Unknown';
        }

        // If this player name already exists, only update if the new kill count is higher
        if (uniquePlayers.has(name)) {
            const existing = uniquePlayers.get(name);
            if (kills > existing.kills) {
                uniquePlayers.set(name, {
                    name,
                    kills,
                    isLocalPlayer: id === socket.id
                });
            }
        } else {
            uniquePlayers.set(name, {
                name,
                kills,
                isLocalPlayer: id === socket.id
            });
        }
    });

    // Convert to array and sort by kills
    const players = Array.from(uniquePlayers.values())
        .sort((a, b) => b.kills - a.kills);

    // Show top 3 players
    for (let i = 0; i < 3; i++) {
        const entry = document.createElement('div');
        entry.style.padding = '10px';
        entry.style.marginBottom = '5px';
        entry.style.borderRadius = '5px';
        entry.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        entry.style.transition = 'all 0.3s ease';
        entry.style.display = 'flex';
        entry.style.justifyContent = 'space-between';
        entry.style.alignItems = 'center';

        if (i < players.length) {
            const player = players[i];
            
            // Create rank number
            const rank = document.createElement('span');
            rank.style.fontWeight = 'bold';
            rank.style.color = '#FFD700';
            rank.style.marginRight = '10px';
            rank.textContent = `#${i + 1}`;
            entry.appendChild(rank);

            // Create player info container
            const playerInfo = document.createElement('div');
            playerInfo.style.flex = '1';
            playerInfo.style.display = 'flex';
            playerInfo.style.justifyContent = 'space-between';
            playerInfo.style.alignItems = 'center';

            // Create name span
            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name;
            nameSpan.style.color = player.isLocalPlayer ? '#00FF00' : 'white';
            nameSpan.style.fontWeight = player.isLocalPlayer ? 'bold' : 'normal';
            nameSpan.style.textShadow = player.isLocalPlayer ? '0 0 5px rgba(0, 255, 0, 0.5)' : 'none';

            // Create kills span
            const killsSpan = document.createElement('span');
            killsSpan.textContent = `${player.kills} kills`;
            killsSpan.style.color = '#FFD700';
            killsSpan.style.fontWeight = 'bold';
            killsSpan.style.marginLeft = '10px';

            playerInfo.appendChild(nameSpan);
            playerInfo.appendChild(killsSpan);
            entry.appendChild(playerInfo);

            // Add hover effect
            entry.addEventListener('mouseover', () => {
                entry.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                entry.style.transform = 'translateX(-5px)';
            });

            entry.addEventListener('mouseout', () => {
                entry.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                entry.style.transform = 'translateX(0)';
            });
        } else {
            entry.textContent = '---';
            entry.style.color = 'rgba(255, 255, 255, 0.3)';
            entry.style.fontStyle = 'italic';
        }

        list.appendChild(entry);
    }
}

// Update leaderboard on kill
socket.on('killUpdate', (data) => {
    // Store both killer and victim names
    if (data.killerName) {
        playerNames.set(data.killerId, data.killerName);
    }
    if (data.victimName) {
        playerNames.set(data.victimId, data.victimName);
    }
    
    playerKills.set(data.killerId, data.kills);
    updateLeaderboard();
});

// Update when players join
socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        playerNames.set(id, players[id].name);
        playerKills.set(id, players[id].kills || 0);
    });
    updateLeaderboard();
});

// Update when players leave
socket.on('playerDisconnected', (playerId) => {
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
});

// Add the game loop
function animate() {
    requestAnimationFrame(animate);

    // When paused, only render the scene and pause menu
    if (isPaused) {
        // Disable all player movement and physics
        if (playerBody) {
            playerBody.velocity.set(0, 0, 0);
            playerBody.angularVelocity.set(0, 0, 0);
        }
        renderer.render(scene, camera);
        return;
    }

    // Add reload animation update
    updateReloadAnimation();

    // Fixed time step for physics
    const fixedTimeStep = 1.0 / 60.0;
    const maxSubSteps = 3;
    world.step(fixedTimeStep, fixedTimeStep, maxSubSteps);

    // Update player positions including dead players
    players.forEach((player, id) => {
        if (player.mesh && player.body) {
            // For dead players, only update position (they're affected by physics)
            if (player.isDead) {
                player.mesh.position.copy(player.body.position);
                player.mesh.quaternion.copy(player.body.quaternion);
            } else {
                // Normal position update for living players
                player.mesh.position.copy(player.body.position);
                player.mesh.quaternion.copy(player.body.quaternion);
            }
        }
    });

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
                player.bodyParts.body.position.y *= scale;
                player.bodyParts.head.position.y *= scale;
                player.bodyParts.leftEye.position.y *= scale;
                player.bodyParts.rightEye.position.y *= scale;
                player.bodyParts.nose.position.y *= scale;
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
                    player.bodyParts.body.position.y = PLAYER_HEIGHT / 3;
                    player.bodyParts.head.position.y = PLAYER_HEIGHT / 3 + 0.8;  // Position head above body with slight intersection
                    player.bodyParts.leftEye.position.y = PLAYER_HEIGHT / 3 + 0.9;
                    player.bodyParts.rightEye.position.y = PLAYER_HEIGHT / 3 + 0.9;
                    player.bodyParts.nose.position.y = PLAYER_HEIGHT / 3 + 0.8;
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
                    
                    // Hit confirmed - include shooter ID
                    socket.emit('playerHit', { 
                        id,
                        position: snowball.mesh.position.clone(),
                        velocity: snowball.body.velocity.clone(),
                        shooterId: snowball.shooterId
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

    // Update name labels to face camera
    updateNameLabels();

    // Update coordinate display
    updateCoordinateDisplay();

    renderer.render(scene, camera);
}

// Start game
// createPlayer(socket.id, getRandomSpawnPosition());

// Add title screen handling
const titleScreen = document.getElementById('titleScreen');
const playButton = document.getElementById('playButton');
const healthDisplay = document.getElementById('healthDisplay');
const snowballMeter = document.getElementById('snowballMeter');
const deathOverlay = document.getElementById('deathOverlay');

// Hide game UI elements initially
healthDisplay.style.display = 'none';
snowballMeter.style.display = 'none';
deathOverlay.style.display = 'none';

// Handle play button click
playButton.addEventListener('click', () => {
    const playerName = document.getElementById('nameInput').value.trim() || 'Player';
    
    // Send player name to server first
    socket.emit('playerName', playerName);
    
    // Initialize local player's kills and name
    playerKills.set(socket.id, 0);
    playerNames.set(socket.id, playerName);
    
    // Hide UI elements
    titleScreen.style.display = 'none';
    healthDisplay.style.display = 'block';
    snowballMeter.style.display = 'block';
    
    // Create local player
    const player = createPlayer(socket.id, getRandomSpawnPosition(), playerName);
    players.set(socket.id, player);
    
    // Create and show game log
    createGameLog();
    document.getElementById('gameLog').style.display = 'block';
    
    // Start the game and request pointer lock
    startGame();
    updateLeaderboard();
    
    // Add join message for local player
    addGameLogMessage(`You have joined the game`, 'join');
});

// Start game
updateSnowballMeter();
animate(); 

// Add kill update handler
socket.on('killUpdate', (data) => {
    console.log('Kill update received:', data);
    
    // Make sure kills is a number
    const kills = typeof data.kills === 'number' ? data.kills : 0;
    
    // Update killer's kill count
    playerKills.set(data.killerId, kills);
    
    // Update personal kill counter if the kill was by the local player
    if (data.killerId === socket.id) {
        updateKillCounter(kills);
    }
    
    console.log(`Updated kills for ${data.killerName}: ${kills}`);
    console.log('Current kill counts:', Array.from(playerKills.entries()));
    
    // Update the leaderboard immediately
    updateLeaderboard();
    
    // Display kill feed message
    const killFeedMessage = `${data.killerName} eliminated ${data.victimName}`;
    
    // Create kill feed element
    const killFeed = document.createElement('div');
    killFeed.style.position = 'fixed';
    killFeed.style.right = '20px';
    killFeed.style.top = '120px';
    killFeed.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    killFeed.style.color = 'white';
    killFeed.style.padding = '5px 10px';
    killFeed.style.borderRadius = '5px';
    killFeed.style.fontFamily = 'Arial, sans-serif';
    killFeed.style.fontSize = '14px';
    killFeed.style.zIndex = '1000';
    killFeed.textContent = killFeedMessage;
    document.body.appendChild(killFeed);
    
    // Remove kill feed message after 3 seconds
    setTimeout(() => {
        document.body.removeChild(killFeed);
    }, 3000);
});

// Display kill feed message
function displayKillFeed(message) {
    const killFeedElement = document.getElementById('kill-feed');
    if (!killFeedElement) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'kill-feed-message';
    messageElement.textContent = message;
    
    killFeedElement.appendChild(messageElement);
    
    // Remove message after 3 seconds
    setTimeout(() => {
        messageElement.remove();
    }, 3000);
}

// Handle new player connections
socket.on('currentPlayers', (players) => {
    Object.keys(players).forEach((id) => {
        const player = players[id];
        playerNames.set(id, player.name);
        if (player.kills !== undefined) {
            playerKills.set(id, player.kills);
        }
    });
    updateLeaderboard();
});

// Handle player disconnection
socket.on('playerDisconnected', (playerId) => {
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
});

socket.on('connect', () => {
    console.log('Connected to server');
});

function createGameLog() {
    if (document.getElementById('gameLog')) return;

    const container = document.createElement('div');
    container.id = 'gameLog';
    container.style.position = 'fixed';
    container.style.left = '20px';
    container.style.bottom = '200px';
    container.style.width = '400px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.borderRadius = '5px';
    container.style.padding = '10px';
    container.style.zIndex = '1000';
    container.style.display = 'none';

    // Add header
    const header = document.createElement('div');
    header.className = 'gameLogHeader';
    header.textContent = 'KILL FEED';
    header.style.textAlign = 'center';
    header.style.fontWeight = 'bold';
    header.style.marginBottom = '10px';
    header.style.padding = '5px';
    header.style.borderBottom = '2px solid rgba(255, 255, 255, 0.2)';
    container.appendChild(header);

    // Add content container
    const content = document.createElement('div');
    content.className = 'gameLogContent';
    content.style.height = '150px';
    content.style.overflowY = 'hidden';
    content.style.fontFamily = 'Consolas, monospace';
    content.style.fontSize = '14px';
    container.appendChild(content);

    document.body.appendChild(container);
}

function addGameLogMessage(message, type = 'default') {
    const gameLog = document.getElementById('gameLog');
    if (!gameLog) return;

    const gameLogContent = document.querySelector('.gameLogContent');
    if (!gameLogContent) return;

    // Create a unique message ID
    const messageId = `${type}_${message}`;
    
    // If this exact message was already processed, ignore it
    if (processedMessageIds.has(messageId)) {
        return;
    }
    
    // Add to processed messages
    processedMessageIds.add(messageId);
    
    // Clear the message ID after a short delay
    setTimeout(() => {
        processedMessageIds.delete(messageId);
    }, 1000);

    const messageElement = document.createElement('div');
    messageElement.className = `gameLogEntry ${type}`;
    messageElement.style.padding = '5px 10px';
    messageElement.style.marginBottom = '5px';
    messageElement.style.borderRadius = '3px';
    messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    messageElement.style.borderLeft = '3px solid';

    switch(type) {
        case 'kill':
            messageElement.style.borderLeftColor = '#ff4444';
            messageElement.style.color = '#ff4444';
            break;
        case 'join':
            messageElement.style.borderLeftColor = '#44ff44';
            messageElement.style.color = '#44ff44';
            break;
        case 'leave':
            messageElement.style.borderLeftColor = '#ffff44';
            messageElement.style.color = '#ffff44';
            break;
        default:
            messageElement.style.borderLeftColor = '#ffffff';
            messageElement.style.color = '#ffffff';
    }

    messageElement.textContent = message;
    gameLogContent.appendChild(messageElement);

    // Keep only last 5 messages
    while (gameLogContent.children.length > 5) {
        gameLogContent.removeChild(gameLogContent.firstChild);
    }

    // Auto-scroll to bottom
    gameLogContent.scrollTop = gameLogContent.scrollHeight;

    // Auto-delete message after 10 seconds
    setTimeout(() => {
        if (messageElement && messageElement.parentNode === gameLogContent) {
            gameLogContent.removeChild(messageElement);
        }
    }, 10000);
}

// ... existing code ...

// Modify the playButton click handler to show game log
playButton.addEventListener('click', () => {
    const playerName = document.getElementById('nameInput').value.trim() || 'Player';
    
    socket.emit('playerName', playerName);
    playerKills.set(socket.id, 0);
    playerNames.set(socket.id, playerName);
    
    titleScreen.style.display = 'none';
    healthDisplay.style.display = 'block';
    snowballMeter.style.display = 'block';
    
    const player = createPlayer(socket.id, getRandomSpawnPosition(), playerName);
    players.set(socket.id, player);
    
    // Create and show game log
    createGameLog();
    document.getElementById('gameLog').style.display = 'block';
    
    startGame();
    updateLeaderboard();
    
    // Add join message for local player
    addGameLogMessage(`You have joined the game`, 'join');
});

// Modify socket event handlers to add game log messages
socket.on('newPlayer', (playerInfo) => {
    const player = createPlayer(playerInfo.id, playerInfo.position, playerInfo.name);
    players.set(playerInfo.id, player);
    playerNames.set(playerInfo.id, playerInfo.name || 'Unknown');
    playerKills.set(playerInfo.id, playerInfo.kills || 0);
    updateLeaderboard();
    
    // Add join message
    addGameLogMessage(`${playerInfo.name || 'Unknown'} has joined the game`, 'join');
});

socket.on('killUpdate', (data) => {
    console.log('Kill update received:', data);
    
    const kills = typeof data.kills === 'number' ? data.kills : 0;
    playerKills.set(data.killerId, kills);
    
    // Update personal kill counter if the kill was by the local player
    if (data.killerId === socket.id) {
        updateKillCounter(kills);
    }
    
    console.log(`Updated kills for ${data.killerName}: ${kills}`);
    console.log('Current kill counts:', Array.from(playerKills.entries()));
    
    updateLeaderboard();
    
    // Add kill message to game log
    addGameLogMessage(`${data.killerName} eliminated ${data.victimName}`, 'kill');
    
    // Create kill feed message
    const killFeed = document.createElement('div');
    killFeed.style.position = 'fixed';
    killFeed.style.right = '20px';
    killFeed.style.top = '120px';
    killFeed.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    killFeed.style.color = 'white';
    killFeed.style.padding = '5px 10px';
    killFeed.style.borderRadius = '5px';
    killFeed.style.fontFamily = 'Arial, sans-serif';
    killFeed.style.fontSize = '14px';
    killFeed.style.zIndex = '1000';
    killFeed.textContent = `${data.killerName} eliminated ${data.victimName}`;
    document.body.appendChild(killFeed);
    
    // Remove kill feed message after 3 seconds
    setTimeout(() => {
        document.body.removeChild(killFeed);
    }, 3000);
});

socket.on('playerDisconnected', (playerId) => {
    const playerName = playerNames.get(playerId) || 'Unknown';
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
    
    // Add leave message
    addGameLogMessage(`${playerName} has left the game`, 'leave');
    
    const player = players.get(playerId);
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
});


// Add event listeners for pause menu buttons
document.getElementById('resumeButton').addEventListener('click', (e) => {
    // Prevent the click from triggering snowball throw
    e.stopPropagation();
    
    // Disable controls until fully restored
    controlsEnabled = false;
    
    // Hide pause menu immediately
    const pauseMenu = document.getElementById('pauseMenu');
    if (pauseMenu) {
        pauseMenu.style.display = 'none';
    }
    
    // Function to attempt pointer lock
    const attemptPointerLock = () => {
        renderer.domElement.requestPointerLock();
        
        // Check if pointer lock was successful after a short delay
        setTimeout(() => {
            if (document.pointerLockElement !== renderer.domElement) {
                // If not successful, try again
                attemptPointerLock();
            }
        }, 100);
    };
    
    // Start the first attempt after menu is hidden
    setTimeout(() => {
        attemptPointerLock();
    }, 50);
});

document.getElementById('exitButton').addEventListener('click', () => {
    isExitingGame = true;
    returnToTitleScreen();
});

// Add ESC key handler
document.addEventListener('keydown', (event) => {
    // Only allow ESC key for pausing if not dead
    if (event.key === 'Escape' && isGameStarted && !isDead) {
        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
        return;
    }

    // Don't process other keys if paused or controls are disabled
    if (isPaused || !controlsEnabled) return;

    const key = event.key?.toLowerCase();
    if (key && key in keys) {
        keys[key] = true;
    }
    
    // Handle reload key
    if (key === 'r') {
        startReload();
    }
});

// Add after other socket event handlers

socket.on('playerHidden', (playerId) => {
    const player = players.get(playerId);
    if (player) {
        player.mesh.visible = false;
    }
});

socket.on('playerReturned', (data) => {
    const player = players.get(data.id);
    if (player) {
        player.mesh.visible = true;
        player.body.position.copy(data.position);
        player.mesh.position.copy(data.position);
    }
});

// For sprint bar
const sprintBarFill = document.getElementById('sprintBarFill');
sprintBarFill.style.width = `${(sprintMeter / MAX_SPRINT_DURATION) * 100}%`;

// For dash bar
const dashBarFill = document.getElementById('dashBarFill');
dashBarFill.style.width = `${((DASH_COOLDOWN - (Date.now() - lastDashTime)) / DASH_COOLDOWN) * 100}%`;

function updateKillCounter(kills) {
    const killCounter = document.getElementById('killCounter');
    if (killCounter) {
        killCounter.textContent = `Kills: ${kills}`;
    }
}

// Add after player variables
const messageCache = new Set();
const MESSAGE_CACHE_TIMEOUT = 2000; // 2 seconds


// Modify socket event handlers
socket.on('newPlayer', (playerInfo) => {
    // Create unique ID for join message
    const joinMessageId = `join_${playerInfo.id}_${Date.now()}`;
    
    // Only proceed if we haven't processed this player recently
    if (!players.has(playerInfo.id)) {
        const player = createPlayer(playerInfo.id, playerInfo.position, playerInfo.name);
        players.set(playerInfo.id, player);
        playerNames.set(playerInfo.id, playerInfo.name || 'Unknown');
        playerKills.set(playerInfo.id, playerInfo.kills || 0);
        updateLeaderboard();
        
        // Add join message with unique ID
        addGameLogMessage(`${playerInfo.name || 'Unknown'} has joined the game`, 'join', joinMessageId);
    }
});

socket.on('playerDisconnected', (playerId) => {
    // Create unique ID for leave message
    const leaveMessageId = `leave_${playerId}_${Date.now()}`;
    
    const playerName = playerNames.get(playerId) || 'Unknown';
    const player = players.get(playerId);
    
    // Add leave message with unique ID
    addGameLogMessage(`${playerName} has left the game`, 'leave', leaveMessageId);
    
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
    
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
});

socket.on('killUpdate', (data) => {
    // Create unique ID for kill message
    const killMessageId = `kill_${data.killerId}_${data.victimId}_${Date.now()}`;
    
    const kills = typeof data.kills === 'number' ? data.kills : 0;
    playerKills.set(data.killerId, kills);
    
    if (data.killerId === socket.id) {
        updateKillCounter(kills);
    }
    
    updateLeaderboard();
    
    // Add kill message with unique ID
    addGameLogMessage(`${data.killerName} eliminated ${data.victimName}`, 'kill', killMessageId);
});

// Update the play button click handler
playButton.addEventListener('click', () => {
    const playerName = document.getElementById('nameInput').value.trim() || 'Player';
    
    socket.emit('playerName', playerName);
    playerKills.set(socket.id, 0);
    playerNames.set(socket.id, playerName);
    
    titleScreen.style.display = 'none';
    healthDisplay.style.display = 'block';
    snowballMeter.style.display = 'block';
    
    const player = createPlayer(socket.id, getRandomSpawnPosition(), playerName);
    players.set(socket.id, player);
    
    createGameLog();
    document.getElementById('gameLog').style.display = 'block';
    
    startGame();
    updateLeaderboard();
    
    // Add join message with unique ID for local player
    const localJoinId = `join_${socket.id}_${Date.now()}`;
    addGameLogMessage(`You have joined the game`, 'join', localJoinId);
});

// Add after player variables
const processedMessageIds = new Set();

// Remove all duplicate event listeners and keep only one set
socket.removeAllListeners('newPlayer');
socket.removeAllListeners('playerDisconnected');
socket.removeAllListeners('killUpdate');

// Add single event listener for each event type
socket.on('newPlayer', (playerInfo) => {
    if (!players.has(playerInfo.id)) {
        const player = createPlayer(playerInfo.id, playerInfo.position, playerInfo.name);
        players.set(playerInfo.id, player);
        playerNames.set(playerInfo.id, playerInfo.name || 'Unknown');
        playerKills.set(playerInfo.id, playerInfo.kills || 0);
        updateLeaderboard();
        
        addGameLogMessage(`${playerInfo.name || 'Unknown'} has joined the game`, 'join');
    }
});

socket.on('playerDisconnected', (playerId) => {
    const playerName = playerNames.get(playerId) || 'Unknown';
    const player = players.get(playerId);
    
    addGameLogMessage(`${playerName} has left the game`, 'leave');
    
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(playerId);
    }
    
    playerKills.delete(playerId);
    playerNames.delete(playerId);
    updateLeaderboard();
});

socket.on('killUpdate', (data) => {
    const kills = typeof data.kills === 'number' ? data.kills : 0;
    playerKills.set(data.killerId, kills);
    
    if (data.killerId === socket.id) {
        updateKillCounter(kills);
    }
    
    updateLeaderboard();
    addGameLogMessage(`${data.killerName} eliminated ${data.victimName}`, 'kill');
});

// Add cleanup handler for browser tab closure
window.addEventListener('beforeunload', () => {
    // Notify server that player has left
    socket.emit('playerDisconnected', socket.id);
    
    // Clean up local player data
    const player = players.get(socket.id);
    if (player) {
        scene.remove(player.mesh);
        world.removeBody(player.body);
        players.delete(socket.id);
    }
    
    playerKills.delete(socket.id);
    playerNames.delete(socket.id);
});

// Handle play button click
playButton.addEventListener('click', () => {
    const playerName = document.getElementById('nameInput').value.trim() || 'Player';
    
    socket.emit('playerName', playerName);
    playerKills.set(socket.id, 0);
    playerNames.set(socket.id, playerName);
    
    titleScreen.style.display = 'none';
    healthDisplay.style.display = 'block';
    snowballMeter.style.display = 'block';
    
    const player = createPlayer(socket.id, getRandomSpawnPosition(), playerName);
    players.set(socket.id, player);
    
    createGameLog();
    document.getElementById('gameLog').style.display = 'block';
    
    startGame();
    updateLeaderboard();
    
    addGameLogMessage(`You have joined the game`, 'join');
});


