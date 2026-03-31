import type { AppSettings } from '../settings';

export interface ModelOption {
  value: string;
  displayName: string;
  description: string;
}

interface VariantRule {
  /** Base model value that triggers expansion */
  base: string;
  /** Setting key that controls this variant */
  setting: keyof AppSettings['models'];
  /** Variants to insert after the base model */
  variants: ModelOption[];
}

interface InjectRule {
  /** Only inject if this model exists in the SDK list */
  requires: string;
  /** Setting key that controls this injection */
  setting: keyof AppSettings['models'];
  /** Model to inject */
  inject: ModelOption;
}

const VARIANT_RULES: VariantRule[] = [
  {
    base: 'sonnet',
    setting: 'showExtendedContext',
    variants: [
      { value: 'sonnet[1m]', displayName: 'Sonnet [1M]', description: 'Sonnet with 1M token context window for long sessions' },
    ],
  },
  {
    base: 'opus',
    setting: 'showExtendedContext',
    variants: [
      { value: 'opus[1m]', displayName: 'Opus [1M]', description: 'Opus with 1M token context window for long sessions' },
    ],
  },
];

const INJECT_RULES: InjectRule[] = [
  {
    requires: 'default',
    setting: 'showOpus',
    inject: { value: 'opus', displayName: 'Opus', description: 'Uses the latest Opus model for complex reasoning tasks' },
  },
  {
    requires: 'default',
    setting: 'showOpusPlan',
    inject: { value: 'opusplan', displayName: 'Opus Plan', description: 'Uses Opus for planning, then Sonnet for execution' },
  },
];

/**
 * Expand the SDK's model list based on user settings.
 * Injects known aliases (opus, opus[1m], sonnet[1m], opusplan) that the SDK doesn't list.
 */
export function expandModels(sdkModels: ModelOption[], settings: AppSettings['models']): ModelOption[] {
  const values = new Set(sdkModels.map(m => m.value));
  const expanded: ModelOption[] = [...sdkModels];

  // Inject known models that are missing from the SDK list
  for (const rule of INJECT_RULES) {
    if (settings[rule.setting] && values.has(rule.requires) && !values.has(rule.inject.value)) {
      expanded.push(rule.inject);
      values.add(rule.inject.value);
    }
  }

  // Add context window variants (e.g., sonnet → sonnet[1m])
  for (const rule of VARIANT_RULES) {
    if (settings[rule.setting] && values.has(rule.base)) {
      for (const variant of rule.variants) {
        if (!values.has(variant.value)) {
          const baseIdx = expanded.findIndex(m => m.value === rule.base);
          expanded.splice(baseIdx + 1, 0, variant);
          values.add(variant.value);
        }
      }
    }
  }

  return expanded;
}
