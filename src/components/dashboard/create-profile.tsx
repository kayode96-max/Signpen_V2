
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { User } from '@/supabase/types';
import { useFirestore, doc, setDocumentNonBlocking } from '@/supabase';
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
    <div className="dark flex items-center justify-center min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black p-4 -mx-4 md:-mx-6 -mt-24 pt-24 pb-12">
      <Card className="w-full max-w-md bg-zinc-900/40 border-zinc-800/50 backdrop-blur-md shadow-2xl text-white">
        <CardHeader className="text-center pb-6">
          <CardTitle className="text-2xl font-headline">
            Create Your Profile
          </CardTitle>
          <CardDescription className="text-zinc-400">
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
                    <FormLabel className="text-white/70">Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Alex Doe"
                        className="bg-[#1c1c1e] border-transparent focus:border-white/20 text-white rounded-xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all placeholder:text-white/30"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                  <FormLabel className="text-white/70">Email</FormLabel>
                  <Input 
                    value={user.email || 'No email provided'} 
                    disabled 
                    className="bg-[#1c1c1e] border-transparent text-white/50 rounded-xl h-12 px-4" 
                  />
              </div>
              <Button type="submit" className="w-full bg-white text-black hover:bg-gray-200 rounded-full h-12 font-medium" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-black" />
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
