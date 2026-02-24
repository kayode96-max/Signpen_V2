
import type { FieldValue } from 'firebase/firestore';

export interface Student {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl: string;
  pageSettings: {
    theme: 'light' | 'dark';
    pageHeading: string;
    pageSubheading: string;
    backgroundImageUrl?: string;
  };
  popupMessageConfig: {
    title: string;
    message: string;
  };
}

export interface Signature {
  id: string;
  studentId: string;
  signatureImageUrl: string;
  signatoryName: string;
  signatoryNote: string;
  timestamp: string | FieldValue;
  position: { x: number; y: number };
}

export interface ThankYouCard {
  id: string;
  studentId: string;
  signatureId: string;
  cardDesign: {
    background: string;
    stickers: string[];
    editedMessage: string;
  };
  timestamp: string;
}
