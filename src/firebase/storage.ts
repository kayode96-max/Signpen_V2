
'use client';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from './index';

const { firebaseApp } = initializeFirebase();
const storage = getStorage(firebaseApp);

function sanitizeFileName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildUploadFileName(file: File) {
  const sanitizedName = sanitizeFileName(file.name || 'image');
  const dotIndex = sanitizedName.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < sanitizedName.length - 1;
  const baseName = hasExtension ? sanitizedName.slice(0, dotIndex) : sanitizedName || 'image';
  const extension = hasExtension ? sanitizedName.slice(dotIndex + 1) : 'jpg';

  return `${baseName}-${Date.now()}.${extension}`;
}

/**
 * Uploads an image to Firebase Storage and returns the download URL.
 * Files are stored with a unique name so replacing an image does not get stuck behind browser caching.
 */
export async function uploadImageAndGetURL(
  userId: string,
  file: File,
  path: 'profile-photos' | 'background-images'
): Promise<string> {
  if (!userId) {
    throw new Error('User must be authenticated to upload files.');
  }

  const filePath = `${path}/${userId}/${buildUploadFileName(file)}`;
  const storageRef = ref(storage, filePath);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type || undefined,
    cacheControl: 'public,max-age=3600',
  });

  return getDownloadURL(snapshot.ref);
}
