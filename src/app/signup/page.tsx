import { redirect } from "next/navigation";

/** Sign-up lives on the login screen. /signup opens that tab. */
export default function SignupPage() {
  redirect("/login?tab=signup");
}
