/**
 * Radio Button Group Component
 *
 * A group of radio buttons for selecting one option from multiple choices.
 */

export interface RadioButtonOption<T extends string> {
  /** Value identifier */
  value: T;
  /** Display label */
  label: string;
}

export interface RadioButtonGroupOptions<T extends string> {
  /** Group name (for HTML radio button grouping) */
  name: string;
  /** Available options */
  options: RadioButtonOption<T>[];
  /** Initially selected value */
  selectedValue: T;
  /** Optional label for the group */
  label?: string;
  /** Callback when selection changes */
  onChange?: (value: T) => void;
}

/**
 * RadioButtonGroup class
 */
export class RadioButtonGroup<T extends string> {
  private container: HTMLElement;
  private inputs: Map<T, HTMLInputElement> = new Map();
  private selectedValue: T;
  private options: RadioButtonGroupOptions<T>;

  constructor(parent: HTMLElement, options: RadioButtonGroupOptions<T>) {
    this.options = options;
    this.selectedValue = options.selectedValue;

    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 6px;
      margin: 5px;
    `;

    // Add label if provided
    if (options.label) {
      const labelEl = document.createElement('div');
      labelEl.textContent = options.label;
      labelEl.style.cssText = `
        color: #aaa;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 4px;
      `;
      this.container.appendChild(labelEl);
    }

    // Create radio buttons
    for (const option of options.options) {
      const optionContainer = document.createElement('label');
      optionContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background 0.15s;
      `;

      // Hover effect
      optionContainer.addEventListener('mouseenter', () => {
        optionContainer.style.background = 'rgba(255, 255, 255, 0.1)';
      });
      optionContainer.addEventListener('mouseleave', () => {
        optionContainer.style.background = 'transparent';
      });

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = options.name;
      input.value = option.value;
      input.checked = option.value === options.selectedValue;
      input.style.cssText = `
        accent-color: #4a90e2;
        cursor: pointer;
        margin: 0;
      `;

      input.addEventListener('change', () => {
        if (input.checked) {
          this.selectedValue = option.value;
          options.onChange?.(option.value);
        }
      });

      this.inputs.set(option.value, input);

      const labelText = document.createElement('span');
      labelText.textContent = option.label;
      labelText.style.cssText = `
        color: #fff;
        font-size: 12px;
      `;

      optionContainer.appendChild(input);
      optionContainer.appendChild(labelText);
      this.container.appendChild(optionContainer);
    }

    parent.appendChild(this.container);
  }

  /**
   * Get the currently selected value
   */
  getValue(): T {
    return this.selectedValue;
  }

  /**
   * Set the selected value programmatically
   * @param value - The value to select
   * @param triggerCallback - Whether to trigger the onChange callback
   */
  setValue(value: T, triggerCallback = true): void {
    const input = this.inputs.get(value);
    if (input) {
      input.checked = true;
      this.selectedValue = value;
      if (triggerCallback) {
        this.options.onChange?.(value);
      }
    }
  }

  /**
   * Destroy the component
   */
  destroy(): void {
    this.container.remove();
    this.inputs.clear();
  }
}
