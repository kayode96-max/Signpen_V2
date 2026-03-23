import type { Student } from "@/lib/types";

export const DEFAULT_PAGE_HEADING_SUFFIX = "'s Sign-Off";
export const DEFAULT_PAGE_SUBHEADING = "Sign my final year board and leave a message.";
export const DEFAULT_POPUP_TITLE = "Thank you so much!";
export const DEFAULT_POPUP_MESSAGE =
  "Your message means the world to me. Thank you for being part of my journey!";

export function getDefaultPageHeading(name: string) {
  const trimmedName = name.trim();
  return trimmedName ? `${trimmedName}${DEFAULT_PAGE_HEADING_SUFFIX}` : `My${DEFAULT_PAGE_HEADING_SUFFIX}`;
}

export function createDefaultStudentProfile(
  overrides: Partial<Student> & Pick<Student, "id" | "name" | "email" | "profilePhotoUrl">
): Student {
  return {
    id: overrides.id,
    name: overrides.name,
    email: overrides.email,
    profilePhotoUrl: overrides.profilePhotoUrl,
    pageSettings: {
      theme: "light",
      pageHeading: getDefaultPageHeading(overrides.name),
      pageSubheading: DEFAULT_PAGE_SUBHEADING,
      backgroundImageUrl: "",
      ...overrides.pageSettings,
    },
    popupMessageConfig: {
      title: DEFAULT_POPUP_TITLE,
      message: DEFAULT_POPUP_MESSAGE,
      ...overrides.popupMessageConfig,
    },
  };
}

export function normalizeStudentForEditor(student: Student): Student {
  return createDefaultStudentProfile(student);
}
