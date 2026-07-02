import { loginAction } from "@/app/auth/actions";

type AuthFormProps = {
  redirectTo: string;
  error?: string;
  message?: string;
};

export function AuthForm({ redirectTo, error, message }: AuthFormProps) {
  return (
    <section className="auth-card">
      <div>
        <p className="eyebrow">Account</p>
        <h1>登录</h1>
        <p>使用已授权账号进入站点。</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}

      <form action={loginAction} className="auth-form">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" required minLength={6} />
        </label>
        <button type="submit" className="button-primary">
          登录
        </button>
      </form>
    </section>
  );
}
