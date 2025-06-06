import type { TeactNode } from '../lib/teact/teact';

import type { LangCode, LangPack, LangString } from '../global/types';

import { IS_PACKAGED_ELECTRON, LANG_CACHE_NAME, LANG_LIST } from '../config';
import renderText from '../global/helpers/renderText';
// @ts-ignore this file is autogenerated
import defaultLangPackJson from '../i18n/en.json';
import * as cacheApi from './cacheApi';
import { createCallbackManager } from './callbacks';
import { formatNumber } from './formatNumber';
import { DEFAULT_LANG_CODE } from './windowEnvironment';

const defaultLangPack: LangPack = defaultLangPackJson;

export interface LangFn {
  (key: string): string;

  (key: string, value: any, format?: 'i', pluralValue?: number): string | TeactNode[];

  isRtl?: boolean;
  code?: LangCode;
  langName?: string;
}

const {
  addCallback,
  removeCallback,
  runCallbacks,
} = createCallbackManager();

export { addCallback, removeCallback };

const SUBSTITUTION_REGEX = /%\d?\$?[sdf@]/g;
const PLURAL_OPTIONS = ['value', 'zeroValue', 'oneValue', 'twoValue', 'fewValue', 'manyValue', 'otherValue'] as const;
// Some rules edited from https://github.com/eemeli/make-plural/blob/master/packages/plurals/cardinals.js
// de - zeroValue, oneValue, otherValue
// en - zeroValue, oneValue, otherValue
// es - zeroValue, oneValue, otherValue
// pl - zeroValue, oneValue, fewValue, manyValue
// ru - zeroValue, oneValue, fewValue, manyValue
// th - zeroValue, otherValue
// tr - zeroValue, oneValue, otherValue
// uk - zeroValue, oneValue, fewValue, manyValue
// zh-Hans - zeroValue, otherValue
// zh-Hant - zeroValue, otherValue
const PLURAL_RULES = {
  /* eslint-disable max-len */
  de: (n: number) => (n === 0 ? 1 : (n !== 1 ? 6 : 2)),
  en: (n: number) => (n === 0 ? 1 : (n !== 1 ? 6 : 2)),
  es: (n: number) => (n === 0 ? 1 : (n !== 1 ? 6 : 2)),
  pl: (n: number) => (n === 0 ? 1 : (n === 1 ? 2 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 4 : 5)),
  ru: (n: number) => (n === 0 ? 1 : (n % 10 === 1 && n % 100 !== 11 ? 2 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 4 : 5)),
  th: (n: number) => (n === 0 ? 1 : 6),
  tr: (n: number) => (n === 0 ? 1 : (n > 1 ? 6 : 2)),
  uk: (n: number) => (n === 0 ? 1 : (n % 10 === 1 && n % 100 !== 11 ? 2 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 4 : 5)),
  'zh-Hans': (n: number) => (n === 0 ? 1 : 6),
  'zh-Hant': (n: number) => (n === 0 ? 1 : 6),
  /* eslint-enable max-len */
};
const cache = new Map<string, string>();
let langPack: LangPack | undefined;
let currentLangCode: string | undefined;

function createLangFn() {
  return ((key: string, value?: any, format?: 'i', pluralValue?: number) => {
    if (value !== undefined && (typeof value !== 'object' || Array.isArray(value))) {
      const cacheValue = Array.isArray(value) ? JSON.stringify(value) : value;
      const cached = cache.get(`${key}_${cacheValue}_${format}${pluralValue ? `_${pluralValue}` : ''}`);
      if (cached) {
        return cached;
      }
    }

    if (!langPack && !defaultLangPack) {
      return key;
    }

    const langString = (langPack?.[key]) || (defaultLangPack?.[key]) || key;

    return processTranslation(langString, key, value, format, pluralValue);
  }) as LangFn;
}

// eslint-disable-next-line import/no-mutable-exports
export let getTranslation: LangFn = createLangFn();

