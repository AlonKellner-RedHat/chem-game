import { GameObject } from './GameObject';
import { Grid } from './Grid';
import { Connection } from '../types';
import { InteractionRegistry } from './interactions/InteractionRegistry';
import { InteractionContext } from './interactions/InteractionRule';
import { YellowRectangleRule } from './interactions/rules/YellowRectangleRule';
import { BlackSquareRule } from './interactions/rules/BlackSquareRule';
import { GreenSquareRule } from './interactions/rules/GreenSquareRule';
import { RedCircleRule } from './interactions/rules/RedCircleRule';
import { BlueTriangleRule } from './interactions/rules/BlueTriangleRule';
import { ConnectionRegistry } from './connections/ConnectionRegistry';
import { TopBottomEdgeRule } from './connections/rules/TopBottomEdgeRule';

export class InteractionSystem {
  private grid: Grid;
  private heldObject: GameObject | null = null;
  private objects: Map<string, GameObject> = new Map();
  private connections: Connection[] = [];
  private originalObjects: Map<string, GameObject> = new Map(); // Store original objects for reset
  private interactionRegistry: InteractionRegistry;
  private interactionContext: InteractionContext;
  private connectionRegistry: ConnectionRegistry;

  constructor(grid: Grid) {
    this.grid = grid;
    this.interactionRegistry = new InteractionRegistry();
    
    // Create interaction context (will be updated per interaction)
    this.interactionContext = {
      deleteObject: (id: string) => {
        this.objects.delete(id);
      },
      removeConnectionsForObject: (id: string) => {
        this.connections = this.connections.filter(
          (conn) => conn.from !== id && conn.to !== id
        );
      },
      placeObject: (obj: GameObject, gridX: number, gridY: number) => {
        obj.place(gridX, gridY);
      },
      isPlacingOnSamePosition: false, // Will be set per interaction
    };
    
    // Register default interaction rules
    this.registerDefaultRules();
    
    // Initialize connection registry
    this.connectionRegistry = new ConnectionRegistry();
    this.registerDefaultConnectionRules();
  }

  /**
   * Register default interaction rules
   * Can be overridden or extended by subclasses or external code
   */
  private registerDefaultRules(): void {
    this.interactionRegistry.register(new YellowRectangleRule());
    this.interactionRegistry.register(new BlackSquareRule());
    this.interactionRegistry.register(new GreenSquareRule());
    this.interactionRegistry.register(new RedCircleRule());
    this.interactionRegistry.register(new BlueTriangleRule());
  }

  /**
   * Register a custom interaction rule
   * Allows extending the system without modifying core code (OCP)
   */
  public registerRule(rule: import('./interactions/InteractionRule').InteractionRule): void {
    this.interactionRegistry.register(rule);
  }

  /**
   * Register default connection rules
   * Can be overridden or extended by subclasses or external code
   */
  private registerDefaultConnectionRules(): void {
    this.connectionRegistry.register(new TopBottomEdgeRule());
  }

  /**
   * Register a custom connection rule
   * Allows extending the system without modifying core code (OCP)
   */
  public registerConnectionRule(rule: import('./connections/ConnectionRule').ConnectionRule): void {
    this.connectionRegistry.register(rule);
  }

  /**
   * Register an object with the system
   */
  public registerObject(obj: GameObject): void {
    this.objects.set(obj.id, obj);
    // Store a deep copy for reset purposes
    if (!this.originalObjects.has(obj.id)) {
      this.originalObjects.set(obj.id, this.cloneObject(obj));
    }
  }

  /**
   * Clone an object for reset purposes
   */
  private cloneObject(obj: GameObject): GameObject {
    const clone = new GameObject(
      obj.id,
      obj.type,
      obj.originalColor,
      obj.originalPosition.x,
      obj.originalPosition.y,
      obj.isPickable,
      { width: obj.gridSize.width, height: obj.gridSize.height },
      [...obj.watchedPositions] // Deep copy watched positions
    );
    return clone;
  }

  /**
   * Unregister an object
   */
  public unregisterObject(id: string): void {
    this.objects.delete(id);
    // Remove any connections involving this object
    this.connections = this.connections.filter(
      (conn) => conn.from !== id && conn.to !== id
    );
  }

  /**
   * Pick up an object
   * Disconnects the object from any connections when picked up
   */
  public pickupObject(worldX: number, worldY: number): boolean {
    if (this.heldObject !== null) {
      return false; // Already holding something
    }

    const obj = this.getObjectAt(worldX, worldY);
    if (obj && obj.isPickable) {
      this.heldObject = obj;
      // Disconnect this object from all connections when picked up
      this.connections = this.connections.filter(
        (conn) => conn.from !== obj.id && conn.to !== obj.id
      );
      return true;
    }
    return false;
  }

