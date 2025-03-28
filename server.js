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

app.use(express.static('public'));

const players = new Map();
const playerNames = new Map();
const playerKills = new Map(); // Add kill tracking
const RESPAWN_TIME = 3000; // 3 seconds
const MAX_HEALTH = 100;
const DAMAGE_PER_HIT = 30;

// Add spawn position constants
const ARENA_SIZE = 440; // Changed to match actual playable area (400 + 40 for safety)
const SAFE_SPAWN_MARGIN = 40; // Doubled from 20

// Add GameMap class for server-side map generation
class GameMap {
    constructor() {
        this.width = 400;
        this.height = 400;
        this.naturalElements = [];
        this.initializeMap();
    }

    initializeMap() {
        const naturalElementsPositions = [];
        const fortCenter = {
            x: this.width / 2,
            y: this.height / 2
        };

        // Place cubes first
        const cubeSize = 7;
        
        // Inner ring: 12 cubes
        const innerRadius = 60;
        const innerCount = 12;
        this.placeCubesInRing(innerRadius, innerCount, fortCenter, cubeSize, naturalElementsPositions);

        // Outer ring: 18 cubes
        const outerRadius = 110;
        const outerCount = 18;
        this.placeCubesInRing(outerRadius, outerCount, fortCenter, cubeSize, naturalElementsPositions);

        // Then add trees
        const treeCount = 500;
        const padding = 30;

        // Create a grid-based placement system for better distribution
        const gridSize = Math.ceil(Math.sqrt(treeCount));
        const cellWidth = this.width / gridSize;
        const cellHeight = this.height / gridSize;

        for (let i = 0; i < treeCount; i++) {
            let attempts = 0;
            const maxAttempts = 1000;
            
            while (attempts < maxAttempts) {
                const gridX = i % gridSize;
                const gridY = Math.floor(i / gridSize);
                
                const cellStartX = gridX * cellWidth;
                const cellStartY = gridY * cellHeight;
                
                const x = cellStartX + padding + Math.random() * (cellWidth - 2 * padding);
                const y = cellStartY + padding + Math.random() * (cellHeight - 2 * padding);
                
                if (this.isValidTreePosition(x, y, fortCenter, naturalElementsPositions)) {
                    naturalElementsPositions.push({
                        x, y,
                        radius: 4 + Math.random() * 2,
                        type: 'tree'
                    });
                    break;
                }
                attempts++;
            }
        }

        this.naturalElements = naturalElementsPositions;
    }

    isValidTreePosition(x, y, fortCenter, elements) {
        const distanceToFort = Math.sqrt(
            Math.pow(x - fortCenter.x, 2) + 
            Math.pow(y - fortCenter.y, 2)
        );
        if (distanceToFort < 60) return false;

        const padding = 10;
        if (x < padding || x > this.width - padding || 
            y < padding || y > this.height - padding) {
            return false;
        }

        for (const element of elements) {
            const distance = Math.sqrt(
                Math.pow(x - element.x, 2) + 
                Math.pow(y - element.y, 2)
            );
            const minDistance = element.type === 'cover' ? 16 : 20;
            if (distance < minDistance) return false;
        }

        return true;
    }

    placeCubesInRing(radius, count, center, cubeSize, naturalElementsPositions) {
        const angleStep = (Math.PI * 2) / count;
        
        for (let i = 0; i < count; i++) {
            const angle = i * angleStep;
            
            const x = center.x + radius * Math.cos(angle);
            const y = center.y + radius * Math.sin(angle);

            const cube = {
                x, y,
                width: cubeSize,
                height: cubeSize,
                depth: cubeSize,
                type: 'cover'
            };

            naturalElementsPositions.push(cube);
        }
    }
}

// Create a single game map instance for the server
const gameMap = new GameMap();

function getRandomSpawnPosition() {
    let position;
    do {
        // Generate random position within the specified bounds
        position = {
            x: 10 + Math.random() * 380, // Random between 10 and 390
            y: 1,
            z: 10 + Math.random() * 380  // Random between 10 and 390
        };
    } while (
        // Check if position is in the fort area (x: [140, 260] and z: [140, 260])
        (position.x >= 140 && position.x <= 260 && position.z >= 140 && position.z <= 260)
    );
    
    return position;
}

