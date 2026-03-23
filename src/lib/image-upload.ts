import { uploadImageAndGetURL } from "@/firebase/storage";

const VALID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VALID_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function getFileExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.at(-1)?.toLowerCase() ?? "" : "";
}

function isValidImageType(file: File) {
  if (file.type && VALID_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return true;
  }

  const extension = getFileExtension(file.name);
  return VALID_IMAGE_EXTENSIONS.has(extension);
}

export function validateImageFile(file: File, maxBytes: number) {
  if (!isValidImageType(file)) {
    throw new Error("Please upload a JPG, PNG, WEBP, or GIF image.");
  }

  if (file.size > maxBytes) {
    throw new Error(`Please upload an image smaller than ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
}

export function createObjectImageUrl(file: File) {
  return URL.createObjectURL(file);
}

export async function uploadStudentImage(
  userId: string,
  file: File,
  path: "profile-photos" | "background-images",
  maxBytes: number
) {
  validateImageFile(file, maxBytes);
  return uploadImageAndGetURL(userId, file, path);
}
