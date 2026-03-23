"use client";

import { FirestorePermissionError } from "@/firebase/errors";

type ErrorDisplay = {
  title: string;
  description: string;
};

const CODE_MAP: Record<string, ErrorDisplay> = {
  "auth/email-already-in-use": {
    title: "Email already in use",
    description: "That email is already connected to an account. Try signing in instead.",
  },
  "auth/invalid-credential": {
    title: "Couldn't sign you in",
    description: "Your email or password looks incorrect. Please check it and try again.",
  },
  "auth/invalid-email": {
    title: "Invalid email address",
    description: "Please enter a valid email address and try again.",
  },
  "auth/user-not-found": {
    title: "Account not found",
    description: "We couldn't find an account with those details.",
  },
  "auth/wrong-password": {
    title: "Incorrect password",
    description: "The password you entered is not correct.",
  },
  "auth/popup-closed-by-user": {
    title: "Sign-in canceled",
    description: "The sign-in window was closed before the process finished.",
  },
  "auth/popup-blocked": {
    title: "Popup blocked",
    description: "Your browser blocked the sign-in popup. Allow popups and try again.",
  },
  "auth/network-request-failed": {
    title: "Connection problem",
    description: "We couldn't reach the server. Check your internet connection and try again.",
  },
  "auth/too-many-requests": {
    title: "Too many attempts",
    description: "Please wait a moment before trying again.",
  },
  "auth/requires-recent-login": {
    title: "Please sign in again",
    description: "For security, this action needs a recent sign-in before it can continue.",
  },
  "permission-denied": {
    title: "Access denied",
    description: "You don't have permission to do that right now.",
  },
  "storage/unauthorized": {
    title: "Upload not allowed",
    description: "You don't have permission to upload this file.",
  },
  "storage/canceled": {
    title: "Upload canceled",
    description: "The upload was canceled before it finished.",
  },
  "storage/retry-limit-exceeded": {
    title: "Upload timed out",
    description: "The upload took too long. Please try again.",
  },
};

function normalizeCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function normalizeMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }

  return "";
}

export function getErrorDisplay(
  error: unknown,
  fallback: ErrorDisplay = {
    title: "Something went wrong",
    description: "Please try again in a moment.",
  }
): ErrorDisplay {
  if (error instanceof FirestorePermissionError) {
    return {
      title: "Access denied",
      description: "You don't have permission to complete that action right now.",
    };
  }

  const code = normalizeCode(error);
  if (code && CODE_MAP[code]) {
    return CODE_MAP[code];
  }

  const message = normalizeMessage(error).toLowerCase();

  if (message.includes("smaller than")) {
    return {
      title: "File too large",
      description: normalizeMessage(error),
    };
  }

  if (message.includes("jpg") || message.includes("png") || message.includes("webp") || message.includes("gif")) {
    return {
      title: "Unsupported image",
      description: normalizeMessage(error),
    };
  }

  if (message.includes("authenticated")) {
    return {
      title: "Please sign in",
      description: "You need to be signed in before you can do that.",
    };
  }

  if (message.includes("verify your request")) {
    return {
      title: "Verification failed",
      description: "We couldn't verify your request. Please try again.",
    };
  }

  if (message.includes("network")) {
    return {
      title: "Connection problem",
      description: "We couldn't reach the server. Check your internet connection and try again.",
    };
  }

  return fallback;
}
