# Connection System Design

## Overview

The connection system has been refactored to follow the **Open-Closed Principle (OCP)**: it's open for extension but closed for modification. This allows you to add new connection rules for specific shapes without modifying existing code.

## Architecture

### Core Components

1. **ConnectionRule Interface** (`src/core/connections/ConnectionRule.ts`)
   - Base interface that all connection rules implement
   - Defines `priority` and `canApply()` methods
   - Provides information about which object is watching which

2. **ConnectionRegistry** (`src/core/connections/ConnectionRegistry.ts`)
   - Manages all connection rules
   - Sorts rules by priority (highest first)
   - Applies the first matching rule

3. **Concrete Rules** (`src/core/connections/rules/`)
   - Each connection pattern is a separate class implementing `ConnectionRule`
   - Examples: `TopBottomEdgeRule`, `UpsideDownTriangleRule` (template)

4. **InteractionSystem** (`src/core/InteractionSystem.ts`)
   - Uses the registry to check connections
   - Provides `registerConnectionRule()` method for adding custom rules

## Adding New Connection Rules

### Example: Upside-Down Triangle Rule

```typescript
import { ConnectionRule } from '../ConnectionRule';
import { GameObject } from '../../GameObject';

export class UpsideDownTriangleRule implements ConnectionRule {
  readonly priority = 100; // High priority - specific rule overrides general rules

  canApply(
    obj1: GameObject,
    obj2: GameObject,
    obj1WatchingObj2: boolean,
    obj2WatchingObj1: boolean
  ): boolean {
    // Check if obj1 is an upside-down triangle
    if (obj1.type !== 'upsideDownTriangle') return false;

    // Upside-down triangle connects to bottom of rectangle
    // obj1 (triangle) is below obj2 (rectangle)
    if (obj1.gridY > obj2.gridY && obj1.gridX === obj2.gridX) {
      // obj2 must be a rectangle and must be watching obj1
      if (obj2.type === 'rectangle' && obj2WatchingObj1) {
        return true;
      }
    }

    // Reverse: rectangle above upside-down triangle
    if (obj2.gridY > obj1.gridY && obj2.gridX === obj1.gridX) {
      if (obj2.type === 'upsideDownTriangle' && obj1.type === 'rectangle' && obj1WatchingObj2) {
        return true;
      }
    }

    return false;
  }
}
```

### Registering the Rule

```typescript
// In GameScene or wherever you initialize the system
const upsideDownTriangleRule = new UpsideDownTriangleRule();
interactionSystem.registerConnectionRule(upsideDownTriangleRule);
```

## Priority System

Rules are checked in priority order (highest first):
- **Priority 100+**: Specific rules (e.g., upside-down triangle to rectangle)
- **Priority 50**: General rules (e.g., top-bottom edge connections)
- **Priority 0-49**: Fallback rules

Rules with the same priority are checked in registration order.

## Connection Detection

The system checks connections in two ways:
1. **Direct watching**: obj1 watches obj2's position
2. **Bidirectional watching**: obj2 watches obj1's position

Both scenarios are handled automatically by the registry.

## Benefits

1. **OCP Compliant**: Add new connection rules without modifying existing code
2. **Testable**: Each rule can be tested independently
3. **Flexible**: Easy to add, remove, or modify rules at runtime
4. **Maintainable**: Clear separation of concerns
5. **Extensible**: Can add complex connection logic, conditional rules, etc.

## Current Rules

### TopBottomEdgeRule (Priority 50)
- General rule: Any top edge connects to any bottom edge
- Squares: have both top and bottom edges
- Triangles: have only bottom edge
- Rectangles: have only top edge

### Future Rules
- Upside-down triangle to rectangle bottom (template provided)
- Custom edge-to-edge rules
- Conditional connection rules based on object state

## Example: Adding a New Shape with Specific Connection Rules

1. Add the new shape type to `ShapeType` in `src/types/index.ts`
2. Create the shape factory in `src/core/Shapes.ts` with appropriate watched positions
3. Create a connection rule class implementing `ConnectionRule`
4. Register the rule: `interactionSystem.registerConnectionRule(new MyRule())`

The system will automatically use your new rule when checking connections!
