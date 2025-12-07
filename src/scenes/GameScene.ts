import Phaser from 'phaser';
import { Grid } from '../core/Grid';
import { GameObject } from '../core/GameObject';
import { InteractionSystem } from '../core/InteractionSystem';
import { ConnectionSystem } from '../core/ConnectionSystem';
import { ObjectRenderer } from '../core/ObjectRenderer';
import { Demo } from '../core/demos/Demo';
import { AdvancedSpectralDemo } from '../core/demos/AdvancedSpectralDemo';
// import { SpectralDemo } from '../core/demos/SpectralDemo'; // Available for testing via menu
// import { GPUDemo } from '../core/demos/GPUDemo'; // Available for testing via menu

export class GameScene extends Phaser.Scene {
  private grid!: Grid;
  private interactionSystem!: InteractionSystem;
  private connectionSystem!: ConnectionSystem;
  private objectRenderer!: ObjectRenderer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private objectGraphics!: Phaser.GameObjects.Graphics;
  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private resetButton!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Text;
  private currentDemo: Demo | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Initialize grid
    this.grid = new Grid(50);

    // Initialize systems
    this.interactionSystem = new InteractionSystem(this.grid);
    this.connectionSystem = new ConnectionSystem(this.grid);
    this.objectRenderer = new ObjectRenderer(this.grid);

    // Create graphics objects
    this.gridGraphics = this.add.graphics();
    this.objectGraphics = this.add.graphics();
    this.connectionGraphics = this.add.graphics();

    // Set camera bounds
    this.cameras.main.setBounds(-1000, -1000, 2000, 2000);

    // Set up input handlers
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });

    // Create UI buttons
    this.createResetButton();
    this.createMenuButton();

    // Load default demo
    this.loadDemo(new AdvancedSpectralDemo());

    // Set up keyboard shortcut for menu (M key)
    this.input.keyboard?.on('keydown-M', () => {
      this.scene.launch('MenuScene');
    });
  }

  /**
   * Load a demo - cleans up current demo and initializes new one
   */
  public loadDemo(demo: Demo): void {
    // Clean up current demo
    if (this.currentDemo) {
      this.currentDemo.cleanup(this);
    }

    // Set new demo
    this.currentDemo = demo;

    // Initialize new demo
    demo.initialize(this);
  }

  /**
   * Get the current demo
   */
  public getCurrentDemo(): Demo | null {
    return this.currentDemo;
  }

  /**
   * Get interaction system (for demos to use)
   */
  public getInteractionSystem(): InteractionSystem {
    return this.interactionSystem;
  }

  /**
   * Get connection system (for demos to use)
   */
  public getConnectionSystem(): ConnectionSystem {
    return this.connectionSystem;
  }

  /**
   * Get object renderer (for demos to use)
   */
  public getObjectRenderer(): ObjectRenderer {
    return this.objectRenderer;
  }

  /**
   * Get grid (for demos to use)
   */
  public getGrid(): Grid {
    return this.grid;
  }

  private createResetButton(): void {
    const buttonX = this.cameras.main.width - 100;
    const buttonY = 30;

    this.resetButton = this.add
      .text(buttonX, buttonY, 'Reset', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#666666',
        padding: { x: 10, y: 5 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0) // Fixed to camera
      .on('pointerdown', () => {
        this.reset();
      })
      .on('pointerover', () => {
        this.resetButton.setBackgroundColor('#888888');
      })
      .on('pointerout', () => {
        this.resetButton.setBackgroundColor('#666666');
      });
  }

  private createMenuButton(): void {
    const buttonX = 20;
    const buttonY = 30;

    this.menuButton = this.add
      .text(buttonX, buttonY, 'Menu', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#666666',
        padding: { x: 10, y: 5 },
      })
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0) // Fixed to camera
      .on('pointerdown', () => {
        this.scene.launch('MenuScene');
      })
      .on('pointerover', () => {
        this.menuButton.setBackgroundColor('#888888');
      })
      .on('pointerout', () => {
        this.menuButton.setBackgroundColor('#666666');
      });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    // Check if clicking reset button
    if (this.resetButton.getBounds().contains(pointer.x, pointer.y)) {
      return; // Let button handle it
    }

    // Check if clicking menu button
    if (this.menuButton.getBounds().contains(pointer.x, pointer.y)) {
      return; // Let button handle it
    }

    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    const heldObject = this.interactionSystem.getHeldObject();
    if (heldObject) {
      // Try to place the held object
      // If placement failed (no interaction), object remains in hand
      this.interactionSystem.placeObject(worldX, worldY);
    } else {
      // Try to pick up an object
      this.interactionSystem.pickupObject(worldX, worldY);
    }
  }

  private reset(): void {
    // Call the current demo's reset method if it exists
    if (this.currentDemo && typeof this.currentDemo.reset === 'function') {
      this.currentDemo.reset(this);
    }
  }

  update(): void {
    // Clear graphics
    this.objectGraphics.clear();
    this.connectionGraphics.clear();

    // Grid overlay disabled - GPU shader renders its own grid
    // The simulated grid in the canvas handles the visual grid
    this.gridGraphics.clear();

    // Only render objects and connections if interaction system is initialized
    // (Empty demo doesn't have interaction system)
    if (this.interactionSystem) {
      // Render all objects (excluding held object)
      const allObjects = this.interactionSystem.getAllObjects();
      const heldObject = this.interactionSystem.getHeldObject();
      for (const obj of allObjects) {
        // Skip rendering if this object is being held
        if (heldObject && obj.id === heldObject.id) {
          continue;
        }
        this.objectRenderer.renderObject(this.objectGraphics, obj);
      }

      // Render held object at mouse position
      if (heldObject) {
        const pointer = this.input.activePointer;
        this.objectRenderer.renderHeldObject(
          this.objectGraphics,
          heldObject,
          pointer.worldX,
          pointer.worldY
        );
      }

      // Render connections
      const connections = this.interactionSystem.getConnections();
      if (connections.length > 0) {
        // Create a map of objects for connection rendering
        const objectsMap = new Map<string, GameObject>();
        for (const obj of allObjects) {
          objectsMap.set(obj.id, obj);
        }
        this.connectionSystem.renderConnections(
          this.connectionGraphics,
          connections,
          objectsMap
        );
      }
    }

    // Allow current demo to update itself
    this.currentDemo?.update?.(this);
  }
}

