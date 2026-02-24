import type { Student, Signature } from "@/lib/types";

export const mockStudents: Student[] = [
  {
    id: "demo-student",
    name: "Alex Doe",
    email: "alex.doe@example.com",
    profilePhotoUrl: "https://picsum.photos/seed/user1/200/200",
    pageSettings: {
      theme: "light",
      pageHeading: "Alex Doe's Sign-Off",
      pageSubheading: "Sign My Final Year Board 🎓✨",
      backgroundImageUrl: "",
    },
    popupMessageConfig: {
      title: "Thank You So Much ❤️",
      message: "Your message means the world to me. Thank you for being a part of my journey!",
    },
  },
];

export const mockSignatures: Signature[] = [
  {
    id: "sig-1",
    studentId: "demo-student",
    signatureImageUrl: "https://picsum.photos/seed/sig1/400/200",
    signatoryName: "Jane Smith",
    signatoryNote: "Congratulations, Alex! It's been amazing watching you grow. Best of luck for the future!",
    timestamp: "2024-05-20T10:30:00Z",
    position: { x: 25, y: 30 },
  },
  {
    id: "sig-2",
    studentId: "demo-student",
    signatureImageUrl: "https://picsum.photos/seed/sig2/400/200",
    signatoryName: "Sam Wilson",
    signatoryNote: "We made it! So proud of you. Let's catch up soon. All the best!",
    timestamp: "2024-05-20T11:00:00Z",
    position: { x: 75, y: 50 },
  },
  {
    id: "sig-3",
    studentId: "demo-student",
    signatureImageUrl: "https://picsum.photos/seed/sig3/400/200",
    signatoryName: "Chris Green",
    signatoryNote: "Congrats! You're going to do great things.",
    timestamp: "2024-05-20T12:15:00Z",
    position: { x: 50, y: 75 },
  },
];