export async function setLanguage(langCode: LangCode, callback?: NoneToVoidFunction) {
  if (langPack && langCode === currentLangCode) {
    if (callback) {
      callback();
    }

    return;
  }

  let newLangPack = await cacheApi.fetch(LANG_CACHE_NAME, langCode);

  if (!newLangPack) {
    newLangPack = await fetchRemote(langCode);
    if (!newLangPack) {
      return;
    }
  }

  cache.clear();

  currentLangCode = langCode;
  langPack = newLangPack;
  document.documentElement.lang = langCode;

  const langInfo = LANG_LIST?.find((l) => l.langCode === langCode);
  getTranslation = createLangFn();
  getTranslation.isRtl = Boolean(langInfo?.rtl);
  getTranslation.code = langCode.replace('-raw', '') as LangCode;
  getTranslation.langName = langInfo?.nativeName;

  if (callback) {
    callback();
  }

  runCallbacks();
}

export function clearPreviousLangpacks() {
  const langCachePrefix = LANG_CACHE_NAME.replace(/\d+$/, '');
  const langCacheVersion = Number((LANG_CACHE_NAME.match(/\d+$/) || [0])[0]);
  for (let i = 0; i < langCacheVersion; i++) {
    void cacheApi.clear(`${langCachePrefix}${i === 0 ? '' : i}`);
  }
}

async function fetchRemote(langCode: string): Promise<LangPack | undefined> {
  if (langCode === DEFAULT_LANG_CODE) {
    return defaultLangPack;
  }

  const response = await fetch(`${IS_PACKAGED_ELECTRON ? '.' : '..'}/i18n/${langCode}.json`);

  if (!response.ok) {
    const message = `An error has occured: ${response.status}`;
    throw new Error(message);
  }

  const remote = await response.json();

  if (remote) {
    await cacheApi.save(LANG_CACHE_NAME, langCode, remote);
    return remote;
  }

  return undefined;
}

function getPluralOption(amount: number) {
  const langCode = currentLangCode || DEFAULT_LANG_CODE;
  const optionIndex = PLURAL_RULES[langCode as keyof typeof PLURAL_RULES]
    ? PLURAL_RULES[langCode as keyof typeof PLURAL_RULES](amount)
    : 0;

  return PLURAL_OPTIONS[optionIndex];
}

function processTemplate(template: string, value: any) {
  value = Array.isArray(value) ? value : [value];
  const translationSlices = template.split(SUBSTITUTION_REGEX);
  const initialValue = translationSlices.shift();

  return translationSlices.reduce((result, str, index) => {
    return `${result}${String(value[index] ?? '')}${str}`;
  }, initialValue || '');
}

function processTemplateJsx(template: string, value: Record<string, TeactNode>): TeactNode[] {
  const parts = template.split('%');
  const processedParts: TeactNode[] = [];
  let currentString = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Check if the current part is a token (between % symbols)
    if (i % 2 === 1) {
      const valueNode = value[part];

      if (valueNode) {
        if (typeof valueNode === 'string') {
          currentString += valueNode;
        } else {
          // If the value is a component, process the accumulated string and add the component
          if (currentString) {
            processedParts.push(...renderText(currentString));
            currentString = '';
          }
          processedParts.push(valueNode);
        }
      } else {
        // If the token is not found, keep it as is (e.g., %unknown_token%)
        currentString += `%${part}%`;
      }
    } else {
      // If the part is a text segment, append it to the current string
      currentString += part;
    }
  }

  // Process any remaining text in the current string
  if (currentString) {
    processedParts.push(...renderText(currentString));
  }

  return processedParts;
}

function processTranslation(
  langString: LangString | string | undefined, key: string, value?: any, format?: 'i', pluralValue?: number,
) {
  const preferredPluralOption = typeof value === 'number' || pluralValue !== undefined
    ? getPluralOption(pluralValue ?? value)
    : 'value';

  const template = typeof langString === 'string'
    ? langString
    : preferredPluralOption === 'value'
      // Support cached older `langString` interface
      ? (typeof langString === 'object' ? (langString as any).value : langString)
      : typeof langString === 'object'
        ? langString?.[preferredPluralOption] || langString.otherValue
        : undefined;

  if (!template || !template.trim() || value === undefined) {
    return template;
  }

  const formattedValue = format === 'i' ? formatNumber(value) : value;
  const result = typeof value === 'object' && !Array.isArray(value)
    ? processTemplateJsx(template, formattedValue)
    : processTemplate(template, formattedValue);
  if (typeof value !== 'object' && typeof result === 'string') {
    const cacheValue = Array.isArray(value) ? JSON.stringify(value) : value;
    cache.set(`${key}_${cacheValue}_${format}${pluralValue ? `_${pluralValue}` : ''}`, result);
  }

  return result;
}
