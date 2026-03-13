"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { AuthBrandDisplay } from "@/components/auth-brand-display"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signIn } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await signIn.email({
      email,
      password,
      fetchOptions: {
        onRequest: () => setLoading(true),
        onResponse: () => setLoading(false),
        onError: (ctx) => {
          toast.error(ctx.error.message || "登录失败，请检查邮箱和密码")
        },
        onSuccess: () => {
          toast.success("登录成功")
          window.location.href = "/"
        },
      },
    })
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="font-bold text-2xl">欢迎回来</h1>
                <p className="text-balance text-muted-foreground">登录到 MindPocket</p>
              </div>
              <Field>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
                <Input
                  disabled={loading}
                  id="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="m@example.com"
                  required
                  type="email"
                  value={email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  disabled={loading}
                  id="password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </Field>
              <Field>
                <Button className="w-full" disabled={loading} type="submit">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "登录"}
                </Button>
              </Field>
              <div className="text-center text-sm text-muted-foreground">
                还没有账号？
                <button
                  className="ml-1 underline underline-offset-4 hover:text-foreground"
                  onClick={async (e) => {
                    e.preventDefault()
                    try {
                      const res = await fetch("/api/check-registration")
                      const data = await res.json()
                      if (data.allowed) {
                        router.push("/signup")
                      } else {
                        toast.error(data.message || "注册已关闭")
                      }
                    } catch {
                      toast.error("无法检查注册状态")
                    }
                  }}
                  type="button"
                >
                  去注册
                </button>
              </div>
            </FieldGroup>
          </form>
          <AuthBrandDisplay />
        </CardContent>
      </Card>
    </div>
  )
}
