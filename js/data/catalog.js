/* ==========================================================================
   Seattle Asian Pages — Master Catalog Aggregator (<= 50 miles of ZIP 98074)
   ========================================================================== */

import { CHINESE_RESTAURANTS } from './chinese-dining.js';
import { JAPANESE_KOREAN_RESTAURANTS } from './japanese-korean-dining.js';
import { STORES_AND_BAKERIES } from './stores-bakeries.js';
import { BARBERS_AND_WELLNESS } from './barbers-wellness.js';
import { NANNY_AND_REMODEL } from './nanny-remodel.js';

export const PLACES = [
  ...CHINESE_RESTAURANTS,
  ...JAPANESE_KOREAN_RESTAURANTS,
  ...STORES_AND_BAKERIES,
  ...BARBERS_AND_WELLNESS,
  ...NANNY_AND_REMODEL
];
