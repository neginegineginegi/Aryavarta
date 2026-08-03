import { redirect } from "next/navigation";

// OAuth-only: signing up and signing in are the same flow.
export default function SignupPage() {
  redirect("/login");
}
