import Phaser from 'phaser';
import { Demo } from '../core/demos/Demo';
import { InteractivityDemo } from '../core/demos/InteractivityDemo';
import { EmptyDemo } from '../core/demos/EmptyDemo';
import { SpectralDemo } from '../core/demos/SpectralDemo';
import { AdvancedSpectralDemo } from '../core/demos/AdvancedSpectralDemo';
import { GPUDemo } from '../core/demos/GPUDemo';
import { GameScene } from './GameScene';

/**
 * Menu Scene - Overlay for demo selection
 */
export class MenuScene extends Phaser.Scene {
  private demos: Demo[] = [];
  private gameScene!: GameScene;
  private menuContainer!: Phaser.GameObjects.Container;
  private background!: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Get reference to GameScene
    this.gameScene = this.scene.get('GameScene') as GameScene;

    // Initialize available demos
    this.demos = [
      new InteractivityDemo(),
      new EmptyDemo(),
      new SpectralDemo(),
      new AdvancedSpectralDemo(),
      new GPUDemo(),
    ];

    // Create semi-transparent background
    const { width, height } = this.cameras.main;
    this.background = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.7
    );
    this.background.setInteractive();

    // Create menu container
    this.menuContainer = this.add.container(width / 2, height / 2);

    // Create menu title
    const title = this.add.text(0, -200, 'Select Demo', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5, 0.5);
    this.menuContainer.add(title);

    // Create demo list
    const currentDemo = this.gameScene.getCurrentDemo();
    let yOffset = -100;

    for (let i = 0; i < this.demos.length; i++) {
      const demo = this.demos[i];
      const isCurrent = currentDemo?.name === demo.name;

      // Create demo button background
      const buttonBg = this.add.rectangle(
        0,
        yOffset,
        400,
        60,
        isCurrent ? 0x4a90e2 : 0x333333,
        1
      );
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.setStrokeStyle(2, isCurrent ? 0x6bb3ff : 0x555555);

      // Create demo name text
      const nameText = this.add.text(0, yOffset - 10, demo.name, {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      });
      nameText.setOrigin(0.5, 0.5);

      // Create demo description text (if available)
      let descText: Phaser.GameObjects.Text | null = null;
      if (demo.description) {
        descText = this.add.text(0, yOffset + 15, demo.description, {
          fontSize: '14px',
          color: '#cccccc',
        });
        descText.setOrigin(0.5, 0.5);
      }

      // Add hover effects
      buttonBg.on('pointerover', () => {
        if (!isCurrent) {
          buttonBg.setFillStyle(0x444444);
        }
      });

      buttonBg.on('pointerout', () => {
        if (!isCurrent) {
          buttonBg.setFillStyle(0x333333);
        }
      });

      // Add click handler
      buttonBg.on('pointerdown', () => {
        this.selectDemo(demo);
      });

      // Add to container
      this.menuContainer.add([buttonBg, nameText]);
      if (descText) {
        this.menuContainer.add(descText);
      }

      yOffset += 80;
    }

    // Create close button
    const closeButton = this.add.text(0, 200, 'Close (M)', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#666666',
      padding: { x: 15, y: 8 },
    });
    closeButton.setOrigin(0.5, 0.5);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on('pointerdown', () => {
      this.closeMenu();
    });
    closeButton.on('pointerover', () => {
      closeButton.setBackgroundColor('#888888');
    });
    closeButton.on('pointerout', () => {
      closeButton.setBackgroundColor('#666666');
    });
    this.menuContainer.add(closeButton);

    // Close menu when clicking background
    this.background.on('pointerdown', () => {
      this.closeMenu();
    });

    // Keyboard shortcut to close (M key)
    this.input.keyboard?.on('keydown-M', () => {
      this.closeMenu();
    });

    // Prevent input from reaching GameScene
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      event.stopPropagation();
    });
  }

  private selectDemo(demo: Demo): void {
    this.gameScene.loadDemo(demo);
    this.closeMenu();
  }

  private closeMenu(): void {
    this.scene.stop();
  }
}

