
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
    return <div className="p-8 flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary" /></div>;
  }
  
  if (!user || !studentData) {
    return <div className="p-8">Could not load user data.</div>
  }

  const name = user.displayName || user.email || 'User';
  const fallback = name.charAt(0).toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-4xl mx-auto h-full overflow-y-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">Settings</h1>
        <p className="text-muted-foreground">Manage your account and profile settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your public profile information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Name
              </Button>
            </form>
          </Form>

          <div className="pt-4 space-y-4 border-t">
            <div>
              <Label className="text-base font-semibold">Profile / Avatar Picture</Label>
              <p className="text-sm text-muted-foreground mt-1">
                This photo appears on your public signing page and in the dashboard sidebar.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="relative">
                <Avatar className="w-20 h-20 border-2 border-border shadow">
                  <AvatarImage src={user.photoURL || undefined} alt={name} />
                  <AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
                </Avatar>
                {/* Quick-change overlay button */}
                <button
                  onClick={() => handleFileSelect('profile')}
                  disabled={isUploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white"
                  title="Change photo"
                >
                  {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                </button>
              </div>
              <div className="space-y-2">
                <Button variant="outline" onClick={() => handleFileSelect('profile')} disabled={isUploading}>
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {user.photoURL ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <input type="file" ref={profilePhotoInputRef} onChange={(e) => handleImageUpload(e, 'profile')} accept="image/*" className="hidden" />
                <p className="text-xs text-muted-foreground">Square image, under 2 MB. JPG or PNG.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {user?.providerData.some(p => p.providerId === 'password') && (
        <Card>
            <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password. Make sure it's a strong one!</CardDescription>
            </CardHeader>
            <CardContent>
            <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                        <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                    {passwordForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Change Password</Button>
                </form>
            </Form>
            </CardContent>
        </Card>
      )}


      {/* Background image — own section, not in danger zone */}
      <Card>
        <CardHeader>
          <CardTitle>Signing Page Background</CardTitle>
          <CardDescription>
            Upload a background image displayed (at low opacity) behind your public signing page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => handleFileSelect('background')} disabled={isUploading}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {studentData?.pageSettings?.backgroundImageUrl ? 'Change Background' : 'Upload Background'}
            </Button>
            <input type="file" ref={backgroundPhotoInputRef} onChange={(e) => handleImageUpload(e, 'background')} accept="image/*" className="hidden" />
          </div>
          {studentData?.pageSettings?.backgroundImageUrl && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Current Background</Label>
              <img
                src={studentData.pageSettings.backgroundImageUrl}
                alt="background preview"
                className="rounded-md border w-64 object-cover aspect-video shadow"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Recommended: landscape image, under 5 MB.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>These actions are irreversible. Please proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="pt-0">
              <AlertDialog>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive">Delete Account</Button>
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
  );
}
