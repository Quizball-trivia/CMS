'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Mail, 
  Lock, 
  Loader2, 
  Eye, 
  EyeOff, 
  ChevronRight, 
  AlertCircle 
} from 'lucide-react';
import { useAuth } from '@/providers';
import { ApiClientError } from '@/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(data: LoginFormData) {
    setError(null);
    setIsSubmitting(true);

    try {
      await login(data);
      toast.success('Successfully signed in');
      router.push('/categories');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        toast.error('Authentication failed', {
          description: err.message,
        });
      } else {
        const message = 'An unexpected error occurred. Please try again.';
        setError(message);
        toast.error('Error', {
          description: message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-white/10 shadow-2xl bg-card/40 backdrop-blur-2xl border border-white/20 relative overflow-hidden group">
      {/* Subtle interior glow */}
      <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <CardHeader className="space-y-4 pb-8 text-center relative z-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-xl backdrop-blur-md border border-white/10 transition-transform duration-500 group-hover:scale-110">
          <Lock className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-muted-foreground/60 font-medium text-sm tracking-tight">
            CMS-ი, სიმონ!
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="relative z-10">
        {error && (
          <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2 duration-300 bg-destructive/10 border-destructive/20 backdrop-blur-md text-destructive py-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="font-bold text-xs uppercase tracking-tight">{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <FormLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Email Address</FormLabel>
                  </div>
                  <FormControl>
                    <div className="relative group/input">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-muted-foreground/30 transition-colors group-focus-within/input:text-primary" />
                      </div>
                      <Input
                        type="email"
                        placeholder="admin@quizball.ge"
                        className="pl-11 h-12 bg-white/5 border-white/10 transition-all duration-300 focus:bg-white/[0.08] focus:ring-2 focus:ring-primary/20 backdrop-blur-sm rounded-xl font-medium"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[10px] font-bold uppercase tracking-tight" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <FormLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Password</FormLabel>
                    <button type="button" className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors uppercase tracking-widest">Forgot?</button>
                  </div>
                  <FormControl>
                    <div className="relative group/input">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-muted-foreground/30 transition-colors group-focus-within/input:text-primary" />
                      </div>
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        className="pl-11 pr-11 h-12 bg-white/5 border-white/10 transition-all duration-300 focus:bg-white/[0.08] focus:ring-2 focus:ring-primary/20 backdrop-blur-sm rounded-xl font-medium"
                        {...field}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground/30 hover:text-primary transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-[10px] font-bold uppercase tracking-tight" />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full h-12 text-sm font-black uppercase tracking-[0.15em] transition-all duration-300 active:scale-[0.97] bg-primary shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:bg-primary/90 rounded-xl" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Authorize Session</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-4 border-t border-white/5 pt-6 text-center relative z-10">
        <div className="flex items-center justify-center gap-6 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
        </div>
      </CardFooter>
    </Card>
  );
}
