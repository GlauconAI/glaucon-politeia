import { AuthForm } from "@/components/auth/AuthForm";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

type AuthPageProps = {
  searchParams: Promise<{
    redirectTo?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectPath(params.redirectTo);

  return (
    <div className="auth-page">
      <AuthForm
        redirectTo={redirectTo}
        error={params.error}
        message={params.message}
      />
    </div>
  );
}
