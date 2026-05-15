import { loginAction, oauthAction, registerAction } from "@/app/auth/actions";

type AuthFormProps = {
  mode: "login" | "register";
  redirectTo: string;
  error?: string;
  message?: string;
};

export function AuthForm({ mode, redirectTo, error, message }: AuthFormProps) {
  return (
    <section className="auth-card">
      <div>
        <p className="eyebrow">Account</p>
        <h1>{mode === "login" ? "登录" : "注册"}</h1>
        <p>使用邮箱密码，或通过 GitHub / Google OAuth 进入站点。</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-message">{message}</p> : null}

      <form action={mode === "login" ? loginAction : registerAction} className="auth-form">
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
          {mode === "login" ? "登录" : "注册"}
        </button>
      </form>

      <div className="oauth-row">
        {(["github", "google"] as const).map((provider) => (
          <form action={oauthAction} key={provider}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button type="submit" className="button-secondary">
              {provider === "github" ? "GitHub" : "Google"}
            </button>
          </form>
        ))}
      </div>

      <p className="auth-switch">
        {mode === "login" ? "还没有账号？" : "已有账号？"}{" "}
        <a href={`/auth?mode=${mode === "login" ? "register" : "login"}&redirectTo=${encodeURIComponent(redirectTo)}`}>
          {mode === "login" ? "注册" : "登录"}
        </a>
      </p>
    </section>
  );
}
