import type { GalleryPhoto } from './types';

/** Taller than wide by enough that a square tile would lose the subject. */
export const isPortrait = (photo: Pick<GalleryPhoto, 'width' | 'height'>) =>
  photo.width > 0 && photo.height > photo.width * 1.15;

/**
 * The `thumb` size for viewing a photo whole: 1600px on its long side, scaled
 * to fit rather than cropped.
 */
export const fullSize = (photo: Pick<GalleryPhoto, 'width' | 'height'>) =>
  photo.height > photo.width ? '0x1600' : '1600x0';