  /**
   * Place the held object at a grid position
   * Handles the new interaction model:
   * 1. Position-specific interactions (grid-space-to-object)
   * 2. General object-to-object interactions
   * 3. Empty position interactions (default: place)
   * 4. Watched positions interact with watcher AND place by default
   */
  public placeObject(worldX: number, worldY: number): boolean {
    if (this.heldObject === null) {
      return false;
    }

    const gridPos = this.grid.worldToGrid(worldX, worldY);
    
    // Check if position is occupied by an object
    const occupyingObj = this.getObjectAtGrid(gridPos.x, gridPos.y);
    
    // Check if position is watched by any objects (but not occupied by them)
    const watchingObjs = this.getObjectsWatchingPosition(gridPos.x, gridPos.y);
    
    let shouldPlace = true; // Default: place at empty position
    let interactionHandled = false;
    
    // Priority 1: If position is occupied, try object-to-object interaction
    if (occupyingObj && occupyingObj.id !== this.heldObject.id) {
      // Set context: we're placing on the same position
      this.interactionContext.isPlacingOnSamePosition = true;
      const interactionResult = this.interact(this.heldObject, occupyingObj);
      this.interactionContext.isPlacingOnSamePosition = false;
      
      if (interactionResult === 'deleted') {
        // Object was deleted
        this.heldObject = null;
        return true;
      } else if (interactionResult === 'interacted') {
        // Interaction happened, object stays in hand (no placement)
        return false;
      }
      // If no_interaction, continue to check other cases
      // By default, don't place on occupied positions
      shouldPlace = false;
      interactionHandled = true;
    }
    
    // Priority 2: If position is watched (but not occupied), interact with watchers
    if (!interactionHandled && watchingObjs.length > 0) {
      // Set context: we're NOT placing on the same position (just adjacent/watched)
      this.interactionContext.isPlacingOnSamePosition = false;
      // Interact with all watching objects
      for (const watcher of watchingObjs) {
        const interactionResult = this.interact(this.heldObject, watcher);
        
        if (interactionResult === 'deleted') {
          // Object was deleted
          this.heldObject = null;
          return true;
        } else if (interactionResult === 'interacted') {
          // Interaction happened, but we still place by default for watched positions
          // Continue to place the object
        }
      }
      // Watched positions: interact AND place by default
      shouldPlace = true;
    }
    
    // Priority 3: Empty position - place by default (unless overridden)
    if (shouldPlace && !occupyingObj) {
      this.heldObject.place(gridPos.x, gridPos.y);
      
      // Check for connections after placement
      // First check connections for the newly placed object specifically
      this.checkConnectionsForObject(this.heldObject);
      // Then check all connections to ensure bidirectional connections are detected
      this.checkConnections();
      
      this.heldObject = null;
      return true;
    }
    
    // No placement occurred
    return false;
  }

  /**
   * Get the currently held object
   */
  public getHeldObject(): GameObject | null {
    return this.heldObject;
  }

  /**
   * Get object at world coordinates
   */
  private getObjectAt(worldX: number, worldY: number): GameObject | null {
    const gridPos = this.grid.worldToGrid(worldX, worldY);
    return this.getObjectAtGrid(gridPos.x, gridPos.y);
  }

  /**
   * Get object that occupies a grid position
   * Excludes the currently held object from the search
   */
  private getObjectAtGrid(gridX: number, gridY: number): GameObject | null {
    for (const obj of this.objects.values()) {
      // Skip held object - it's not "placed" yet
      if (this.heldObject && obj.id === this.heldObject.id) {
        continue;
      }
      
      // Check if the position is occupied by this object
      if (obj.occupiesPosition(gridX, gridY)) {
        return obj;
      }
    }
    return null;
  }

  /**
   * Get all objects that watch a grid position (but don't occupy it)
   */
  private getObjectsWatchingPosition(gridX: number, gridY: number): GameObject[] {
    const watchers: GameObject[] = [];
    for (const obj of this.objects.values()) {
      // Skip held object
      if (this.heldObject && obj.id === this.heldObject.id) {
        continue;
      }
      
      // Check if this object watches this position (and doesn't occupy it)
      if (!obj.occupiesPosition(gridX, gridY) && obj.isWatchingPosition(gridX, gridY)) {
        watchers.push(obj);
      }
    }
    return watchers;
  }

  /**
   * Interact between held object and placed object
   * Uses the rule-based interaction system
   * Returns 'deleted' if the held object was deleted
   * Returns 'interacted' if an interaction occurred (object stays in hand by default)
   * Returns 'no_interaction' if no interaction should occur
   */
  private interact(held: GameObject, placed: GameObject): 'deleted' | 'interacted' | 'no_interaction' {
    return this.interactionRegistry.applyInteraction(held, placed, this.interactionContext);
  }


  /**
   * Check for connections for a specific object
   * Useful when an object is just placed to immediately detect connections
   */
  private checkConnectionsForObject(obj: GameObject): void {
    // Check all watched positions of this object
    const watchedCells = obj.getWatchedCells();
    
    for (const watchedCell of watchedCells) {
      const watchedObj = this.getObjectAtGrid(watchedCell.x, watchedCell.y);
      if (!watchedObj || obj.id === watchedObj.id) continue;

      // Check if obj watches watchedObj's position
      const objWatchingWatchedObj = true; // We know this because watchedObj is at a watched position
      
      // Check if watchedObj watches obj's position (bidirectional)
      const objOccupied = obj.getOccupiedCells();
      const watchedObjWatchingObj = objOccupied.some(cell => 
        watchedObj.isWatchingPosition(cell.x, cell.y)
      );

      // Check if they should connect using the rule system
      if (this.connectionRegistry.shouldConnect(obj, watchedObj, objWatchingWatchedObj, watchedObjWatchingObj)) {
        this.addConnection(obj.id, watchedObj.id);
      }
    }
    
    // Also check if other objects watch this object's position
    for (const otherObj of this.objects.values()) {
      if (otherObj.id === obj.id) continue;
      
      const objOccupied = obj.getOccupiedCells();
      const otherWatchingObj = objOccupied.some(cell => 
        otherObj.isWatchingPosition(cell.x, cell.y)
      );
      
      if (otherWatchingObj) {
        // Check if obj watches otherObj's position
        const otherOccupied = otherObj.getOccupiedCells();
        const objWatchingOther = otherOccupied.some(cell => 
          obj.isWatchingPosition(cell.x, cell.y)
        );
        
        if (this.connectionRegistry.shouldConnect(obj, otherObj, objWatchingOther, true)) {
          this.addConnection(obj.id, otherObj.id);
        }
      }
    }
  }

  /**
   * Check for connections with all objects
   * Connections are bidirectional and checked for all objects after any placement
   */
  private checkConnections(): void {
    // Check all objects for connections
    const allObjects = Array.from(this.objects.values());
    
    for (let i = 0; i < allObjects.length; i++) {
      const obj1 = allObjects[i];
      
      // Check all watched positions of this object
      const watchedCells = obj1.getWatchedCells();
      
      for (const watchedCell of watchedCells) {
        const obj2 = this.getObjectAtGrid(watchedCell.x, watchedCell.y);
        if (!obj2 || obj1.id === obj2.id) continue;

        // Check if obj2 watches obj1's position (bidirectional)
        const obj1Occupied = obj1.getOccupiedCells();
        const obj2WatchingObj1 = obj1Occupied.some(cell => 
          obj2.isWatchingPosition(cell.x, cell.y)
        );

        // Check if they should connect using the rule system
        if (this.connectionRegistry.shouldConnect(obj1, obj2, true, obj2WatchingObj1)) {
          this.addConnection(obj1.id, obj2.id);
        }
      }
      
      // Also check if other objects watch this object's position (bidirectional)
      for (let j = i + 1; j < allObjects.length; j++) {
        const obj2 = allObjects[j];
        
        // Check if obj2 watches any of obj1's occupied positions
        const obj1Occupied = obj1.getOccupiedCells();
        const obj2WatchingObj1 = obj1Occupied.some(cell => 
          obj2.isWatchingPosition(cell.x, cell.y)
        );
        
        if (obj2WatchingObj1) {
          // Check if obj1 watches obj2's position
          const obj2Occupied = obj2.getOccupiedCells();
          const obj1WatchingObj2 = obj2Occupied.some(cell => 
            obj1.isWatchingPosition(cell.x, cell.y)
          );
          
          if (this.connectionRegistry.shouldConnect(obj1, obj2, obj1WatchingObj2, true)) {
            this.addConnection(obj1.id, obj2.id);
          }
        }
      }
    }
  }


  /**
   * Add a connection between two objects
   */
  public addConnection(fromId: string, toId: string): void {
    // Check if connection already exists
    const exists = this.connections.some(
      (conn) =>
        (conn.from === fromId && conn.to === toId) ||
        (conn.from === toId && conn.to === fromId)
    );
    if (!exists) {
      this.connections.push({ from: fromId, to: toId });
    }
  }

  /**
   * Remove a connection
   */
  public removeConnection(fromId: string, toId: string): void {
    this.connections = this.connections.filter(
      (conn) =>
        !(conn.from === fromId && conn.to === toId) &&
        !(conn.from === toId && conn.to === fromId)
    );
  }

  /**
   * Get all connections
   */
  public getConnections(): Connection[] {
    return [...this.connections];
  }

  /**
   * Get all objects
   */
  public getAllObjects(): GameObject[] {
    return Array.from(this.objects.values());
  }

  /**
   * Get object by ID
   */
  public getObject(id: string): GameObject | null {
    return this.objects.get(id) || null;
  }

  /**
   * Reset all objects to original state (positions, colors, restore deleted objects)
   */
  public reset(): void {
    this.heldObject = null;
    this.connections = [];
    
    // Clear current objects
    this.objects.clear();
    
    // Restore all original objects
    for (const [id, originalObj] of this.originalObjects.entries()) {
      const restored = this.cloneObject(originalObj);
      this.objects.set(id, restored);
    }
  }

}

