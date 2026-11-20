import asset from '@/generated/shirt-asset.json';

/** Hashed GLB. The hash changes only when the compressed model changes. */
export const SHIRT_MODEL_URL = asset.publicPath;

export const SHIRT_MODEL_BYTES = asset.bytes;
