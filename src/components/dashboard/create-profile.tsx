
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { User } from 'firebase/auth';
import { useFirestore } from '@/firebase/provider';
import { doc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Student } from '@/lib/types';
import { useRouter } from 'next/navigation';

const profileSchema = z.object({
  name: z.string().min(2, { message: 'Please enter your full name.' }),
});

export default function CreateProfile({ user }: { user: User }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.displayName || '',
    },
  });

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    setIsLoading(true);

    const newStudent: Student = {
      id: user.uid,
      name: values.name,
      email: user.email || '',
      profilePhotoUrl: user.photoURL || '',
      pageSettings: {
        theme: 'light',
        pageHeading: `${values.name}'s Sign-Off`,
        pageSubheading: `Sign My Final Year Board 🎓✨`,
        backgroundImageUrl: '',
      },
      popupMessageConfig: {
        title: 'Thank You So Much ❤️',
        message:
          'Your message means the world to me. Thank you for being a part of my journey!',
      },
    };

    const studentDocRef = doc(firestore, 'students', user.uid);
    setDocumentNonBlocking(studentDocRef, newStudent, { merge: false });

    toast({
      title: 'Profile Created!',
      description: 'Your sign-out page is ready. Welcome to SignPen!',
    });

    // No need to set isloading to false, we are navigating away
    // We don't wait for the doc to be written, onSnapshot will pick it up
    // The dashboard will re-render automatically.
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-secondary">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">
            Create Your Profile
          </CardTitle>
          <CardDescription>
            Just one more step to get your personalized sign-out page ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Alex Doe"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                  <FormLabel>Email</FormLabel>
                  <Input value={user.email || 'No email provided'} disabled />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isLoading ? 'Creating Profile...' : 'Create My Page'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
