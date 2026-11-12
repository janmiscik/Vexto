
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = createClient();

      if (isRegistering) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        if (data.session) {
          router.push("/");
          router.refresh();
          return;
        }

        setMessage(
          "Registrácia prebehla. Skontrolujte e-mail a potvrďte registráciu."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push("/");
        router.refresh();
        return;
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Nastala neočakávaná chyba."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Vexto
        </h1>

        <h2 className="mb-6 text-lg font-semibold text-gray-700">
          {isRegistering ? "Vytvorenie účtu" : "Prihlásenie"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Heslo
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                isRegistering ? "new-password" : "current-password"
              }
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "Spracúvam..."
              : isRegistering
                ? "Zaregistrovať sa"
                : "Prihlásiť sa"}
          </button>
        </form>

        {message && (
          <p role="status" className="mt-4 text-sm text-gray-700">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setMessage("");
          }}
          className="mt-6 w-full text-sm text-blue-600 hover:underline"
        >
          {isRegistering
            ? "Už máte účet? Prihláste sa"
            : "Nemáte účet? Vytvorte si ho"}
        </button>
      </section>
    </main>
  );
}
