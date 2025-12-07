# Interaction System Design

## Overview

The interaction system has been refactored to follow the **Open-Closed Principle (OCP)**: it's open for extension but closed for modification. This allows you to add new interactions without modifying existing code.

## Architecture

### Core Components

1. **InteractionRule Interface** (`src/core/interactions/InteractionRule.ts`)
   - Base interface that all interaction rules implement
   - Defines `priority`, `canApply()`, and `apply()` methods
   - Provides `InteractionContext` for system operations (deletion, connection removal)

2. **InteractionRegistry** (`src/core/interactions/InteractionRegistry.ts`)
   - Manages all interaction rules
   - Sorts rules by priority (highest first)
   - Applies the first matching rule

3. **Concrete Rules** (`src/core/interactions/rules/`)
   - Each interaction is a separate class implementing `InteractionRule`
   - Examples: `YellowRectangleRule`, `BlackSquareRule`, `GreenSquareRule`, etc.

4. **InteractionSystem** (`src/core/InteractionSystem.ts`)
   - Uses the registry to apply interactions
   - Provides `registerRule()` method for adding custom rules

## Adding New Interactions

### Example: Adding a New Interaction Rule

```typescript
import { InteractionRule, InteractionResult, InteractionContext } from '../InteractionRule';
import { GameObject } from '../../GameObject';

export class MyCustomRule implements InteractionRule {
  readonly priority = 75; // Between high (100) and low (50) priority

  canApply(held: GameObject, placed: GameObject): boolean {
    // Define when this rule applies
    return held.type === 'myType' && placed.type === 'targetType';
  }

  apply(held: GameObject, placed: GameObject, context: InteractionContext): InteractionResult {
    // Perform the interaction
    held.color = 0xff00ff;
    return 'interacted'; // or 'deleted' or 'no_interaction'
  }
}
```

### Registering the Rule

```typescript
// In GameScene or wherever you initialize the system
const myRule = new MyCustomRule();
interactionSystem.registerRule(myRule);
```

## Priority System

Rules are checked in priority order (highest first):
- **Priority 100**: Placed object interactions (Yellow Rectangle, Black Square)
- **Priority 50**: Held object interactions (Green Square, Red Circle, Blue Triangle)
- **Custom priorities**: You can use any number (0-1000+) for fine-grained control

Rules with the same priority are checked in registration order.

## Benefits

1. **OCP Compliant**: Add new interactions without modifying existing code
2. **Testable**: Each rule can be tested independently
3. **Flexible**: Easy to add, remove, or modify rules at runtime
4. **Maintainable**: Clear separation of concerns
5. **Extensible**: Can add complex interactions, conditional logic, etc.

## Future Enhancements

Potential improvements:
- Rule groups/categories
- Conditional rule activation
- Rule dependencies
- Rule composition (chaining rules)
- Rule metadata (descriptions, icons, etc.)

