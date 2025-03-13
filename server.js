const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Add error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// Add error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Starting server initialization...');

app.use(express.static('public'));
console.log('Static middleware configured...');

const players = new Map();
const RESPAWN_TIME = 5000; // 5 seconds
const MAX_HEALTH = 100;
const DAMAGE_PER_HIT = 30;

// Add spawn position constants
const ARENA_SIZE = 220; // Changed to match actual playable area
const SAFE_SPAWN_MARGIN = 20; // Keep players away from walls

function getRandomSpawnPosition() {
    // Generate a random position in quadrant 4 (positive x, positive z)
    const minX = 20; // Minimum safe distance from center
    const minZ = 20; // Minimum safe distance from center
    const maxX = ARENA_SIZE/2 - SAFE_SPAWN_MARGIN; // Maximum safe distance from wall
    const maxZ = ARENA_SIZE/2 - SAFE_SPAWN_MARGIN; // Maximum safe distance from wall
    
    return {
        x: minX + Math.random() * (maxX - minX),
        y: 1, // Keep this at player height
        z: minZ + Math.random() * (maxZ - minZ)
    };
}

io.on('connection', (socket) => {
    console.log('A user connected');

    // Initialize player with safe spawn position
    players.set(socket.id, {
        id: socket.id,
        position: getRandomSpawnPosition(),
        rotation: { x: 0, y: 0, z: 0 },
        health: MAX_HEALTH,
        isAlive: true,
        isHit: false
    });

    // Send current players to new player
    socket.emit('currentPlayers', Array.from(players.values()));

    // Broadcast new player to others
    socket.broadcast.emit('newPlayer', players.get(socket.id));

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player && player.isAlive) {
            player.position = data.position;
            player.rotation = data.rotation;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: player.position,
                rotation: player.rotation
            });
        }
    });

    // Handle snowball throws
    socket.on('throwSnowball', (data) => {
        // Broadcast the exact snowball data to all other clients
        socket.broadcast.emit('snowballThrown', {
            id: socket.id,
            position: {
                x: data.position.x,
                y: data.position.y,
                z: data.position.z
            },
            velocity: {
                x: data.velocity.x,
                y: data.velocity.y,
                z: data.velocity.z
            }
        });
    });

    // Handle hit detection
    socket.on('playerHit', (data) => {
        const hitPlayer = players.get(data.id);
        if (hitPlayer && hitPlayer.isAlive) {
            // Update health
            const oldHealth = hitPlayer.health;
            hitPlayer.health -= DAMAGE_PER_HIT;
            console.log(`Player hit! Damage: ${DAMAGE_PER_HIT}, Old Health: ${oldHealth}, New Health: ${hitPlayer.health}`);
            
            // Emit health update
            io.emit('playerHit', {
                id: data.id,
                health: hitPlayer.health,
                damage: DAMAGE_PER_HIT
            });
            
            // Instant death and respawn if health below 0
            if (hitPlayer.health <= 0) {
                console.log('Player died, respawning...');
                // Get a random spawn position using our function
                const spawnPos = getRandomSpawnPosition();
                
                // Reset player state
                hitPlayer.health = MAX_HEALTH;
                hitPlayer.position = spawnPos;
                hitPlayer.isAlive = true;
                
                // Emit respawn event with new position and health
                io.emit('playerRespawn', {
                    id: data.id,
                    position: spawnPos,
                    health: MAX_HEALTH
                });
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected');
        players.delete(socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});

// Add error handling for the HTTP server
http.on('error', (err) => {
    console.error('HTTP Server error:', err);
});

// Add error handling for Socket.IO
io.on('error', (err) => {
    console.error('Socket.IO error:', err);
}); 