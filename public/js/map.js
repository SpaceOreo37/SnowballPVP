class GameMap {
    constructor() {
        this.width = 400;
        this.height = 400;
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
    }

    createBoundaryWalls() {
        const wallHeight = 60; // Doubled from 60
        const wallThickness = 10; // Doubled from 5

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
        const fortSize = 60; // Size of the fort platform
        const wallInset = 4; // How far the walls are inset from the edge
        const wallThickness = 2; // Thickness of the walls
        
        this.fort = {
            x: this.width / 2 - fortSize / 2,
            y: this.height / 2 - fortSize / 2,
            width: fortSize,
            height: fortSize,
            type: 'fort',
            baseHeight: 10, // Lower base height
            wallHeight: 4, // Half of PLAYER_HEIGHT (2)
            wallInset: wallInset,
            wallThickness: wallThickness,
            // Define the walls as segments
            walls: [
                // North wall
                {
                    x: wallInset,
                    y: wallInset,
                    width: fortSize - (wallInset * 2),
                    depth: wallThickness
                },
                // South wall
                {
                    x: wallInset,
                    y: fortSize - wallInset - wallThickness,
                    width: fortSize - (wallInset * 2),
                    depth: wallThickness
                },
                // West wall
                {
                    x: wallInset,
                    y: wallInset,
                    width: wallThickness,
                    depth: fortSize - (wallInset * 2)
                },
                // East wall
                {
                    x: fortSize - wallInset - wallThickness,
                    y: wallInset,
                    width: wallThickness,
                    depth: fortSize - (wallInset * 2)
                }
            ],
            entrances: [] // Keep entrances empty for now
        };
    }

    setNaturalElements(elements) {
        this.naturalElements = elements;
        // Update cover spots from the elements
        this.coverSpots = elements.filter(element => element.type === 'cover');
    }

    getAllObjects() {
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