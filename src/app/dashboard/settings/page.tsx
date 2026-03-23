'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
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
import { Loader2 } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";
import { useEffect, useState } from 'react';
import { getErrorDisplay } from '@/lib/error-display';

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
  const firestore = useFirestore();

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

      setStudentData((current) => (current ? { ...current, ...updatedStudent } : null));
      setDocumentNonBlocking(studentDocRef, updatedStudent, { merge: true });

      toast({
        title: 'Profile updated',
        description: 'Your name has been saved.',
      });
    } catch (error: any) {
      const display = getErrorDisplay(error, {
        title: 'Update failed',
        description: "We couldn't save your profile changes right now.",
      });
      toast({
        variant: 'destructive',
        title: display.title,
        description: display.description,
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
        title: 'Password updated',
        description: 'Your new password has been set.',
      });
      passwordForm.reset();
    } catch (error: any) {
      const display = getErrorDisplay(error, {
        title: 'Password change failed',
        description: "We couldn't update your password right now.",
      });
      toast({
        variant: 'destructive',
        title: display.title,
        description: display.description,
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      await deleteUser(user);
      toast({
        title: 'Account deleted',
        description: 'Your account has been permanently deleted.',
      });
    } catch (error: any) {
      const display = getErrorDisplay(error, {
        title: 'Deletion failed',
        description: 'Please sign in again before deleting your account.',
      });
      toast({
        variant: 'destructive',
        title: display.title,
        description: display.description,
      });
    }
  };

  if (isUserLoading || isStudentLoading) {
    return <div className="flex h-full items-center justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  if (!user || !studentData) {
    return <div className="p-8">Could not load user data.</div>;
  }

  return (
    <div className="mx-auto h-full max-w-4xl space-y-8 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-headline text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account details and sign-in preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update the name connected to your account.</CardDescription>
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

          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            Signing page styling, profile picture uploads, and background images now live in{' '}
            <Link href="/dashboard/customize" className="font-medium text-primary underline underline-offset-4">
              Customize
            </Link>
            .
          </div>
        </CardContent>
      </Card>

      {user.providerData.some((provider) => provider.providerId === 'password') && (
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password and keep your account secure.</CardDescription>
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
                  Change Password
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>These actions are irreversible. Please proceed carefully.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove your data from our servers.
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
        </CardContent>
      </Card>
    </div>
  );
}
