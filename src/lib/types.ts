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
  timestamp: string;
  position: { x: number; y: number };
  /** Signer chose "only the graduate sees this". Public reads hide the row when true. */
  private_by_signer?: boolean;
  /** Board owner hid the row. Only the owner can set this. */
  hidden_by_owner?: boolean;
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
