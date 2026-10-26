/// <reference types="next/image-types/global" />
import type { StaticImageData } from 'next/image';
import data from './placeholder-images.json';
import interactiveCanvas from '@/assets/interactive.webp';

export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string | StaticImageData;
  imageHint: string;
};

export const PlaceHolderImages: ImagePlaceholder[] = data.placeholderImages.map((item) =>
  item.id === 'feature-canvas' ? { ...item, imageUrl: interactiveCanvas } : item
);
