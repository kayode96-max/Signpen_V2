
"use client";

import { useEffect, useState, useCallback, useRef, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useDoc, useMemoFirebase, useAuth } from "@/firebase";
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { uploadImageAndGetURL } from "@/firebase/storage";
import { updateProfile } from 'firebase/auth';
import type { Student } from "@/lib/types";
import { Loader2, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function CustomizePage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const studentDocRef = useMemoFirebase(() => (
    user ? doc(firestore, 'students', user.uid) : null
  ), [firestore, user]);

  const { data: student, isLoading: isStudentLoading } = useDoc<Student>(studentDocRef);
  
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const profilePhotoRef = useRef<HTMLInputElement>(null);
  const auth = useAuth();

  useEffect(() => {
    if (student) {
      setStudentData(student);
    }
  }, [student]);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user || !studentDocRef) return;
    const file = e.target.files[0];
    setIsUploading(true);
    toast({ title: 'Uploading avatar…' });
    try {
      const url = await uploadImageAndGetURL(user.uid, file, 'profile-photos');
      await updateProfile(user, { photoURL: url });
      setDocumentNonBlocking(studentDocRef, { profilePhotoUrl: url }, { merge: true });
      setStudentData(s => s ? { ...s, profilePhotoUrl: url } : null);
      toast({ title: 'Avatar updated!', description: 'Your signing page now shows the new photo.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = useCallback(() => {
    if (!studentData || !user || !studentDocRef) return;
    
    // Create a deep copy to avoid direct mutation issues
    const dataToSave = JSON.parse(JSON.stringify(studentData));

    setDocumentNonBlocking(studentDocRef, dataToSave, { merge: true });

    toast({
      title: "Settings Saved!",
      description: "Your public page has been updated.",
    });
  }, [studentData, user, toast, studentDocRef]);

  if (isUserLoading || isStudentLoading) {
    return <div className="p-8 flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (!studentData || !user) {
    return <div className="p-8">Could not load student data.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 h-full overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">Customize Your Page</h1>
        <p className="text-muted-foreground">Make your sign-out page uniquely yours.</p>
      </div>

      <div className="space-y-6">
        {/* ── Avatar / Profile Photo ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Signing Page Avatar</CardTitle>
            <CardDescription>This photo appears at the top of your public signing page.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-5">
              <div className="relative">
                <Avatar className="w-20 h-20 border-2 border-border shadow">
                  <AvatarImage src={studentData.profilePhotoUrl || undefined} alt={studentData.name} />
                  <AvatarFallback className="text-2xl">{studentData.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <button
                  onClick={() => profilePhotoRef.current?.click()}
                  disabled={isUploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white cursor-pointer"
                  title="Change avatar"
                >
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                </button>
              </div>
              <div className="space-y-2 pt-1">
                <Button variant="outline" onClick={() => profilePhotoRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {studentData.profilePhotoUrl ? 'Change Avatar' : 'Upload Avatar'}
                </Button>
                <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <p className="text-xs text-muted-foreground">Square image recommended, under 2 MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Page Appearance ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Page Appearance</CardTitle>
            <CardDescription>Customize the look and feel of your public signature page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="page-heading">Page Heading</Label>
              <Input 
                id="page-heading" 
                placeholder="Alex Doe's Sign-Off" 
                value={studentData.pageSettings.pageHeading}
                onChange={e => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, pageHeading: e.target.value }}) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-subheading">Page Subheading</Label>
              <Input 
                id="page-subheading" 
                placeholder="Sign My Final Year Board 🎓✨" 
                value={studentData.pageSettings.pageSubheading}
                onChange={e => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, pageSubheading: e.target.value }}) : null)}
              />
            </div>
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Enable a dark theme for your public page.
                </p>
              </div>
              <Switch
                checked={studentData.pageSettings.theme === 'dark'}
                onCheckedChange={(checked) => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, theme: checked ? 'dark' : 'light' }}) : null)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thank You Pop-up</CardTitle>
            <CardDescription>Customize the message shown to friends after they sign.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="popup-title">Pop-up Title</Label>
              <Input 
                id="popup-title" 
                placeholder="Thank You So Much ❤️" 
                value={studentData.popupMessageConfig.title}
                onChange={e => setStudentData(s => s ? ({ ...s, popupMessageConfig: { ...s.popupMessageConfig, title: e.target.value }}) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="popup-message">Pop-up Message</Label>
              <Textarea 
                id="popup-message" 
                placeholder="Your message means the world to me." 
                value={studentData.popupMessageConfig.message}
                onChange={e => setStudentData(s => s ? ({ ...s, popupMessageConfig: { ...s.popupMessageConfig, message: e.target.value }}) : null)}
              />
            </div>
          </CardContent>
        </Card>
        
        <Button onClick={handleSave} size="lg">
          Save Changes
        </Button>
      </div>
    </div>
  );
}
