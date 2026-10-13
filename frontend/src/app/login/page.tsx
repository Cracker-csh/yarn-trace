"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Layers, Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAppDispatch } from "../../store/hooks";
import { setCredentials } from "../../store/slices/authSlice";
import { apiClient } from "../../lib/axios";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);

    try {
      const response = await apiClient.post("/auth/login", data);
      const { user, accessToken, refreshToken } = response.data.data;

      dispatch(
        setCredentials({
          user,
          accessToken,
          refreshToken,
        })
      );

      router.push("/dashboard");
    } catch (err: unknown) {
      let message = "Invalid credentials or unable to reach server";
      if (err && typeof err === "object" && "response" in err) {
        const resp = (err as { response?: { data?: { message?: string } } }).response;
        if (resp?.data?.message) {
          message = resp.data.message;
        }
      }
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-500/20 mb-3">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Yarn<span className="text-brand-600">Trace</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500 max-w-xs">
            Yarn Inventory & Production Traceability System
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 md:p-8 shadow-card">
          <div className="mb-6">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Sign In
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your corporate credentials to access the workspace
            </p>
          </div>

          {serverError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email" required>
                Email Address
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@yarntrace.com"
                  className="pl-9"
                  error={!!errors.email}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-[11px] text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" required>
                  Password
                </Label>
                <a
                  href="#"
                  className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  error={!!errors.password}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-[11px] text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 gap-2"
              isLoading={isLoading}
            >
              <span>Sign In to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Quick Demo Credentials Info */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Enterprise dual-token authentication secured via NestJS & JWT
            </p>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-[11px] text-slate-400">
          YarnTrace System • Initial Foundation Setup
        </p>
      </div>
    </div>
  );
}
