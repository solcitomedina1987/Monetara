"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

const schema = z.object({ email: z.string().email("Email inválido") });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <Card className="border-0 shadow-none">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4 py-8">
            <Mail className="h-16 w-16 text-primary" />
            <h2 className="text-2xl font-bold">Email enviado</h2>
            <p className="text-muted-foreground">
              Revisá tu casilla de correo y seguí las instrucciones para recuperar tu contraseña.
            </p>
            <Link href="/login" className="text-primary font-medium hover:underline">
              Volver al login
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold">Recuperar Contraseña</CardTitle>
        <CardDescription>
          Ingresá tu email y te enviaremos un link para restablecer tu contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="tu@email.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Email
          </Button>
        </form>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary font-medium hover:underline">
            ← Volver al login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
