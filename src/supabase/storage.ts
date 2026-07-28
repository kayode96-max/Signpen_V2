import { supabase } from './config';

/**
 * Uploads an image to Supabase Storage and returns the public URL.
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

  // Upload file to 'signpen' bucket
  const { data, error } = await supabase.storage
    .from('signpen')
    .upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
    });

  if (error) {
    console.error('Error uploading image to Supabase Storage:', error);
    throw error;
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from('signpen')
    .getPublicUrl(filePath);

  return publicUrlData.publicUrl;
}
