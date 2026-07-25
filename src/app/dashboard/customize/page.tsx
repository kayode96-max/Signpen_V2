
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
    return <div className="absolute inset-0 pt-24 bg-black flex justify-center items-center h-full"><Loader2 className="animate-spin text-white w-8 h-8" /></div>;
  }

  if (!studentData || !user) {
    return <div className="absolute inset-0 pt-24 bg-black p-8 text-white">Could not load student data.</div>;
  }

  return (
    <div className="absolute inset-0 pt-24 pb-12 overflow-y-auto overflow-x-hidden bg-black text-white font-sans selection:bg-white/20">
      <div className="p-4 sm:p-6 lg:p-8 space-y-10 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white font-headline">Customize Your Page</h1>
          <p className="text-white/60 mt-2 text-lg">Make your sign-out page uniquely yours.</p>
        </div>

      <div className="space-y-8">
        {/* ── Avatar / Profile Photo ─────────────────────────────────────── */}
        <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl">Signing Page Avatar</CardTitle>
            <CardDescription className="text-white/50">This photo appears at the top of your public signing page.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-5">
              <div className="relative group cursor-pointer" onClick={() => profilePhotoRef.current?.click()}>
                <Avatar className="w-20 h-20 border-2 border-white/10 shadow-lg">
                  <AvatarImage src={studentData.profilePhotoUrl || undefined} alt={studentData.name} />
                  <AvatarFallback className="text-2xl bg-[#1c1c1e] text-white/60">{studentData.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  title="Change avatar"
                >
                  {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                </div>
              </div>
              <div className="space-y-3 pt-1">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => profilePhotoRef.current?.click()} 
                  disabled={isUploading}
                  className="bg-[#1c1c1e] text-white hover:bg-white/10 border-white/10 rounded-full px-6 h-11 transition-all shadow-sm"
                >
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {studentData.profilePhotoUrl ? 'Change Avatar' : 'Upload Avatar'}
                </Button>
                <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <p className="text-xs text-white/40">Square image recommended, under 2 MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Page Appearance ────────────────────────────────────────────── */}
        <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl">Page Appearance</CardTitle>
            <CardDescription className="text-white/50">Customize the look and feel of your public signature page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="page-heading" className="text-white/70">Page Heading</Label>
              <Input 
                id="page-heading" 
                placeholder="Alex Doe's Sign-Off" 
                value={studentData.pageSettings.pageHeading}
                onChange={e => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, pageHeading: e.target.value }}) : null)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-subheading" className="text-white/70">Page Subheading</Label>
              <Input 
                id="page-subheading" 
                placeholder="Sign My Final Year Board 🎓✨" 
                value={studentData.pageSettings.pageSubheading}
                onChange={e => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, pageSubheading: e.target.value }}) : null)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <div className="flex flex-row items-center justify-between rounded-2xl border border-white/10 bg-[#1c1c1e] p-6">
              <div className="space-y-1">
                <Label className="text-white text-base">Dark Mode</Label>
                <p className="text-sm text-white/50">
                  Enable a dark theme for your public page.
                </p>
              </div>
              <Switch
                checked={studentData.pageSettings.theme === 'dark'}
                onCheckedChange={(checked) => setStudentData(s => s ? ({ ...s, pageSettings: { ...s.pageSettings, theme: checked ? 'dark' : 'light' }}) : null)}
                className="data-[state=checked]:bg-white data-[state=unchecked]:bg-white/10"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
          <CardHeader className="pb-6">
            <CardTitle className="text-2xl">Thank You Pop-up</CardTitle>
            <CardDescription className="text-white/50">Customize the message shown to friends after they sign.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="popup-title" className="text-white/70">Pop-up Title</Label>
              <Input 
                id="popup-title" 
                placeholder="Thank You So Much ❤️" 
                value={studentData.popupMessageConfig.title}
                onChange={e => setStudentData(s => s ? ({ ...s, popupMessageConfig: { ...s.popupMessageConfig, title: e.target.value }}) : null)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="popup-message" className="text-white/70">Pop-up Message</Label>
              <Textarea 
                id="popup-message" 
                placeholder="Your message means the world to me." 
                value={studentData.popupMessageConfig.message}
                onChange={e => setStudentData(s => s ? ({ ...s, popupMessageConfig: { ...s.popupMessageConfig, message: e.target.value }}) : null)}
                className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl px-4 py-3 min-h-[120px] focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
              />
            </div>
          </CardContent>
        </Card>
        
        <Button 
          onClick={handleSave} 
          size="lg"
          className="bg-white text-black hover:bg-gray-200 rounded-full px-8 h-12 font-medium shadow-sm transition-all"
        >
          Save Changes
        </Button>
      </div>
      </div>
    </div>
  );
}
