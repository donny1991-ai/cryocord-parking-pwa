"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Field, Input, Select } from "@/components/ui/input";
import { labelize } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ParkingAdminUser } from "@/lib/server/admin-users";
import type { ParkingUserRole } from "@/db/entities";

const ROLE_OPTIONS = ["guard", "admin"] as const satisfies readonly ParkingUserRole[];
const ADMIN_REQUEST_TIMEOUT_MS = 15_000;

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  role: ParkingUserRole;
  active: boolean;
};

const emptyForm: UserFormState = {
  name: "",
  email: "",
  phone: "",
  role: "guard",
  active: true,
};

async function fetchAdminJson(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  if (externalSignal?.aborted) {
    controller.abort();
  }

  let timeout: number | undefined;
  const timeoutError = new Error("Request timed out. Please check the server connection and try again.");
  const requestTimeout = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, ADMIN_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(path, { ...init, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        return { response, payload };
      })(),
      requestTimeout,
    ]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export function UsersAdmin({ users, actorId }: { users: ParkingAdminUser[]; actorId: string }) {
  const [list, setList] = useState(users);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"idle" | "create" | "edit">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRequestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!busyId) return;

    const timeout = window.setTimeout(() => {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      setBusyId(null);
      setError("Request timed out. Please check the server connection and try again.");
    }, ADMIN_REQUEST_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [busyId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((user) =>
      [user.name, user.email, user.phone ?? "", user.role].some((value) => value.toLowerCase().includes(q)),
    );
  }, [list, query]);

  const counts = useMemo(
    () => ({
      active: list.filter((user) => user.active).length,
      admins: list.filter((user) => user.active && user.role === "admin").length,
      guards: list.filter((user) => user.active && user.role === "guard").length,
    }),
    [list],
  );

  function startCreate() {
    setError(null);
    setNotice(null);
    setEditingId(null);
    setForm(emptyForm);
    setMode((current) => (current === "create" ? "idle" : "create"));
  }

  function startEdit(user: ParkingAdminUser) {
    setError(null);
    setNotice(null);
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role,
      active: user.active,
    });
    setMode("edit");
  }

  function closeForm() {
    setMode("idle");
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId(mode === "edit" ? editingId : "new");
    setError(null);
    setNotice(null);

    const endpoint = mode === "edit" && editingId ? `/api/admin/users/${editingId}` : "/api/admin/users";
    const method = mode === "edit" ? "PUT" : "POST";
    const requestId = requestSeqRef.current + 1;
    const controller = new AbortController();
    requestSeqRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    try {
      const { response, payload } = await fetchAdminJson(endpoint, {
        method,
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone.trim() || null,
        }),
      });
      if (activeRequestRef.current?.id !== requestId) return;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save user.");
      }

      setList((current) => {
        const exists = current.some((user) => user.id === payload.user.id);
        if (exists) {
          return current.map((user) => (user.id === payload.user.id ? payload.user : user));
        }
        return [payload.user, ...current];
      });
      setNotice(mode === "edit" ? "User updated." : "User created.");
      closeForm();
    } catch (saveError) {
      if (activeRequestRef.current?.id !== requestId) return;
      setError(saveError instanceof Error ? saveError.message : "Unable to save user.");
    } finally {
      if (activeRequestRef.current?.id === requestId) {
        activeRequestRef.current = null;
        setBusyId(null);
      }
    }
  }

  async function deactivate(user: ParkingAdminUser) {
    if (!window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`)) {
      return;
    }

    setBusyId(user.id);
    setError(null);
    setNotice(null);
    const requestId = requestSeqRef.current + 1;
    const controller = new AbortController();
    requestSeqRef.current = requestId;
    activeRequestRef.current = { id: requestId, controller };

    try {
      const { response, payload } = await fetchAdminJson(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        signal: controller.signal,
      });
      if (activeRequestRef.current?.id !== requestId) return;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to deactivate user.");
      }

      setList((current) => current.map((item) => (item.id === user.id ? payload.user : item)));
      setNotice("User deactivated.");
    } catch (deleteError) {
      if (activeRequestRef.current?.id !== requestId) return;
      setError(deleteError instanceof Error ? deleteError.message : "Unable to deactivate user.");
    } finally {
      if (activeRequestRef.current?.id === requestId) {
        activeRequestRef.current = null;
        setBusyId(null);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Active" value={counts.active} />
        <MiniStat label="Admins" value={counts.admins} />
        <MiniStat label="Guards" value={counts.guards} />
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, role"
            className="pl-10"
          />
        </div>
        <Button
          variant={mode === "create" ? "glass" : "primary"}
          size="lg"
          onClick={startCreate}
          aria-label={mode === "create" ? "Close create user form" : "Create user"}
        >
          {mode === "create" ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>

      {error && (
        <GlassCard variant="bare" padding="sm" className="border-brand/25 bg-brand/10 text-sm font-semibold text-brand">
          {error}
        </GlassCard>
      )}
      {notice && !error && (
        <GlassCard variant="bare" padding="sm" className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </GlassCard>
      )}

      {mode !== "idle" && (
        <UserForm
          form={form}
          mode={mode}
          busy={mode === "create" ? busyId === "new" : busyId === editingId}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={submit}
        />
      )}

      <div className="space-y-2.5">
        {filtered.map((user) => (
          <GlassCard key={user.id} padding="md" className={cn("space-y-3", !user.active && "opacity-70")}>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  user.role === "admin" ? "bg-brand/12" : "bg-emerald-500/12",
                )}
              >
                {user.role === "admin" ? (
                  <Shield className="h-5 w-5 text-brand" />
                ) : (
                  <UserRound className="h-5 w-5 text-emerald-700" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-bold text-ink">{user.name}</h2>
                  <Chip tone={user.role === "admin" ? "brand" : "neutral"}>{labelize(user.role)}</Chip>
                  <Chip className={user.active ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : ""}>
                    {user.active ? "Active" : "Inactive"}
                  </Chip>
                  {user.id === actorId && <Chip tone="brand">You</Chip>}
                </div>
                <div className="mt-1 space-y-1 text-xs text-ink-faint">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                  {user.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {user.phone}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => startEdit(user)} disabled={busyId !== null}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              {user.active ? (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => deactivate(user)}
                  disabled={busyId !== null || user.id === actorId}
                >
                  <Trash2 className="h-4 w-4" />
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => startEdit(user)}
                  disabled={busyId !== null}
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </Button>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-ink-faint">No users match this search.</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard padding="sm" className="space-y-1 rounded-2xl">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="text-2xl font-black text-ink">{value}</p>
    </GlassCard>
  );
}

function UserForm({
  form,
  mode,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  form: UserFormState;
  mode: "create" | "edit";
  busy: boolean;
  onChange: (form: UserFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <GlassCard variant="strong" padding="lg">
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">{mode === "edit" ? "Edit user" : "Create user"}</h2>
            <p className="text-xs text-ink-faint">OTP login will use this email.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close user form">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Field label="Full name" required>
          <Input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="Full name"
            maxLength={160}
            required
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(event) => onChange({ ...form, email: event.target.value })}
            placeholder="name@cryocord.com.my"
            maxLength={320}
            required
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone}
            onChange={(event) => onChange({ ...form, phone: event.target.value })}
            placeholder="+60..."
            maxLength={40}
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Role" required>
            <Select
              value={form.role}
              onChange={(event) => onChange({ ...form, role: event.target.value as ParkingUserRole })}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {labelize(role)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex h-12 items-center gap-2 rounded-2xl border border-white/60 bg-white/55 px-4 text-sm font-bold text-ink-soft backdrop-blur-md">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={form.active}
              onChange={(event) => onChange({ ...form, active: event.target.checked })}
            />
            Active
          </label>
        </div>

        <Button className="w-full" disabled={busy || !form.name.trim() || !form.email.trim()}>
          {mode === "edit" ? <CheckCircle2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {busy ? "Saving..." : mode === "edit" ? "Save changes" : "Create user"}
        </Button>
      </form>
    </GlassCard>
  );
}
