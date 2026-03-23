"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import SigningPagePreview from "@/components/dashboard/signing-page-preview";
import { useToast } from "@/hooks/use-toast";
import { useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import type { Student } from "@/lib/types";
import { normalizeStudentForEditor } from "@/lib/student-page";
import { createObjectImageUrl, uploadStudentImage } from "@/lib/image-upload";
import { getErrorDisplay } from "@/lib/error-display";

export default function CustomizePage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const studentDocRef = useMemoFirebase(
    () => (user ? doc(firestore, "students", user.uid) : null),
    [firestore, user]
  );

  const { data: student, isLoading: isStudentLoading } = useDoc<Student>(studentDocRef);

  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [isBackgroundUploading, setIsBackgroundUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const backgroundPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (student) {
      setStudentData(normalizeStudentForEditor(student));
    }
  }, [student]);

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    if (backgroundPreviewUrl) URL.revokeObjectURL(backgroundPreviewUrl);
  }, [avatarPreviewUrl, backgroundPreviewUrl]);

  const replacePreviewUrl = useCallback((setter: (value: string | null) => void, currentUrl: string | null, nextUrl: string | null) => {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
    setter(nextUrl);
  }, []);

  const persistStudentUpdate = useCallback(
    async (data: Partial<Student>) => {
      if (!studentDocRef) return;
      await setDoc(studentDocRef, data, { merge: true });
    },
    [studentDocRef]
  );

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user || !studentDocRef) return;

    const file = e.target.files[0];
    const previewUrl = createObjectImageUrl(file);
    replacePreviewUrl(setAvatarPreviewUrl, avatarPreviewUrl, previewUrl);
    setStudentData((current) => (current ? { ...current, profilePhotoUrl: previewUrl } : current));
    setIsAvatarUploading(true);
    toast({ title: "Uploading profile picture..." });

    try {
      const url = await uploadStudentImage(user.uid, file, "profile-photos", 2 * 1024 * 1024);
      await updateProfile(user, { photoURL: url });
      await persistStudentUpdate({ profilePhotoUrl: url });
      replacePreviewUrl(setAvatarPreviewUrl, previewUrl, null);
      setStudentData((current) => (current ? { ...current, profilePhotoUrl: url } : null));
      toast({
        title: "Profile picture updated",
        description: "Your signing page now shows the new photo.",
      });
    } catch (error: any) {
      replacePreviewUrl(setAvatarPreviewUrl, previewUrl, null);
      setStudentData((current) =>
        current ? { ...current, profilePhotoUrl: student?.profilePhotoUrl || "" } : current
      );
      const display = getErrorDisplay(error, {
        title: "Upload failed",
        description: "We couldn't update your profile picture right now.",
      });
      toast({
        variant: "destructive",
        title: display.title,
        description: display.description,
      });
    } finally {
      setIsAvatarUploading(false);
      e.target.value = "";
    }
  };

  const handleBackgroundUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user || !studentDocRef || !studentData) return;

    const file = e.target.files[0];
    const previewUrl = createObjectImageUrl(file);
    replacePreviewUrl(setBackgroundPreviewUrl, backgroundPreviewUrl, previewUrl);
    setStudentData((current) =>
      current
        ? {
            ...current,
            pageSettings: { ...current.pageSettings, backgroundImageUrl: previewUrl },
          }
        : current
    );
    setIsBackgroundUploading(true);
    toast({ title: "Uploading background..." });

    try {
      const url = await uploadStudentImage(user.uid, file, "background-images", 5 * 1024 * 1024);
      const pageSettings = { ...studentData.pageSettings, backgroundImageUrl: url };
      await persistStudentUpdate({ pageSettings });
      replacePreviewUrl(setBackgroundPreviewUrl, previewUrl, null);
      setStudentData((current) => (current ? { ...current, pageSettings } : null));
      toast({
        title: "Background updated",
        description: "Your page preview has been refreshed.",
      });
    } catch (error: any) {
      replacePreviewUrl(setBackgroundPreviewUrl, previewUrl, null);
      setStudentData((current) =>
        current
          ? {
              ...current,
              pageSettings: {
                ...current.pageSettings,
                backgroundImageUrl: student?.pageSettings?.backgroundImageUrl || "",
              },
            }
          : current
      );
      const display = getErrorDisplay(error, {
        title: "Upload failed",
        description: "We couldn't update your background image right now.",
      });
      toast({
        variant: "destructive",
        title: display.title,
        description: display.description,
      });
    } finally {
      setIsBackgroundUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveBackground = useCallback(() => {
    if (!studentData || !studentDocRef) return;

    const pageSettings = { ...studentData.pageSettings, backgroundImageUrl: "" };
    setStudentData({ ...studentData, pageSettings });
    void persistStudentUpdate({ pageSettings })
      .then(() => {
        replacePreviewUrl(setBackgroundPreviewUrl, backgroundPreviewUrl, null);
        toast({
          title: "Background removed",
          description: "Your public page will use the default background again.",
        });
      })
      .catch((error: any) => {
        setStudentData(studentData);
        const display = getErrorDisplay(error, {
          title: "Update failed",
          description: "We couldn't remove your background image right now.",
        });
        toast({
          variant: "destructive",
          title: display.title,
          description: display.description,
        });
      });
  }, [backgroundPreviewUrl, persistStudentUpdate, replacePreviewUrl, studentData, studentDocRef, toast]);

  const handleSave = useCallback(() => {
    if (!studentData || !studentDocRef) return;

    void persistStudentUpdate(studentData)
      .then(() => {
        toast({
          title: "Changes saved",
          description: "Your public page has been updated.",
        });
      })
      .catch((error: any) => {
        const display = getErrorDisplay(error, {
          title: "Save failed",
          description: "We couldn't save your page changes right now.",
        });
        toast({
          variant: "destructive",
          title: display.title,
          description: display.description,
        });
      });
  }, [persistStudentUpdate, studentData, studentDocRef, toast]);

  if (isUserLoading || isStudentLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  if (!studentData || !user) {
    return <div className="p-8">Could not load student data.</div>;
  }

  return (
    <div className="h-full space-y-8 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">Customize Your Page</h1>
        <p className="text-muted-foreground">
          Personalize the signing page your friends will see before they leave a message.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
              <CardDescription>This photo appears at the top of your public signing page.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative">
                  <Avatar className="h-24 w-24 border-2 border-border shadow">
                    <AvatarImage src={studentData.profilePhotoUrl || undefined} alt={studentData.name} />
                    <AvatarFallback className="text-2xl">{studentData.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => profilePhotoRef.current?.click()}
                    disabled={isAvatarUploading}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100"
                    title="Change profile picture"
                  >
                    {isAvatarUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  </button>
                </div>
                <div className="space-y-2">
                  <Button variant="outline" onClick={() => profilePhotoRef.current?.click()} disabled={isAvatarUploading}>
                    {isAvatarUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    {studentData.profilePhotoUrl ? "Change Picture" : "Upload Picture"}
                  </Button>
                  <input
                    ref={profilePhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <p className="text-xs text-muted-foreground">Square images work best. Max size: 2 MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Page Appearance</CardTitle>
              <CardDescription>Update the headline, mood, and background of your public signing page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="page-heading">Page Heading</Label>
                <Input
                  id="page-heading"
                  placeholder="Alex Doe's Sign-Off"
                  value={studentData.pageSettings.pageHeading}
                  onChange={(e) =>
                    setStudentData((current) =>
                      current
                        ? {
                            ...current,
                            pageSettings: { ...current.pageSettings, pageHeading: e.target.value },
                          }
                        : null
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page-subheading">Page Subheading</Label>
                <Input
                  id="page-subheading"
                  placeholder="Sign my final year board and leave a message."
                  value={studentData.pageSettings.pageSubheading}
                  onChange={(e) =>
                    setStudentData((current) =>
                      current
                        ? {
                            ...current,
                            pageSettings: { ...current.pageSettings, pageSubheading: e.target.value },
                          }
                        : null
                    )
                  }
                />
              </div>
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label>Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Switch the public signing page between light and dark styling.
                    </p>
                  </div>
                  <Switch
                    checked={studentData.pageSettings.theme === "dark"}
                    onCheckedChange={(checked) =>
                      setStudentData((current) =>
                        current
                          ? {
                              ...current,
                              pageSettings: { ...current.pageSettings, theme: checked ? "dark" : "light" },
                            }
                          : null
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-4 rounded-xl border p-4">
                <div className="space-y-1">
                  <Label className="text-base">Background Image</Label>
                  <p className="text-sm text-muted-foreground">
                    Add a subtle backdrop behind the header section of your signing page.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => backgroundPhotoRef.current?.click()} disabled={isBackgroundUploading}>
                    {isBackgroundUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                    {studentData.pageSettings.backgroundImageUrl ? "Change Background" : "Upload Background"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleRemoveBackground}
                    disabled={!studentData.pageSettings.backgroundImageUrl || isBackgroundUploading}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Background
                  </Button>
                  <input
                    ref={backgroundPhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBackgroundUpload}
                  />
                </div>
                {studentData.pageSettings.backgroundImageUrl ? (
                  <img
                    src={studentData.pageSettings.backgroundImageUrl}
                    alt="Signing page background preview"
                    className="aspect-[16/9] w-full max-w-md rounded-xl border object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] w-full max-w-md items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
                    No background image selected yet.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Landscape images work best. Max size: 5 MB.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thank You Pop-up</CardTitle>
              <CardDescription>Customize the message friends see after signing your board.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="popup-title">Pop-up Title</Label>
                <Input
                  id="popup-title"
                  placeholder="Thank you so much!"
                  value={studentData.popupMessageConfig.title}
                  onChange={(e) =>
                    setStudentData((current) =>
                      current
                        ? {
                            ...current,
                            popupMessageConfig: { ...current.popupMessageConfig, title: e.target.value },
                          }
                        : null
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-message">Pop-up Message</Label>
                <Textarea
                  id="popup-message"
                  rows={5}
                  placeholder="Your message means the world to me."
                  value={studentData.popupMessageConfig.message}
                  onChange={(e) =>
                    setStudentData((current) =>
                      current
                        ? {
                            ...current,
                            popupMessageConfig: { ...current.popupMessageConfig, message: e.target.value },
                          }
                        : null
                    )
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} size="lg" disabled={isAvatarUploading || isBackgroundUploading}>
            {(isAvatarUploading || isBackgroundUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </div>

        <div className="self-start space-y-6 xl:sticky xl:top-6">
          <SigningPagePreview student={studentData} />
          <Card>
            <CardHeader>
              <CardTitle>Customization Tips</CardTitle>
              <CardDescription>These small details help the page feel polished.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Keep your heading short enough to read comfortably on mobile.</p>
              <p>Choose a bright profile picture so it stands out in both light and dark themes.</p>
              <p>Subtle background images work best because signatures still need to stay visible.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
