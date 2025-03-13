class GameMap {
    constructor() {
        this.width = 200;
        this.height = 200;
        this.walls = [];
        this.coverSpots = [];
        this.fort = null;
        this.naturalElements = [];
        
        this.initializeMap();
    }

    initializeMap() {
        // Create boundary walls
        this.createBoundaryWalls();
        // Create central fort
        this.createFort();
        // Add cover spots
        this.createCoverSpots();
        // Add natural elements
        this.createNaturalElements();
    }

    createBoundaryWalls() {
        const wallHeight = 60; // Make walls 40 units high
        const wallThickness = 5; // Make walls thicker

        // North wall
        this.walls.push({
            x: -wallThickness/2,
            y: -wallThickness/2,
            width: this.width + wallThickness,
            height: wallHeight,
            depth: wallThickness,
            type: 'wall'
        });
        // South wall
        this.walls.push({
            x: -wallThickness/2,
            y: this.height - wallThickness/2,
            width: this.width + wallThickness,
            height: wallHeight,
            depth: wallThickness,
            type: 'wall'
        });
        // West wall
        this.walls.push({
            x: -wallThickness/2,
            y: -wallThickness/2,
            width: wallThickness,
            height: wallHeight,
            depth: this.height + wallThickness,
            type: 'wall'
        });
        // East wall
        this.walls.push({
            x: this.width - wallThickness/2,
            y: -wallThickness/2,
            width: wallThickness,
            height: wallHeight,
            depth: this.height + wallThickness,
            type: 'wall'
        });
    }

    createFort() {
        const fortSize = 30;
        this.fort = {
            x: this.width / 2 - fortSize / 2,
            y: this.height / 2 - fortSize / 2,
            width: fortSize,
            height: fortSize,
            type: 'fort',
            // Add entrance points
            entrances: [
                { x: this.width / 2, y: this.height / 2 - fortSize / 2 }, // North
                { x: this.width / 2, y: this.height / 2 + fortSize / 2 }, // South
                { x: this.width / 2 - fortSize / 2, y: this.height / 2 }, // West
                { x: this.width / 2 + fortSize / 2, y: this.height / 2 }  // East
            ]
        };
    }

    createCoverSpots() {
        // We no longer need the old cover spots since we're using the ring-based system
        this.coverSpots = []; // Just initialize as empty array
    }

    createNaturalElements() {
        const naturalElementsPositions = [];
        const fortCenter = {
            x: this.width / 2,
            y: this.height / 2
        };

        // Clear and initialize cover spots array
        this.coverSpots = [];

        // Place cubes first
        const cubeSize = 6.5;
        
        // Inner ring: 12 cubes
        const innerRadius = 45;
        const innerCount = 12;
        this.placeCubesInRing(innerRadius, innerCount, fortCenter, cubeSize, naturalElementsPositions);

        // Outer ring: 8 cubes
        const outerRadius = 75;
        const outerCount = 8;
        this.placeCubesInRing(outerRadius, outerCount, fortCenter, cubeSize, naturalElementsPositions);

        // Then add trees, ensuring they don't overlap with cubes
        const treesPerQuadrant = 15; // Increased from 10 to 15 (15 * 4 = 60 total trees)
        for (let quadrant = 0; quadrant < 4; quadrant++) {
            for (let i = 0; i < treesPerQuadrant; i++) {
                const padding = 15;
                let attempts = 0;
                const maxAttempts = 50;
                
                while (attempts < maxAttempts) {
                    const quadX = quadrant % 2 === 0 ? 0 : this.width/2;
                    const quadY = quadrant < 2 ? 0 : this.height/2;
                    
                    const x = quadX + padding + Math.random() * (this.width/2 - 2 * padding);
                    const y = quadY + padding + Math.random() * (this.height/2 - 2 * padding);
                    
                    if (this.isValidTreePosition(x, y, fortCenter, naturalElementsPositions)) {
                        naturalElementsPositions.push({
                            x, y,
                            radius: 2 + Math.random(),
                            type: 'tree'
                        });
                        break;
                    }
                    attempts++;
                }
            }
        }

        this.naturalElements = naturalElementsPositions;
    }

    // Helper method for tree position validation
    isValidTreePosition(x, y, fortCenter, elements) {
        // Check if too close to fort
        const distanceToFort = Math.sqrt(
            Math.pow(x - fortCenter.x, 2) + 
            Math.pow(y - fortCenter.y, 2)
        );
        if (distanceToFort < 30) return false;

        // Check if within map bounds
        const padding = 15;
        if (x < padding || x > this.width - padding || 
            y < padding || y > this.height - padding) {
            return false;
        }

        // Check distance from other elements
        for (const element of elements) {
            const distance = Math.sqrt(
                Math.pow(x - element.x, 2) + 
                Math.pow(y - element.y, 2)
            );
            // Use larger minimum distance for cubes to ensure trees don't spawn too close
            const minDistance = element.type === 'cover' ? 8 : 15;
            if (distance < minDistance) return false;
        }

        return true;
    }

    // Helper method to place cubes in a ring
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
                depth: cubeSize, // Added depth to make it a perfect cube
                type: 'cover'
            };

            naturalElementsPositions.push(cube);
            this.coverSpots.push(cube);
        }
    }

    getAllObjects() {
        // Since coverSpots are now managed with naturalElements, we can simplify this
        return [
            ...this.walls,
            this.fort,
            ...this.naturalElements
        ].filter(obj => obj !== null);
    }

    // Helper method to check if a point is inside the map bounds
    isInBounds(x, y) {
        return x >= 0 && x <= this.width && y >= 0 && y <= this.height;
    }
}

// Export the GameMap class
export default GameMap; 