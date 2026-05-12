import { headers } from "next/headers";
import LoginPageClient from "./login-page-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const preferCompactLayout = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  return <LoginPageClient preferCompactLayout={preferCompactLayout} />;
}
