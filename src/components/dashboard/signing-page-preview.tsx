"use client";

import type { Student } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SigningPagePreviewProps {
  student: Student;
}

export default function SigningPagePreview({ student }: SigningPagePreviewProps) {
  const isDark = student.pageSettings.theme === "dark";
  const fallback = student.name.charAt(0).toUpperCase();

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Live Preview</CardTitle>
        <CardDescription>See how your public signing page header will look.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`relative overflow-hidden rounded-2xl border p-6 sm:p-8 ${
            isDark ? "border-slate-800 bg-slate-950 text-slate-50" : "border-slate-200 bg-white text-slate-950"
          }`}
        >
          {student.pageSettings.backgroundImageUrl ? (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url(${student.pageSettings.backgroundImageUrl})` }}
            />
          ) : (
            <div
              className={`absolute inset-0 ${
                isDark
                  ? "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)]"
                  : "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_55%)]"
              }`}
            />
          )}

          <div className="relative flex flex-col items-center text-center">
            <Avatar className="mb-4 h-24 w-24 border-4 border-white/80 shadow-lg">
              <AvatarImage src={student.profilePhotoUrl || undefined} alt={student.name} />
              <AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
            </Avatar>
            <h2 className="text-3xl font-bold font-headline">{student.pageSettings.pageHeading}</h2>
            <p className={`mt-2 max-w-xl text-sm sm:text-base ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              {student.pageSettings.pageSubheading}
            </p>

            <div
              className={`mt-6 w-full max-w-md rounded-2xl border px-4 py-3 text-left shadow-sm ${
                isDark ? "border-slate-700 bg-slate-900/80" : "border-slate-200 bg-white/85"
              }`}
            >
              <p className="text-sm font-semibold">{student.popupMessageConfig.title}</p>
              <p className={`mt-1 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {student.popupMessageConfig.message}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
