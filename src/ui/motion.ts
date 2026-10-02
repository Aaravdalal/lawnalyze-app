import { Easing } from 'react-native';

/**
 * How one screen slides over to the next: between the tabs (swiped or tapped on the bar) and
 * between the setup screens, so moving around the app always feels the same.
 */
export const PAGE_SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };
