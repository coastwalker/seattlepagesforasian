/* ==========================================================================
   Seattle Asian Pages — Master Catalog Aggregator (<= 50 miles of ZIP 98074)
   ========================================================================== */

import { CHINESE_RESTAURANTS } from './chinese-dining.js';
import { JAPANESE_KOREAN_RESTAURANTS } from './japanese-korean-dining.js';
import { THAI_VIETNAMESE_RESTAURANTS } from './thai-vietnamese-dining.js';
import { EASTSIDE_PLATEAU_REDMOND_DINING } from './eastside-plateau-redmond-dining.js';
import { BELLEVUE_CORRIDOR_DINING } from './bellevue-corridor-dining.js';
import { SEATTLE_SOUTH_CENTRAL_DINING } from './seattle-south-central-dining.js';
import { SEATTLE_NORTH_DINING } from './seattle-north-dining.js';
import { NORTH_SOUTH_SOUND_DINING } from './north-south-sound-dining.js';
import { STORES_AND_BAKERIES } from './stores-bakeries.js';
import { BARBERS_AND_WELLNESS } from './barbers-wellness.js';
import { NANNY_AND_REMODEL } from './nanny-remodel.js';
import { THAI_VIETNAMESE_SERVICES } from './thai-vietnamese-services.js';

export const PLACES = [
  ...CHINESE_RESTAURANTS,
  ...JAPANESE_KOREAN_RESTAURANTS,
  ...THAI_VIETNAMESE_RESTAURANTS,
  ...EASTSIDE_PLATEAU_REDMOND_DINING,
  ...BELLEVUE_CORRIDOR_DINING,
  ...SEATTLE_SOUTH_CENTRAL_DINING,
  ...SEATTLE_NORTH_DINING,
  ...NORTH_SOUTH_SOUND_DINING,
  ...STORES_AND_BAKERIES,
  ...BARBERS_AND_WELLNESS,
  ...NANNY_AND_REMODEL,
  ...THAI_VIETNAMESE_SERVICES
];