io.on('connection', (socket) => {
    // Send map data immediately when client connects
    socket.emit('mapData', gameMap.naturalElements);

    // Handle new player connection
    socket.on('playerName', (name) => {
        console.log('New player connected:', { id: socket.id, name });
        
        // Initialize player data
        const spawnPosition = getRandomSpawnPosition();
        const player = {
            id: socket.id,
            name: name,
            position: spawnPosition,
            health: MAX_HEALTH,
            isAlive: true,
            kills: 0
        };
        
        players.set(socket.id, player);
        playerNames.set(socket.id, name);
        playerKills.set(socket.id, 0);
        
        // Send current players list and map data to the new player
        const playersList = Array.from(players.values()).map(p => ({
            id: p.id,
            name: playerNames.get(p.id),
            position: p.position,
            kills: playerKills.get(p.id) || 0
        }));
        
        socket.emit('currentPlayers', playersList);
        
        // Broadcast new player to all other players
        socket.broadcast.emit('newPlayer', {
            id: socket.id,
            name: name,
            position: spawnPosition,
            kills: 0
        });
    });

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
            },
            shooterId: data.shooterId
        });
    });

    // Handle hit detection
    socket.on('playerHit', (data) => {
        const hitPlayer = players.get(data.id);
        if (hitPlayer && hitPlayer.isAlive) {
            // Update health
            hitPlayer.health -= DAMAGE_PER_HIT;
            
            // Check if this hit resulted in a kill
            if (hitPlayer.health <= 0 && data.shooterId) {
                // Get current kills for the shooter
                const currentKills = (playerKills.get(data.shooterId) || 0) + 1;
                
                // Update kill count
                playerKills.set(data.shooterId, currentKills);
                
                console.log('Kill registered:', {
                    killer: data.shooterId,
                    victim: data.id,
                    killerKills: currentKills,
                    killerName: playerNames.get(data.shooterId),
                    victimName: playerNames.get(data.id)
                });
                
                // Broadcast kill update to all players
                io.emit('killUpdate', {
                    killerId: data.shooterId,
                    killerName: playerNames.get(data.shooterId),
                    victimName: playerNames.get(data.id),
                    kills: currentKills
                });
            }
            
            // Emit health update
            io.emit('playerHit', {
                id: data.id,
                health: hitPlayer.health,
                damage: DAMAGE_PER_HIT,
                shooterId: data.shooterId
            });
            
            // Handle death and respawn if health below 0
            if (hitPlayer.health <= 0) {
                hitPlayer.isAlive = false;
                
                // Emit death event
                io.emit('playerDeath', {
                    id: data.id,
                    killerId: data.shooterId
                });
                
                // Schedule respawn
                setTimeout(() => {
                    const spawnPos = getRandomSpawnPosition();
                    
                    // Reset player state
                    hitPlayer.health = MAX_HEALTH;
                    hitPlayer.position = spawnPos;
                    hitPlayer.isAlive = true;
                    
                    // Emit respawn event
                    io.emit('playerRespawn', {
                        id: data.id,
                        position: spawnPos,
                        health: MAX_HEALTH
                    });
                }, RESPAWN_TIME);
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const disconnectedPlayerKills = playerKills.get(socket.id) || 0;
        console.log('Player disconnected:', {
            id: socket.id,
            name: playerNames.get(socket.id),
            kills: disconnectedPlayerKills
        });
        
        players.delete(socket.id);
        playerNames.delete(socket.id);
        playerKills.delete(socket.id);
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('playerPaused', () => {
        const player = players.get(socket.id);
        if (player) {
            // Notify other players that this player is temporarily hidden
            socket.broadcast.emit('playerHidden', socket.id);
        }
    });

    socket.on('playerReturned', (data) => {
        const player = players.get(socket.id);
        if (player) {
            // Update player state
            player.position = data.position;
            player.health = data.health;
            player.isAlive = data.isAlive;

            // Notify other players that this player has returned
            socket.broadcast.emit('playerReturned', {
                id: socket.id,
                position: data.position,
                health: data.health,
                isAlive: data.isAlive
            });
        }
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