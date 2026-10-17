import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Loader2,
  UserCog,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SystemUser, RoleListItem } from "../../types/governance";

const userSchema = z.object({
  email: z.string().email("Invalid email address").or(z.literal("")),
  password: z.string().optional(),
  firstName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "First name is required")),
  lastName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Last name is required")),
  phoneNumber: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === "") return true;
        const trimmed = val.trim();
        if (!/^[+]?[\d\s\-()]+$/.test(trimmed)) return false;
        const digitCount = trimmed.replace(/\D/g, "").length;
        return digitCount >= 7 && digitCount <= 12;
      },
      { message: "Phone number must have 7–12 digits" }
    ),
  roleId: z.string().min(1, "Role is required"),
});

export type UserFormValues = z.infer<typeof userSchema>;

// Re-export for page-level usage
export type CreateUserFormValues = UserFormValues;
export type EditUserFormValues = UserFormValues;

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: UserFormValues) => Promise<void>;
  editingUser?: SystemUser | null;
  roles: RoleListItem[];
  isLoading: boolean;
}

export default function UserModal({
  isOpen,
  onClose,
  onSubmit,
  editingUser,
  roles,
  isLoading,
}: UserModalProps) {
  const isEditing = Boolean(editingUser);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success view state for newly created users
  const [createdCredential, setCreatedCredential] = useState<{
    email: string;
    name: string;
    password: string;
  } | null>(null);
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);
  const [showInputPassword, setShowInputPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      phoneNumber: "",
      roleId: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
      setCreatedCredential(null);
      setShowCreatedPassword(false);
      setShowInputPassword(false);
      setCopied(false);
      if (editingUser) {
        reset({
          email: editingUser.email,
          password: "",
          firstName: editingUser.firstName,
          lastName: editingUser.lastName,
          phoneNumber: editingUser.phoneNumber || "",
          roleId: editingUser.role.id,
        });
      } else {
        reset({
          email: "",
          password: "",
          firstName: "",
          lastName: "",
          phoneNumber: "",
          roleId: roles.length > 0 ? roles[0].id : "",
        });
      }
    }
  }, [editingUser, isOpen, reset, roles]);

  const handleGeneratePassword = (e: React.MouseEvent) => {
    e.preventDefault();
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    let generated = "YT#";
    for (let i = 0; i < 9; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setValue("password", generated, { shouldValidate: true });
    setShowInputPassword(true);
  };

  const handleFormSubmit = async (values: CreateUserFormValues) => {
    setSubmitError(null);
    try {
      if (isEditing) {
        // Only send editable fields
        await onSubmit({
          firstName: values.firstName,
          lastName: values.lastName,
          phoneNumber: values.phoneNumber,
          roleId: values.roleId,
        } as CreateUserFormValues);
        reset();
        onClose();
      } else {
        // Validate required create fields
        if (!values.email || values.email.trim() === "") {
          setSubmitError("Email is required");
          return;
        }
        if (!values.password || values.password.length < 6) {
          setSubmitError("Password must be at least 6 characters");
          return;
        }
        await onSubmit(values);
        setCreatedCredential({
          email: values.email,
          name: `${values.firstName} ${values.lastName}`,
          password: values.password,
        });
      }
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { message?: string; errors?: string[] } };
      };
      const errorsArr = axiosErr?.response?.data?.errors;
      const message = axiosErr?.response?.data?.message;
      if (errorsArr && errorsArr.length > 0) {
        setSubmitError(errorsArr.join(". "));
      } else if (message) {
        setSubmitError(message);
      } else {
        setSubmitError("An unexpected error occurred. Please try again.");
      }
    }
  };

  const handleCancel = () => {
    setSubmitError(null);
    setCreatedCredential(null);
    reset();
    onClose();
  };

  const handleCopyPassword = async () => {
    if (!createdCredential) return;
    try {
      await navigator.clipboard.writeText(createdCredential.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-100 text-brand-600 border border-brand-200 shrink-0">
              <UserCog className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                {isEditing ? "Edit User Account" : "Create User Account"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {isEditing
                  ? `Update profile and role for ${editingUser?.firstName} ${editingUser?.lastName}`
                  : "Register a new staff member with assigned role and system credentials."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {submitError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {createdCredential ? (
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>User Account Created Successfully</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Account for <strong>{createdCredential.name}</strong> (
                <span className="font-mono">{createdCredential.email}</span>) is
                now registered and active.
              </p>
            </div>

            {/* Credential display box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Initial Password:</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                  Initial Credential
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    readOnly
                    type={showCreatedPassword ? "text" : "password"}
                    value={createdCredential.password}
                    className="h-10 font-mono text-xs font-bold tracking-wider bg-white pr-10 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatedPassword((prev) => !prev)}
                    aria-label={
                      showCreatedPassword ? "Hide password" : "Show password"
                    }
                    title={
                      showCreatedPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-600 transition-colors"
                  >
                    {showCreatedPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyPassword}
                  className="h-10 px-3 text-xs gap-1.5 shrink-0 bg-white"
                  title="Copy password to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">
                        Copied!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Single-view credential notice */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2 mt-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Single-view credential notice:</strong> This initial
                  password cannot be retrieved or viewed again after closing this
                  dialog or refreshing the page. YarnTrace stores only
                  irreversible cryptographic hashes. Please copy and securely
                  deliver this credential to the user now.
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="primary"
                type="button"
                onClick={handleCancel}
                className="w-full sm:w-auto h-9 text-xs"
              >
                Done & Return to Users
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(handleFormSubmit)}
            className="space-y-4 pt-1"
          >
            {/* Email & Password row (create only) */}
            {!isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label
                    htmlFor="user-email"
                    className="text-xs font-semibold text-slate-700 mb-1.5 block"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="user-email"
                    type="email"
                    placeholder="e.g. stockhead@yarntrace.com"
                    {...register("email")}
                    className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
                  />
                  {errors.email && (
                    <p className="text-[11px] font-medium text-red-500 mt-1">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label
                      htmlFor="user-password"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Initial Password <span className="text-red-500">*</span>
                    </Label>
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="user-password"
                      type={showInputPassword ? "text" : "password"}
                      placeholder="Min 6 characters or Auto-Generate"
                      {...register("password")}
                      className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowInputPassword((prev) => !prev)}
                      aria-label={
                        showInputPassword ? "Hide password" : "Show password"
                      }
                      title={
                        showInputPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-600 transition-colors"
                    >
                      {showInputPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[11px] font-medium text-red-500 mt-1">
                      {errors.password.message}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* Show email as read-only on edit */
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                  Email Address
                </Label>
                <div className="h-10 flex items-center px-3 rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-600">
                  {editingUser?.email}
                </div>
              </div>
            )}

            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="user-first-name"
                  className="text-xs font-semibold text-slate-700 mb-1.5 block"
                >
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="user-first-name"
                  placeholder="e.g. Ramesh"
                  {...register("firstName")}
                  className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
                />
                {errors.firstName && (
                  <p className="text-[11px] font-medium text-red-500 mt-1">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div>
                <Label
                  htmlFor="user-last-name"
                  className="text-xs font-semibold text-slate-700 mb-1.5 block"
                >
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="user-last-name"
                  placeholder="e.g. Kumar"
                  {...register("lastName")}
                  className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
                />
                {errors.lastName && (
                  <p className="text-[11px] font-medium text-red-500 mt-1">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            {/* Phone & Role row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label
                  htmlFor="user-phone"
                  className="text-xs font-semibold text-slate-700 mb-1.5 block"
                >
                  Phone / Mobile Number
                </Label>
                <Input
                  id="user-phone"
                  placeholder="e.g. +91 98123 45678"
                  {...register("phoneNumber")}
                  className="h-10 text-xs bg-slate-50/60 focus:bg-white font-mono"
                />
                {errors.phoneNumber && (
                  <p className="text-[11px] font-medium text-red-500 mt-1">
                    {errors.phoneNumber.message}
                  </p>
                )}
              </div>
              <div>
                <Label
                  htmlFor="user-role"
                  className="text-xs font-semibold text-slate-700 mb-1.5 block"
                >
                  Assigned Role <span className="text-red-500">*</span>
                </Label>
                <select
                  id="user-role"
                  {...register("roleId")}
                  className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
                >
                  <option value="">Select a role...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                      {role.isSystem ? " (System)" : ""}
                    </option>
                  ))}
                </select>
                {errors.roleId && (
                  <p className="text-[11px] font-medium text-red-500 mt-1">
                    {errors.roleId.message}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                variant="outline"
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="h-10 px-5 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isLoading}
                className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {isEditing ? "Save Changes" : "Create User Account"}
                </span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
