import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "登录 / 注册 — 写作助手",
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-center">登录 / 注册</h1>
      <p className="text-center text-sm text-[var(--color-muted)] mt-2">
        登录后可保存文档、按额度使用，无需重复填表
      </p>
      <AuthForm />
    </div>
  );
}
