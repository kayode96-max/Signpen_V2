
'use client';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from './index';

const { firebaseApp } = initializeFirebase();
const storage = getStorage(firebaseApp);

/**
 * Uploads an image to Firebase Storage and returns the download URL.
 * @param userId - The ID of the user uploading the file.
 * @param file - The file to upload.
 * @param path - The base path for the upload (e.g., 'profile-photos').
 * @returns The public URL of the uploaded image.
 */
export async function uploadImageAndGetURL(
  userId: string,
  file: File,
  path: 'profile-photos' | 'background-images'
): Promise<string> {
  if (!userId) {
    throw new Error('User must be authenticated to upload files.');
  }

  const filePath = `${path}/${userId}/${file.name}`;
  const storageRef = ref(storage, filePath);

  // Upload file
  const snapshot = await uploadBytes(storageRef, file);

  // Get the download URL
  const downloadURL = await getDownloadURL(snapshot.ref);

  return downloadURL;
}
