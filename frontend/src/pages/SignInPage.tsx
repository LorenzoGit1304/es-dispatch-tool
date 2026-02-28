import { SignIn } from "@clerk/clerk-react";

export function SignInPage() {
  return (
    <main className="center-screen">
      <SignIn fallbackRedirectUrl="/" />
    </main>
  );
}
