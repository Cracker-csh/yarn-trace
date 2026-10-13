import React, { useState, useEffect } from "react";
import {
  KeyRound,
  ShieldAlert,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
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
import { SystemUser } from "../../types/governance";
import { apiClient } from "../../lib/axios";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SystemUser | null;
  onSuccess: (userId: string, temporaryPassword: string) => void;
}

export default function ResetPasswordModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: ResetPasswordModalProps) {
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [customPassword, setCustomPassword] = useState("");
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success view state
  const [resultPassword, setResultPassword] = useState<string | null>(null);
  const [showResultPassword, setShowResultPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode("auto");
      setCustomPassword("");
      setShowCustomPassword(false);
      setReason("");
      setError(null);
      setResultPassword(null);
      setShowResultPassword(false);
      setCopied(false);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "custom" && customPassword.length < 6) {
      setError("Temporary password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);
    try {
      const payload: { temporaryPassword?: string; reason?: string } = {};
      if (mode === "custom" && customPassword.trim()) {
        payload.temporaryPassword = customPassword.trim();
      }
      if (reason.trim()) {
        payload.reason = reason.trim();
      }

      const res = await apiClient.post(
        `/users/${user.id}/reset-password`,
        payload
      );
      const generatedTempPassword = res.data.data.temporaryPassword;

      setResultPassword(generatedTempPassword);
      onSuccess(user.id, generatedTempPassword);
    } catch (err: unknown) {
      let message = "Failed to reset password. Please verify permissions.";
      if (err && typeof err === "object" && "response" in err) {
        const resp = (err as { response?: { data?: { message?: string } } }).response;
        if (resp?.data?.message) {
          message = resp.data.message;
        }
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultPassword) return;
    try {
      await navigator.clipboard.writeText(resultPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {resultPassword ? "Temporary Credential Issued" : "Reset User Password"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {user.firstName} {user.lastName} •{" "}
                <span className="font-mono text-slate-600">{user.email}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {resultPassword ? (
          /* Success Result View */
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Password Successfully Reset</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                The user&apos;s previous credentials and active sessions have been invalidated.
                Share this temporary credential with the user.
              </p>
            </div>

            {/* Temporary Credential Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">Temporary Password:</span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Temporary Credential
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    readOnly
                    type={showResultPassword ? "text" : "password"}
                    value={resultPassword}
                    className="h-10 font-mono text-xs font-bold tracking-wider bg-white pr-10 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResultPassword((prev) => !prev)}
                    aria-label={showResultPassword ? "Hide password" : "Show password"}
                    title={showResultPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-600 transition-colors"
                  >
                    {showResultPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-10 px-3 text-xs gap-1.5 shrink-0 bg-white"
                  title="Copy password to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[11px] text-slate-500 italic pt-1">
                Note: This temporary credential is safe to share with the user once. For security, YarnTrace stores only cryptographic hashes and never saves plaintext passwords.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="primary"
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto h-9 text-xs"
              >
                Done & Return to Users
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleReset} className="space-y-4 pt-1">
            {/* Cryptographic Security Notice */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0" />
                <span>Zero-Knowledge Credential Security</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Existing passwords are cryptographically hashed using bcrypt and cannot be retrieved or decrypted. Resetting creates a new temporary password and terminates any existing sessions.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Mode Selection */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-2 block">
                Reset Method
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("auto")}
                  className={`p-2.5 rounded-lg border text-left transition-all text-xs ${
                    mode === "auto"
                      ? "border-brand-500 bg-brand-50/50 text-slate-900 ring-1 ring-brand-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                    <span>Auto-Generate</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Secure 12-char random alphanumeric
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("custom")}
                  className={`p-2.5 rounded-lg border text-left transition-all text-xs ${
                    mode === "custom"
                      ? "border-brand-500 bg-brand-50/50 text-slate-900 ring-1 ring-brand-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <KeyRound className="h-3.5 w-3.5 text-slate-600" />
                    <span>Custom Temporary</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Set explicit temporary password
                  </p>
                </button>
              </div>
            </div>

            {/* Custom password field if selected */}
            {mode === "custom" && (
              <div>
                <Label htmlFor="custom-temp-pass" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                  New Temporary Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="custom-temp-pass"
                    type={showCustomPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    className="h-10 text-xs pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomPassword((prev) => !prev)}
                    aria-label={showCustomPassword ? "Hide password" : "Show password"}
                    title={showCustomPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-brand-600 transition-colors"
                  >
                    {showCustomPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Must be at least 6 characters long.
                </p>
              </div>
            )}

            {/* Administrative Reason (Optional) */}
            <div>
              <Label htmlFor="reset-reason" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Administrative Reason (Recorded in Audit Trail)
              </Label>
              <Input
                id="reset-reason"
                type="text"
                placeholder="e.g. Employee requested password reset"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-10 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isLoading}
                className="h-9 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700"
              >
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Issue Temporary Password</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
