
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUser, useAuth, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import {
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
} from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { Student } from '@/lib/types';
import { Loader2, Upload } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ChangeEvent, useEffect, useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { uploadImageAndGetURL } from '@/firebase/storage';


const profileSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Current password is required.' }),
    newPassword: z.string().min(6, { message: 'New password must be at least 6 characters.' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match.",
    path: ['confirmPassword'],
  });

export default function SettingsPage() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();

  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const backgroundPhotoInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);


  const studentDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'students', user.uid) : null),
    [firestore, user]
  );
  const { data: student, isLoading: isStudentLoading } = useDoc<Student>(studentDocRef);

  const [studentData, setStudentData] = useState<Student | null>(null);

  useEffect(() => {
    if (student) {
      setStudentData(student);
    }
  }, [student]);

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
        name: studentData?.name || user?.displayName || '',
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onProfileSubmit = async (data: z.infer<typeof profileSchema>) => {
    if (!user || !studentData || !studentDocRef) return;

    try {
      await updateProfile(user, {
        displayName: data.name,
      });
      
      const updatedStudent: Partial<Student> = {
        name: data.name,
      };

      setStudentData(s => s ? ({...s, ...updatedStudent}) : null);
      setDocumentNonBlocking(studentDocRef, updatedStudent, { merge: true });

      toast({
        title: 'Profile Updated',
        description: 'Your name has been saved.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message,
      });
    }
  };

  const onPasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    if (!user || !user.email) return;

    try {
      const credential = EmailAuthProvider.credential(user.email, data.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, data.newPassword);
      toast({
        title: 'Password Updated',
        description: 'Your new password has been set.',
      });
      passwordForm.reset();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Password Change Failed',
        description: error.code === 'auth/wrong-password' ? 'The current password you entered is incorrect.' : error.message,
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
        // You might want to delete associated Firestore data here as well
        // For example: await deleteDoc(doc(firestore, 'students', user.uid));
        await deleteUser(user);
        toast({
            title: "Account Deleted",
            description: "Your account has been permanently deleted.",
        });
        // router will push to /login due to auth state change in layout
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Deletion Failed",
            description: "Please sign in again to delete your account. " + error.message,
        });
    }
  }

  const handleFileSelect = (type: 'profile' | 'background') => {
    if (type === 'profile') {
      profilePhotoInputRef.current?.click();
    } else {
      backgroundPhotoInputRef.current?.click();
    }
  }

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'profile' | 'background') => {
    if (!e.target.files || e.target.files.length === 0 || !user || !studentDocRef) return;
    
    const file = e.target.files[0];
    setIsUploading(true);
    toast({ title: "Uploading image..." });

    try {
      let downloadURL;
      if (type === 'profile') {
        downloadURL = await uploadImageAndGetURL(user.uid, file, 'profile-photos');
        await updateProfile(user, { photoURL: downloadURL });
        setDocumentNonBlocking(studentDocRef, { profilePhotoUrl: downloadURL }, { merge: true });
      } else {
        downloadURL = await uploadImageAndGetURL(user.uid, file, 'background-images');
        setDocumentNonBlocking(studentDocRef, { pageSettings: { backgroundImageUrl: downloadURL } }, { merge: true });
      }
      
      toast({ title: "Image uploaded successfully!", description: "Your page has been updated." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Upload Failed", description: error.message });
    } finally {
      setIsUploading(false);
    }
  }


  if (isUserLoading || isStudentLoading) {
    return <div className="absolute inset-0 pt-24 bg-black flex justify-center items-center h-full"><Loader2 className="animate-spin text-white w-8 h-8" /></div>;
  }
  
  if (!user || !studentData) {
    return <div className="absolute inset-0 pt-24 bg-black text-white p-8">Could not load user data.</div>
  }

  const name = user.displayName || user.email || 'User';
  const fallback = name.charAt(0).toUpperCase();

  return (
    <div className="absolute inset-0 pt-24 pb-12 overflow-y-auto overflow-x-hidden bg-black text-white font-sans selection:bg-white/20">
      <div className="p-4 sm:p-6 lg:p-8 space-y-10 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white font-headline">Settings</h1>
          <p className="text-white/60 mt-2 text-lg">Manage your account and profile settings.</p>
        </div>

      <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
        <CardHeader className="pb-6">
          <CardTitle className="text-2xl">Profile</CardTitle>
          <CardDescription className="text-white/50">Update your public profile information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70">Full Name</FormLabel>
                    <FormControl>
                      <Input 
                        className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
                        placeholder="Your full name" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={profileForm.formState.isSubmitting}
                className="bg-white text-black hover:bg-gray-200 rounded-full px-8 h-12 font-medium shadow-sm transition-all mt-2"
              >
                {profileForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Name
              </Button>
            </form>
          </Form>

          <div className="pt-8 space-y-6 border-t border-white/10 mt-8">
            <div>
              <Label className="text-lg font-semibold text-white">Profile / Avatar Picture</Label>
              <p className="text-sm text-white/50 mt-1">
                This photo appears on your public signing page and in the dashboard sidebar.
              </p>
            </div>
            <div className="flex items-start gap-5">
              <div className="relative group cursor-pointer" onClick={() => handleFileSelect('profile')}>
                <Avatar className="w-20 h-20 border-2 border-white/10 shadow-lg">
                  <AvatarImage src={user.photoURL || undefined} alt={name} />
                  <AvatarFallback className="text-2xl bg-[#1c1c1e] text-white/60">{fallback}</AvatarFallback>
                </Avatar>
                {/* Quick-change overlay button */}
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  title="Change photo"
                >
                  {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                </div>
              </div>
              <div className="space-y-3 pt-1">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => handleFileSelect('profile')} 
                  disabled={isUploading}
                  className="bg-[#1c1c1e] text-white hover:bg-white/10 border-white/10 rounded-full px-6 h-11 transition-all shadow-sm"
                >
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {user.photoURL ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <input type="file" ref={profilePhotoInputRef} onChange={(e) => handleImageUpload(e, 'profile')} accept="image/*" className="hidden" />
                <p className="text-xs text-white/40">Square image, under 2 MB. JPG or PNG.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {user?.providerData.some(p => p.providerId === 'password') && (
        <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
            <CardHeader className="pb-6">
            <CardTitle className="text-2xl">Change Password</CardTitle>
            <CardDescription className="text-white/50">Update your password. Make sure it's a strong one!</CardDescription>
            </CardHeader>
            <CardContent>
            <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-white/70">Current Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30" />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                    </FormItem>
                    )}
                />
                <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-white/70">New Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30" />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                    </FormItem>
                    )}
                />
                <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-white/70">Confirm New Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30" />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                    </FormItem>
                    )}
                />
                <Button 
                  type="submit" 
                  disabled={passwordForm.formState.isSubmitting}
                  className="bg-white text-black hover:bg-gray-200 rounded-full px-8 h-12 font-medium shadow-sm transition-all mt-4"
                >
                    {passwordForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Change Password
                </Button>
                </form>
            </Form>
            </CardContent>
        </Card>
      )}


      {/* Background image — own section, not in danger zone */}
      <Card className="bg-[#121212] border-white/10 rounded-[2rem] shadow-2xl text-white">
        <CardHeader className="pb-6">
          <CardTitle className="text-2xl">Signing Page Background</CardTitle>
          <CardDescription className="text-white/50">
            Upload a background image displayed (at low opacity) behind your public signing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => handleFileSelect('background')} 
              disabled={isUploading}
              className="bg-[#1c1c1e] text-white hover:bg-white/10 border-white/10 rounded-full px-6 h-11 transition-all shadow-sm"
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {studentData?.pageSettings?.backgroundImageUrl ? 'Change Background' : 'Upload Background'}
            </Button>
            <input type="file" ref={backgroundPhotoInputRef} onChange={(e) => handleImageUpload(e, 'background')} accept="image/*" className="hidden" />
          </div>
          {studentData?.pageSettings?.backgroundImageUrl && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-white/70">Current Background</Label>
              <img
                src={studentData.pageSettings.backgroundImageUrl}
                alt="background preview"
                className="rounded-xl border border-white/10 w-64 object-cover aspect-video shadow-lg"
              />
            </div>
          )}
          <p className="text-xs text-white/40">Recommended: landscape image, under 5 MB.</p>
        </CardContent>
      </Card>

      <Card className="bg-[#121212] border-red-500/10 rounded-[2rem] shadow-2xl text-white">
        <CardHeader className="pb-6">
            <CardTitle className="text-2xl text-red-500">Danger Zone</CardTitle>
            <CardDescription className="text-white/50">These actions are irreversible. Please proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="pt-0">
              <AlertDialog>
                  <AlertDialogTrigger asChild>
                      <Button className="bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 rounded-full px-6 h-11 transition-all">
                        Delete Account
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your
                          account and remove your data from our servers.
                      </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive hover:bg-destructive/90">
                          Yes, delete my account
                      </AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
            </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
